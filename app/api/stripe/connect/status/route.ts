import { NextResponse } from 'next/server';
import { apiError, getAuthenticatedUser, getSupabaseServiceClient, stripeGet } from '../../../../../lib/server/aspireServer';

type PaymentStatus = 'NOT_STARTED' | 'ACTION_REQUIRED' | 'UNDER_REVIEW' | 'READY' | 'RESTRICTED';

type StripeConnectAccount = {
  capabilities?: { transfers?: string | null };
  payouts_enabled?: boolean;
  details_submitted?: boolean;
  requirements?: {
    currently_due?: string[];
    past_due?: string[];
    pending_verification?: string[];
    disabled_reason?: string | null;
  };
};

function deriveStatus(account: StripeConnectAccount) {
  const transferActive = account.capabilities?.transfers === 'active';
  const payoutsEnabled = account.payouts_enabled === true;
  const currentlyDue = account.requirements?.currently_due ?? [];
  const pastDue = account.requirements?.past_due ?? [];
  const pendingVerification = account.requirements?.pending_verification ?? [];
  const disabledReason = account.requirements?.disabled_reason || '';
  const requirementsDue = new Set([...currentlyDue, ...pastDue]).size;

  let status: PaymentStatus = 'UNDER_REVIEW';
  if (transferActive && payoutsEnabled) {
    status = 'READY';
  } else if (pastDue.length > 0 || disabledReason.includes('past_due')) {
    status = 'RESTRICTED';
  } else if (currentlyDue.length > 0 || account.details_submitted === false) {
    status = 'ACTION_REQUIRED';
  } else if (pendingVerification.length > 0 || account.details_submitted === true) {
    status = 'UNDER_REVIEW';
  } else {
    status = 'ACTION_REQUIRED';
  }

  return {
    status,
    transfersEnabled: transferActive && payoutsEnabled,
    requirementsDue
  };
}

export async function GET(request: Request) {
  try {
    const { user } = await getAuthenticatedUser(request);
    const supabase = getSupabaseServiceClient();
    const { data: paymentAccount, error } = await supabase
      .from('payment_accounts')
      .select('*')
      .eq('user_id', user.id)
      .maybeSingle();
    if (error) throw error;

    if (!paymentAccount?.stripe_account_id) {
      return NextResponse.json({ status: 'NOT_STARTED', transfersEnabled: false, requirementsDue: 0 });
    }

    // Use Stripe's stable Connect Account endpoint as the source of truth.
    // The previous v2 preview recipient-status check could report a stale/restricted
    // state even when the connected account already had transfers and payouts enabled.
    const accountId = paymentAccount.stripe_account_id as string;
    const account = await stripeGet<StripeConnectAccount>(`/v1/accounts/${encodeURIComponent(accountId)}`);
    const next = deriveStatus(account);

    await supabase.from('payment_accounts').update({
      status: next.status,
      transfers_enabled: next.transfersEnabled,
      requirements_due: next.requirementsDue,
      last_synced_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    }).eq('user_id', user.id);

    return NextResponse.json(next);
  } catch (error) {
    const resolved = apiError(error);
    return NextResponse.json(resolved.body, { status: resolved.status });
  }
}
