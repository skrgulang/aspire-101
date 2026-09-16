import { NextResponse } from 'next/server';
import {
  getAuthenticatedUser,
  getSupabaseServiceClient,
  publicOrigin,
  stripeLivemode,
  stripeRequest
} from '../../../../../../lib/server/aspireServer';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type StripeAccountLink = { url: string };

async function requireAdmin(request: Request) {
  const { user } = await getAuthenticatedUser(request);
  const supabase = getSupabaseServiceClient();
  const { data, error } = await supabase
    .from('user_roles')
    .select('role')
    .eq('user_id', user.id)
    .maybeSingle();
  if (error) throw error;
  if (data?.role !== 'admin') throw new Error('ADMIN_REQUIRED');
  return { supabase };
}

function errorResponse(error: unknown) {
  const message = error instanceof Error ? error.message : '';
  if (message === 'AUTH_REQUIRED') return NextResponse.json({ error: 'Sign in again to continue.' }, { status: 401 });
  if (message === 'ADMIN_REQUIRED') return NextResponse.json({ error: 'Admin access required.' }, { status: 403 });
  if (message === 'TEST_MODE_REQUIRED') return NextResponse.json({ error: 'This support tool is available only in Stripe sandbox mode.' }, { status: 409 });
  if (message === 'PAYMENT_ACCOUNT_NOT_FOUND') return NextResponse.json({ error: 'Sandbox payout account not found.' }, { status: 404 });
  if (message.startsWith('MISSING_ENV:')) return NextResponse.json({ error: 'Stripe sandbox is not configured for this deployment.' }, { status: 503 });
  if (message.startsWith('STRIPE:')) return NextResponse.json({ error: message.slice(7) }, { status: 502 });
  console.error('admin Stripe onboarding error', error);
  return NextResponse.json({ error: 'Could not create the sandbox onboarding link.' }, { status: 500 });
}

export async function POST(request: Request) {
  try {
    if (stripeLivemode()) throw new Error('TEST_MODE_REQUIRED');
    const { supabase } = await requireAdmin(request);
    const body = await request.json().catch(() => ({})) as { userId?: string };
    const userId = String(body.userId || '').trim();
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(userId)) {
      return NextResponse.json({ error: 'Valid user id required.' }, { status: 400 });
    }

    const { data: paymentAccount, error } = await supabase
      .from('payment_accounts')
      .select('stripe_account_id')
      .eq('user_id', userId)
      .eq('livemode', false)
      .maybeSingle();
    if (error) throw error;
    const stripeAccountId = String(paymentAccount?.stripe_account_id || '');
    if (!stripeAccountId.startsWith('acct_')) throw new Error('PAYMENT_ACCOUNT_NOT_FOUND');

    const origin = publicOrigin(request);
    if (!origin.startsWith('https://')) throw new Error('MISSING_ENV:NEXT_PUBLIC_SITE_URL');
    const accountLink = await stripeRequest<StripeAccountLink>('/v2/core/account_links', {
      method: 'POST',
      body: JSON.stringify({
        account: stripeAccountId,
        use_case: {
          type: 'account_onboarding',
          account_onboarding: {
            configurations: ['recipient'],
            refresh_url: `${origin}/transactions?payments=refresh`,
            return_url: `${origin}/transactions?payments=return`,
            collection_options: { fields: 'eventually_due' }
          }
        }
      })
    });

    return NextResponse.json({ url: accountLink.url }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return errorResponse(error);
  }
}
