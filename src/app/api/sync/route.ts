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
      console.error("Token Error:", tokenData);
      return NextResponse.json({ error: "Failed to refresh token", tokenData }, { status: 401 });
    }

    const accessToken = tokenData.access_token;
    const playlistId = process.env.SPOTIFY_PLAYLIST_ID;

    // 1. Get queue from Supabase (ordered by votes)
    const { data: queue, error: dbError } = await supabase
      .from("queue")
      .select("*")
      .order("upvotes", { ascending: false })
      .order("created_at", { ascending: true });

    if (dbError || !queue) {
      return NextResponse.json({ error: "Supabase error", details: dbError }, { status: 500 });
    }

    // 2. Fetch current tracks in Spotify Playlist
    const playlistRes = await fetch(`https://api.spotify.com/v1/playlists/${playlistId}/tracks`, {
      headers: { Authorization: `Bearer ${accessToken}` },
      cache: "no-store",
    });
    const playlistData = await playlistRes.json();
    
    // Extract Spotify track IDs currently in the playlist
    const existingSpotifyIds = (playlistData.items || [])
      .map((item: any) => item.track?.id)
      .filter(Boolean);

    // 3. ADD MISSING SONGS TO SPOTIFY PLAYLIST
    const missingSongs = queue.filter((song) => !existingSpotifyIds.includes(song.spotify_id));

    if (missingSongs.length > 0) {
      const urisToAdd = missingSongs.map((song) => `spotify:track:${song.spotify_id}`);
      
      await fetch(`https://api.spotify.com/v1/playlists/${playlistId}/tracks`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ uris: urisToAdd }),
      });
    }

    // 4. CHECK CURRENTLY PLAYING AND DELETE PREVIOUS SONGS
    const nowPlayingRes = await fetch("https://api.spotify.com/v1/me/player/currently-playing", {
      headers: { Authorization: `Bearer ${accessToken}` },
      cache: "no-store",
    });

    if (nowPlayingRes.status === 200) {
      const nowPlayingData = await nowPlayingRes.json();
      const currentSpotifyId = nowPlayingData?.item?.id;

      if (currentSpotifyId) {
        // Find if currently playing track is in our queue
        const currentTrackIndex = queue.findIndex((song) => song.spotify_id === currentSpotifyId);

        if (currentTrackIndex > 0) {
          // Remove all songs that were queued BEFORE the currently playing song
          const playedSongs = queue.slice(0, currentTrackIndex);

          for (const song of playedSongs) {
            // Delete from Spotify playlist
            await fetch(`https://api.spotify.com/v1/playlists/${playlistId}/tracks`, {
              method: "DELETE",
              headers: {
                Authorization: `Bearer ${accessToken}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                tracks: [{ uri: `spotify:track:${song.spotify_id}` }],
              }),
            });

            // Delete from Supabase queue
            await supabase.from("queue").delete().eq("id", song.id);
          }
        }
      }
    }

    return NextResponse.json({
      success: true,
      addedCount: missingSongs.length,
      queueLength: queue.length,
    });
  } catch (err: any) {
    console.error("Sync Exception:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}