import { NextResponse } from 'next/server';
import { apiError, getAuthenticatedUser, getSupabaseServiceClient, publicOrigin, stripeRequest } from '../../../../../lib/server/aspireServer';

type StripeAccount = { id: string };
type StripeAccountLink = { url: string };

export async function POST(request: Request) {
  try {
    const { user } = await getAuthenticatedUser(request);
    if (!user.phone_confirmed_at) throw new Error('PHONE_REQUIRED');

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
            refresh_url: `${origin}/profile?payments=refresh`,
            return_url: `${origin}/profile?payments=return`,
            collection_options: { fields: 'eventually_due' }
          }
        }
      })
    });

    return NextResponse.json({ url: accountLink.url, status: 'ACTION_REQUIRED' });
  } catch (error) {
    const resolved = apiError(error);
    return NextResponse.json(resolved.body, { status: resolved.status });
  }
}
