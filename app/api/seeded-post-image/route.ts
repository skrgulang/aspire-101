import { NextResponse } from 'next/server';

export async function GET() {
  return NextResponse.json({ error: 'Seeded images are served as local static assets.' }, { status: 410 });
}
