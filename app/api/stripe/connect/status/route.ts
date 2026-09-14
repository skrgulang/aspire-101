import { NextResponse } from 'next/server';
import { apiError, getAuthenticatedUser, getStripePayoutState, getSupabaseServiceClient, stripeLivemode } from '../../../../../lib/server/aspireServer';

export async function GET(request: Request) {
  try {
    const { user } = await getAuthenticatedUser(request);
    const supabase = getSupabaseServiceClient();
    const livemode = stripeLivemode();
    const { data: paymentAccount, error } = await supabase
      .from('payment_accounts')
      .select('*')
      .eq('user_id', user.id)
      .eq('livemode', livemode)
      .maybeSingle();
    if (error) throw error;

    if (!paymentAccount?.stripe_account_id) {
      return NextResponse.json({ status: 'NOT_STARTED', transfersEnabled: false, requirementsDue: 0 });
    }

    const accountId = paymentAccount.stripe_account_id as string;
    const next = await getStripePayoutState(accountId);

    await supabase.from('payment_accounts').update({
      status: next.status,
      transfers_enabled: next.ready,
      requirements_due: next.requirementsDue,
      last_synced_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    }).eq('user_id', user.id).eq('livemode', livemode);

    return NextResponse.json({
      status: next.status,
      transfersEnabled: next.ready,
      requirementsDue: next.requirementsDue
    });
  } catch (error) {
    const resolved = apiError(error);
    return NextResponse.json(resolved.body, { status: resolved.status });
  }
}
