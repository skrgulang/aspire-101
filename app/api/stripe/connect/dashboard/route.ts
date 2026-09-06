import { NextResponse } from 'next/server';
import {
  apiError,
  getAuthenticatedUser,
  getSupabaseServiceClient,
  stripeFormRequest
} from '../../../../../lib/server/aspireServer';

type StripeLoginLink = { url?: string | null };

export async function POST(request: Request) {
  try {
    const { user } = await getAuthenticatedUser(request);
    const supabase = getSupabaseServiceClient();
    const { data: paymentAccount, error } = await supabase
      .from('payment_accounts')
      .select('stripe_account_id')
      .eq('user_id', user.id)
      .maybeSingle();

    if (error) throw error;
    const accountId = paymentAccount?.stripe_account_id as string | null | undefined;
    if (!accountId) {
      return NextResponse.json({
        error: 'Set up Stripe payouts first.',
        code: 'PAYOUT_ACCOUNT_NOT_STARTED'
      }, { status: 409 });
    }

    const loginLink = await stripeFormRequest<StripeLoginLink>(
      `/v1/accounts/${encodeURIComponent(accountId)}/login_links`,
      {}
    );

    if (!loginLink.url) {
      throw new Error('STRIPE:Stripe did not return an Express Dashboard link.');
    }

    return NextResponse.json({ url: loginLink.url });
  } catch (error) {
    const resolved = apiError(error);
    return NextResponse.json(resolved.body, { status: resolved.status });
  }
}
