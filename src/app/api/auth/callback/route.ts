import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get('code');

  if (!code) {
    return NextResponse.json({ error: 'No code provided' }, { status: 400 });
  }

  const client_id = process.env.SPOTIFY_CLIENT_ID;
  const client_secret = process.env.SPOTIFY_CLIENT_SECRET;

  const host = request.headers.get('host') || '';
  const protocol = host.includes('localhost') ? 'http' : 'https';
  const redirect_uri = `${protocol}://${host}/api/auth/callback`;

  const basic = Buffer.from(`${client_id}:${client_secret}`).toString('base64');

  try {
    const res = await fetch('https://accounts.spotify.com/api/token', {
      method: 'POST',
      headers: {
        Authorization: `Basic ${basic}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code: code,
        redirect_uri: redirect_uri,
      }),
    });

    const data = await res.json();

    if (data.refresh_token) {
      return new Response(
        `<h1>Authorization Successful!</h1>
        <p>Copy this <b>SPOTIFY_REFRESH_TOKEN</b> into your Vercel Environment Variables:</p>
        <pre style="background:#eee;padding:15px;border-radius:8px;">${data.refresh_token}</pre>`,
        { headers: { 'Content-Type': 'text/html' } }
      );
    }

    return NextResponse.json(data);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}