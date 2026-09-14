import { timingSafeEqual } from 'node:crypto';
import { NextResponse } from 'next/server';
import { getSupabaseServiceClient } from '../../../../lib/server/aspireServer';

export const runtime = 'nodejs';
export const maxDuration = 60;

function authorized(request: Request) {
  const secret = process.env.CRON_SECRET;
  const authorization = request.headers.get('authorization') || '';
  if (!secret) return false;
  const expected = `Bearer ${secret}`;
  const receivedBytes = Buffer.from(authorization);
  const expectedBytes = Buffer.from(expected);
  return receivedBytes.length === expectedBytes.length && timingSafeEqual(receivedBytes, expectedBytes);
}

export async function GET(request: Request) {
  if (!process.env.CRON_SECRET) return NextResponse.json({ error: 'Moderation retry is not configured.' }, { status: 503 });
  if (!authorized(request)) return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });

  const supabase = getSupabaseServiceClient();
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await supabase
    .from('requests')
    .select('id')
    .eq('moderation_status', 'pending')
    .in('ai_moderation_status', ['not_scanned', 'error'])
    .gte('created_at', sevenDaysAgo)
    .order('created_at', { ascending: true })
    .limit(8);

  if (error) return NextResponse.json({ error: 'Could not load the moderation retry queue.' }, { status: 500 });
  const secret = process.env.CRON_SECRET;
  const endpoint = new URL('/api/moderation/request', request.url);
  const results = await Promise.all((data ?? []).map(async ({ id }) => {
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { Authorization: `Bearer ${secret}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ requestId: id }),
        cache: 'no-store'
      });
      return { id, ok: response.ok, status: response.status };
    } catch {
      return { id, ok: false, status: 0 };
    }
  }));

  return NextResponse.json({
    queued: results.length,
    completed: results.filter((result) => result.ok).length,
    failed: results.filter((result) => !result.ok).length
  });
}
