import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get('code');

  if (!code) {
    return NextResponse.json({ error: 'No authorization code provided by Spotify.' }, { status: 400 });
  }

  const client_id = process.env.SPOTIFY_CLIENT_ID;
  const client_secret = process.env.SPOTIFY_CLIENT_SECRET;
  const redirect_uri = process.env.SPOTIFY_REDIRECT_URI;

  const basic = Buffer.from(`${client_id}:${client_secret}`).toString('base64');

  try {
    const response = await fetch('https://accounts.spotify.com/api/token', {
      method: 'POST',
      headers: {
        Authorization: `Basic ${basic}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code: code,
        redirect_uri: redirect_uri || '',
      }),
    });

    const data = await response.json();
    
    // THIS TRAPS THE TOKEN IN YOUR VS CODE TERMINAL
    console.log("=== SPOTIFY TOKEN CAUGHT ===");
    console.log(data);
    console.log("============================");

    if (!response.ok) {
      return NextResponse.json({ error: 'Spotify Token Error', details: data }, { status: response.status });
    }

    return NextResponse.json({
      message: "Check your VS Code terminal for the token!",
      refresh_token: data.refresh_token,
    });
  } catch (error: any) {
    return NextResponse.json({ error: 'Failed to complete handshake', message: error.message }, { status: 500 });
  }
}