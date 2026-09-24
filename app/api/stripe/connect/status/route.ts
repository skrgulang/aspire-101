import { NextResponse } from 'next/server';
import { apiError, getAuthenticatedUser, getStripePayoutState, getSupabaseServiceClient, stripeGet, stripeLivemode } from '../../../../../lib/server/aspireServer';

type StripeBankAccount = {
  bank_name?: string | null;
  last4?: string | null;
  country?: string | null;
  currency?: string | null;
  status?: string | null;
};

type StripeExternalAccounts = { data?: StripeBankAccount[] };

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
    const [next, externalAccounts] = await Promise.all([
      getStripePayoutState(accountId),
      stripeGet<StripeExternalAccounts>(`/v1/accounts/${encodeURIComponent(accountId)}/external_accounts?object=bank_account&limit=1`)
        .catch(() => ({ data: [] }))
    ]);
    const bank = externalAccounts.data?.[0] ?? null;
    const syncedAt = new Date().toISOString();

    await supabase.from('payment_accounts').update({
      status: next.status,
      transfers_enabled: next.ready,
      requirements_due: next.requirementsDue,
      last_synced_at: syncedAt,
      updated_at: syncedAt
    }).eq('user_id', user.id).eq('livemode', livemode);

    return NextResponse.json({
      status: next.status,
      transfersEnabled: next.ready,
      requirementsDue: next.requirementsDue,
      lastSyncedAt: syncedAt,
      payoutAccount: bank ? {
        bankName: bank.bank_name || 'Bank account',
        last4: bank.last4 || null,
        country: bank.country || null,
        currency: bank.currency?.toUpperCase() || null,
        status: bank.status || null
      } : null
    });
  } catch (error) {
    const resolved = apiError(error);
    return NextResponse.json(resolved.body, { status: resolved.status });
  }
}
