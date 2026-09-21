import { timingSafeEqual } from 'node:crypto';
import { NextResponse } from 'next/server';
import { getSupabaseServiceClient } from '../../../../lib/server/aspireServer';
import { ambassadorBounceSyncConfigured, syncAmbassadorBounces } from '../../../../lib/server/ambassadorBounceSync';

export const runtime = 'nodejs';
export const maxDuration = 60;

function authorized(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const received = Buffer.from(request.headers.get('authorization') || '');
  const expected = Buffer.from(`Bearer ${secret}`);
  return received.length === expected.length && timingSafeEqual(received, expected);
}

export async function GET(request: Request) {
  if (!process.env.CRON_SECRET) {
    return NextResponse.json(
      { error: 'Cron authentication is not configured.' },
      { status: 503, headers: { 'Cache-Control': 'no-store' } }
    );
  }
  if (!authorized(request)) {
    return NextResponse.json(
      { error: 'Unauthorized.' },
      { status: 401, headers: { 'Cache-Control': 'no-store' } }
    );
  }
  if (!ambassadorBounceSyncConfigured()) {
    return NextResponse.json(
      { error: 'Ambassador mailbox sync is not configured.' },
      { status: 503, headers: { 'Cache-Control': 'no-store' } }
    );
  }

  try {
    const result = await syncAmbassadorBounces(getSupabaseServiceClient());
    return NextResponse.json(
      {
        ok: result.ok,
        checked: result.checked,
        bounced: result.bounced,
        skipped: result.skipped
      },
      {
        status: result.ok ? 200 : 502,
        headers: { 'Cache-Control': 'no-store' }
      }
    );
  } catch (error) {
    console.error('ambassador bounce cron failed', error);
    return NextResponse.json(
      { error: 'Ambassador bounce reconciliation failed.' },
      { status: 502, headers: { 'Cache-Control': 'no-store' } }
    );
  }
}
