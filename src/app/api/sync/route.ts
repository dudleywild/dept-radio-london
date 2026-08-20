import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase'; // Adjust this import if your supabase client is somewhere else!

export async function POST() {
  try {
    console.log("Starting Spotify Sync...");

    // 1. Get a fresh Access Token using your Refresh Token
    const basic = Buffer.from(`${process.env.SPOTIFY_CLIENT_ID}:${process.env.SPOTIFY_CLIENT_SECRET}`).toString('base64');
    const tokenRes = await fetch('https://accounts.spotify.com/api/token', {
      method: 'POST',
      headers: {
        Authorization: `Basic ${basic}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: process.env.SPOTIFY_REFRESH_TOKEN || '',
      }),
    });
    
    const tokenData = await tokenRes.json();
    if (!tokenRes.ok) {
      console.error("TOKEN ERROR:", tokenData);
      return NextResponse.json({ error: 'Failed to refresh token', details: tokenData }, { status: 401 });
    }
    const access_token = tokenData.access_token;

    // 2. Fetch the current queue from your database
    const { data: queue, error: dbError } = await supabase
      .from('queue')
      .select('spotify_id')
      .order('upvotes', { ascending: false })
      .order('created_at', { ascending: true });
      
    if (dbError) throw dbError;

    // 3. Send the updated queue to the Spotify Playlist
    const uris = queue.map((song: any) => `spotify:track:${song.spotify_id}`);
    const playlistId = process.env.SPOTIFY_PLAYLIST_ID;
    
    const syncRes = await fetch(`https://api.spotify.com/v1/playlists/${playlistId}/items`, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${access_token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ uris }),
    });

    if (!syncRes.ok) {
        const syncData = await syncRes.json();
        console.error("=== SPOTIFY SYNC REJECTED ===");
        console.error(syncData);
        return NextResponse.json({ error: 'Spotify Sync Error', details: syncData }, { status: syncRes.status });
    }

    console.log(`=== SYNC SUCCESS! Pushed ${uris.length} songs to Spotify ===`);
    return NextResponse.json({ success: true, synced: uris.length });

  } catch (err: any) {
    console.error("SYNC FATAL ERROR:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}