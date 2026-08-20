import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export async function GET(request: Request) {
  try {
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
    
    const { access_token } = await tokenRes.json();

    // Fetch currently playing track
    const nowPlayingRes = await fetch('https://api.spotify.com/v1/me/player/currently-playing', {
      headers: { Authorization: `Bearer ${access_token}` },
    });

    if (nowPlayingRes.status === 200) {
      const data = await nowPlayingRes.json();
      const playingId = data.item?.id;
      const isPlaying = data.is_playing;

      if (playingId && isPlaying) {
        // Check if track is still in our database before deleting
        const { data: existing } = await supabase.from('queue').select('id').eq('spotify_id', playingId).single();

        if (existing) {
          console.log(`[NOW PLAYING] Active track detected: ${data.item?.name}. Removing from database and Spotify playlist...`);
          
          // 1. Delete from Supabase
          await supabase.from('queue').delete().eq('spotify_id', playingId);

          // 2. Trigger Spotify Sync to remove it from the Spotify playlist too
          const origin = new URL(request.url).origin;
          await fetch(`${origin}/api/sync`, { method: 'POST' });
        }
      }
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error('NOW PLAYING ERROR:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}