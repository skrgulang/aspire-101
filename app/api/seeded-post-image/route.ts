import { NextRequest, NextResponse } from 'next/server';

const ASSET_COMMIT = '4a111e628e0c4a8b19ceca425f26205c949e8cd0';
const SOURCES: Record<string, string> = {
  corec: `https://raw.githubusercontent.com/skrgulang/aspire-101/${ASSET_COMMIT}/public/seeded/corec.webp`,
  gaming: `https://raw.githubusercontent.com/skrgulang/aspire-101/${ASSET_COMMIT}/public/seeded/gaming.webp`
};

export async function GET(request: NextRequest) {
  const key = request.nextUrl.searchParams.get('name') || '';
  const source = SOURCES[key];
  if (!source) return NextResponse.json({ error: 'Unknown seeded image.' }, { status: 404 });

  try {
    const upstream = await fetch(source, { cache: 'force-cache' });
    if (!upstream.ok) return NextResponse.json({ error: 'Seeded image unavailable.' }, { status: 502 });

    const bytes = await upstream.arrayBuffer();
    return new NextResponse(bytes, {
      status: 200,
      headers: {
        'content-type': 'image/webp',
        'cache-control': 'public, max-age=86400, s-maxage=2592000, stale-while-revalidate=604800'
      }
    });
  } catch {
    return NextResponse.json({ error: 'Seeded image unavailable.' }, { status: 502 });
  }
}
