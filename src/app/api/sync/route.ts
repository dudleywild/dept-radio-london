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
      console.error("Sync Error: Failed to get access token", tokenData);
      return NextResponse.json({ error: "Failed to refresh token", details: tokenData }, { status: 401 });
    }

    const accessToken = tokenData.access_token;
    const playlistId = process.env.SPOTIFY_PLAYLIST_ID;

    // 1. Get currently playing track from Spotify
    const nowPlayingRes = await fetch("https://api.spotify.com/v1/me/player/currently-playing", {
      headers: { Authorization: `Bearer ${accessToken}` },
      cache: "no-store",
    });

    if (nowPlayingRes.status === 204 || nowPlayingRes.status > 400) {
      return NextResponse.json({ message: "Nothing actively playing on Spotify" });
    }

    const nowPlayingData = await nowPlayingRes.json();
    const currentSpotifyId = nowPlayingData?.item?.id;

    if (!currentSpotifyId) {
      return NextResponse.json({ message: "No active track ID found" });
    }

    // 2. Fetch all songs currently in Supabase queue
    const { data: queue, error: dbError } = await supabase.from("queue").select("*");

    if (dbError || !queue) {
      return NextResponse.json({ error: "Database fetch failed", details: dbError }, { status: 500 });
    }

    // 3. Find if current song is in our queue
    const currentTrackInQueue = queue.find((song) => song.spotify_id === currentSpotifyId);

    if (currentTrackInQueue) {
      // Find all songs in queue that came BEFORE this track or aren't current
      // Delete any song that was played before the current track
      const playedSongs = queue.filter((song) => song.created_at < currentTrackInQueue.created_at);

      for (const song of playedSongs) {
        // Remove from Spotify Playlist
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

        // Remove from Supabase Queue
        await supabase.from("queue").delete().eq("id", song.id);
      }

      return NextResponse.json({
        status: "synced",
        currentlyPlaying: currentTrackInQueue.title,
        removedCount: playedSongs.length,
      });
    }

    return NextResponse.json({ status: "no action needed", currentSpotifyId });
  } catch (err: any) {
    console.error("Sync Exception:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}