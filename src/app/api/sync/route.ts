import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

async function getAccessToken() {
  const client_id = process.env.SPOTIFY_CLIENT_ID;
  const client_secret = process.env.SPOTIFY_CLIENT_SECRET;
  const refresh_token = process.env.SPOTIFY_REFRESH_TOKEN;

  const basic = Buffer.from(`${client_id}:${client_secret}`).toString("base64");

  const response = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: {
      Authorization: `Basic ${basic}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refresh_token || "",
    }),
    cache: "no-store",
  });

  return response.json();
}

export async function POST() {
  try {
    const tokenData = await getAccessToken();

    if (!tokenData.access_token) {
      return NextResponse.json({ error: "Failed to refresh token", tokenData }, { status: 401 });
    }

    const accessToken = tokenData.access_token;
    const playlistId = process.env.SPOTIFY_PLAYLIST_ID;

    // 1. Get queue from Supabase
    const { data: queue } = await supabase.from("queue").select("*").order("created_at", { ascending: true });
    
    if (!queue) {
      return NextResponse.json({ error: "Supabase error: Could not fetch queue" }, { status: 500 });
    }

    // 2. Fetch current tracks in Spotify Playlist
    const playlistRes = await fetch(`https://api.spotify.com/v1/playlists/${playlistId}/tracks`, {
      headers: { Authorization: `Bearer ${accessToken}` },
      cache: "no-store",
    });
    const playlistData = await playlistRes.json();
    
    // IF SPOTIFY BLOCKS READING THE PLAYLIST:
    if (!playlistRes.ok) {
        return NextResponse.json({ error: "Spotify rejected reading the playlist", spotifyError: playlistData });
    }

    const existingSpotifyIds = (playlistData.items || []).map((item: any) => item.track?.id).filter(Boolean);
    const missingSongs = queue.filter((song) => song.spotify_id && !existingSpotifyIds.includes(song.spotify_id));

    // 3. Add to Spotify in chunks of 100 (Spotify API hard limit per request)
    if (missingSongs.length > 0) {
      const urisToAdd = missingSongs.map((song) => `spotify:track:${song.spotify_id}`);
      const chunkSize = 100;

      for (let i = 0; i < urisToAdd.length; i += chunkSize) {
        const chunk = urisToAdd.slice(i, i + chunkSize);

        const addRes = await fetch(`https://api.spotify.com/v1/playlists/${playlistId}/tracks`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ uris: chunk }),
        });

        const addData = await addRes.json();

        // IF SPOTIFY BLOCKS ADDING THE SONGS:
        if (!addRes.ok) {
            return NextResponse.json({ error: "Spotify rejected adding the songs", spotifyError: addData });
        }
      }
    }

    return NextResponse.json({ 
        success: true, 
        songsTriedToAdd: missingSongs.length 
    });

  } catch (err: any) {
    return NextResponse.json({ error: "Code crash", message: err.message }, { status: 500 });
  }
}