import { NextResponse } from 'next/server';

export async function GET() {
  const client_id = process.env.SPOTIFY_CLIENT_ID;
  const redirect_uri = process.env.SPOTIFY_REDIRECT_URI;

  const scope = 'playlist-modify-public playlist-modify-private user-read-currently-playing';

  const params = new URLSearchParams({
    response_type: 'code',
    client_id: client_id || '',
    scope: scope,
    redirect_uri: redirect_uri || '',
    show_dialog: 'true',
  });

  return NextResponse.redirect(`https://accounts.spotify.com/authorize?${params.toString()}`);
}