import { NextResponse } from 'next/server';
import { apiError, getAuthenticatedUser, getSupabaseServiceClient, stripeRequest } from '../../../../../lib/server/aspireServer';

type PaymentStatus = 'NOT_STARTED' | 'ACTION_REQUIRED' | 'UNDER_REVIEW' | 'READY' | 'RESTRICTED';

type StripeAccountState = {
  configuration?: {
    recipient?: {
      capabilities?: {
        stripe_balance?: {
          stripe_transfers?: {
            status?: string;
            status_details?: { code?: string };
          };
        };
      };
    };
  };
  requirements?: {
    entries?: Array<{ minimum_deadline?: { status?: string }; requested_reasons?: Array<{ code?: string }> }>;
  } | Array<unknown>;
};

function deriveStatus(account: StripeAccountState) {
  const transfers = account.configuration?.recipient?.capabilities?.stripe_balance?.stripe_transfers;
  const entries = Array.isArray(account.requirements)
    ? account.requirements
    : account.requirements?.entries ?? [];
  const transferStatus = transfers?.status || '';
  const detailCode = transfers?.status_details?.code || '';
  const pastDue = !Array.isArray(account.requirements) && (account.requirements?.entries ?? []).some((entry) => entry.minimum_deadline?.status === 'past_due');
  const currentlyDue = !Array.isArray(account.requirements) && (account.requirements?.entries ?? []).some((entry) => entry.minimum_deadline?.status === 'currently_due');

  let status: PaymentStatus = 'UNDER_REVIEW';
  if (transferStatus === 'active') status = 'READY';
  else if (pastDue || detailCode === 'requirements_past_due' || transferStatus === 'restricted') status = 'RESTRICTED';
  else if (currentlyDue || entries.length > 0) status = 'ACTION_REQUIRED';

  return { status, transfersEnabled: transferStatus === 'active', requirementsDue: entries.length };
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

    const accountId = paymentAccount.stripe_account_id as string;
    const account = await stripeRequest<StripeAccountState>(
      `/v2/core/accounts/${encodeURIComponent(accountId)}?include[]=configuration.recipient&include[]=requirements`,
      { method: 'GET' }
    );
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
