import { NextResponse } from 'next/server';
import {
  apiError,
  getAuthenticatedUser,
  getSupabaseServiceClient,
  stripeFormRequest,
  stripeRequest
} from '../../../../../../lib/server/aspireServer';

type StripeAccount = { id: string };
type AccountSession = { client_secret: string };

export async function POST(request: Request) {
  try {
    const { user } = await getAuthenticatedUser(request);
    const supabase = getSupabaseServiceClient();

    const [{ data: verification }, { data: profile }, { data: paymentAccount }] = await Promise.all([
      supabase.from('school_verifications').select('status').eq('user_id', user.id).maybeSingle(),
      supabase.from('profiles').select('display_name,name,full_name').eq('id', user.id).maybeSingle(),
      supabase.from('payment_accounts').select('*').eq('user_id', user.id).maybeSingle()
    ]);

    if (verification?.status !== 'verified') throw new Error('SCHOOL_REQUIRED');

    let stripeAccountId = paymentAccount?.stripe_account_id as string | null | undefined;
    if (!stripeAccountId) {
      const displayName = profile?.display_name || profile?.full_name || profile?.name || user.email?.split('@')[0] || 'Aspire provider';
      const account = await stripeRequest<StripeAccount>('/v2/core/accounts', {
        method: 'POST',
        body: JSON.stringify({
          contact_email: user.email || undefined,
          display_name: displayName,
          defaults: {
            responsibilities: {
              fees_collector: 'application',
              losses_collector: 'application'
            }
          },
          dashboard: 'express',
          identity: { country: 'us' },
          configuration: {
            recipient: {
              capabilities: {
                stripe_balance: {
                  stripe_transfers: { requested: true }
                }
              }
            }
          },
          include: ['configuration.recipient', 'identity', 'requirements']
        })
      });
      stripeAccountId = account.id;

      const { error: saveError } = await supabase.from('payment_accounts').upsert({
        user_id: user.id,
        stripe_account_id: stripeAccountId,
        provider: 'stripe',
        status: 'ACTION_REQUIRED',
        transfers_enabled: false,
        requirements_due: 1,
        last_synced_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }, { onConflict: 'user_id' });
      if (saveError) throw saveError;
    }

    const accountSession = await stripeFormRequest<AccountSession>('/v1/account_sessions', {
      account: stripeAccountId,
      'components[account_onboarding][enabled]': true
    });

    if (!accountSession.client_secret) throw new Error('STRIPE:Could not create an embedded payout setup session.');

    return NextResponse.json({
      clientSecret: accountSession.client_secret,
      accountId: stripeAccountId
    });
  } catch (error) {
    const resolved = apiError(error);
    return NextResponse.json(resolved.body, { status: resolved.status });
  }
}
