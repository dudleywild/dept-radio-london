import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  const client_id = process.env.SPOTIFY_CLIENT_ID;
  
  // Dynamically determine redirect URI based on current request host
  const host = request.headers.get('host') || '';
  const protocol = host.includes('localhost') ? 'http' : 'https';
  const redirect_uri = `${protocol}://${host}/api/auth/callback`;

  const scope = 'playlist-modify-public playlist-modify-private user-read-currently-playing';

  const params = new URLSearchParams({
    response_type: 'code',
    client_id: client_id || '',
    scope: scope,
    redirect_uri: redirect_uri,
  });

  return NextResponse.redirect(`https://accounts.spotify.com/authorize?${params.toString()}`);
}