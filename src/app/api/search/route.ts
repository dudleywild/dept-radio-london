import { NextResponse } from 'next/server';
import { searchSongs } from '@/lib/spotify';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const q = searchParams.get('q');
  
  if (!q) return NextResponse.json({ tracks: { items: [] } });
  
  const data = await searchSongs(q);
  return NextResponse.json(data);
}