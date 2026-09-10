import { NextRequest, NextResponse } from 'next/server';

const SOURCES: Record<string, string> = {
  corec: 'https://img.athleticbusiness.com/files/base/abmedia/all/image/projects/2014/03/arch_FOM/2014/large/1024A-614-AB_Purdue.jpg',
  gaming: 'https://img.athleticbusiness.com/files/base/abmedia/all/images/projects/2025/05/view-walking-into-apgl.UH7s8fPwux.jpg'
};

export async function GET(request: NextRequest) {
  const key = request.nextUrl.searchParams.get('name') || '';
  const source = SOURCES[key];
  if (!source) return NextResponse.json({ error: 'Unknown seeded image.' }, { status: 404 });

  try {
    const upstream = await fetch(source, {
      headers: {
        'user-agent': 'Mozilla/5.0 Aspire101/1.0',
        accept: 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8'
      },
      next: { revalidate: 60 * 60 * 24 * 30 }
    });

    if (!upstream.ok) {
      return NextResponse.json({ error: 'Image source unavailable.' }, { status: 502 });
    }

    const bytes = await upstream.arrayBuffer();
    return new NextResponse(bytes, {
      status: 200,
      headers: {
        'content-type': upstream.headers.get('content-type') || 'image/jpeg',
        'cache-control': 'public, max-age=86400, s-maxage=2592000, stale-while-revalidate=604800'
      }
    });
  } catch {
    return NextResponse.json({ error: 'Image source unavailable.' }, { status: 502 });
  }
}
