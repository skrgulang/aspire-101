import { timingSafeEqual } from 'node:crypto';
import { NextResponse } from 'next/server';
import { getSupabaseServiceClient } from '../../../../lib/server/aspireServer';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

function present(name: string) {
  return Boolean(process.env[name]?.trim());
}

function cronAuthorized(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const received = Buffer.from(request.headers.get('authorization') || '');
  const expected = Buffer.from(`Bearer ${secret}`);
  return received.length === expected.length && timingSafeEqual(received, expected);
}

async function checkSupabase() {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 4000);
  try {
    const supabase = getSupabaseServiceClient();
    const { error } = await supabase
      .from('universities')
      .select('id', { count: 'exact', head: true })
      .limit(1)
      .abortSignal(controller.signal);
    return { reachable: !error };
  } catch {
    return { reachable: false };
  } finally {
    clearTimeout(timeout);
  }
}

export async function GET(request: Request) {
  if (!present('CRON_SECRET')) {
    return NextResponse.json(
      { status: 'not_ready', error: 'Readiness authentication is not configured.' },
      { status: 503, headers: { 'Cache-Control': 'no-store, max-age=0' } }
    );
  }
  if (!cronAuthorized(request)) {
    return NextResponse.json(
      { error: 'Unauthorized.' },
      { status: 401, headers: { 'Cache-Control': 'no-store, max-age=0' } }
    );
  }

  const supabaseConfigured =
    present('NEXT_PUBLIC_SUPABASE_URL') &&
    (present('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY') || present('NEXT_PUBLIC_SUPABASE_ANON_KEY')) &&
    present('SUPABASE_SERVICE_ROLE_KEY');

  const supabase = supabaseConfigured ? await checkSupabase() : { reachable: false };
  const coreReady = supabaseConfigured && supabase.reachable;

  return NextResponse.json(
    {
      status: coreReady ? 'ready' : 'not_ready',
      core: {
        supabaseConfigured,
        supabaseReachable: supabase.reachable,
        cronAuthenticationConfigured: true
      },
      optional: {
        emailWebhookConfigured: present('RESEND_WEBHOOK_SIGNING_SECRET'),
        shippingConfigured: present('SHIPPO_API_KEY') && present('SHIPPO_WEBHOOK_TOKEN'),
        paymentsConfigured: present('STRIPE_SECRET_KEY') && present('STRIPE_WEBHOOK_SECRET'),
        ambassadorMailConfigured: present('AMBASSADOR_SMTP_PASSWORD')
      },
      checkedAt: new Date().toISOString()
    },
    {
      status: coreReady ? 200 : 503,
      headers: { 'Cache-Control': 'no-store, max-age=0' }
    }
  );
}
