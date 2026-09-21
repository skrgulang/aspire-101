import { getSupabaseBrowserClient } from './client';
import { trackProductEvent } from '../analytics/client';

export type ConnectionPaymentStatus =
  | 'not_started'
  | 'checkout_created'
  | 'processing'
  | 'secured'
  | 'released'
  | 'failed'
  | 'refunded'
  | 'disputed'
  | 'cancelled';

export type ConnectionPayment = {
  id: string;
  connection_id: string;
  request_id: string;
  payer_id: string;
  payee_id: string;
  currency: string;
  gross_amount_cents: number;
  platform_fee_cents: number;
  provider_amount_cents: number;
  base_amount_cents: number | null;
  requester_fee_cents: number | null;
  provider_fee_cents: number | null;
  tip_amount_cents: number;
  tip_fee_cents: number;
  customer_total_cents: number | null;
  provider_net_cents: number | null;
  fee_policy_version: string | null;
  status: ConnectionPaymentStatus;
  paid_at: string | null;
  released_at: string | null;
  refunded_at: string | null;
  disputed_at: string | null;
  created_at: string;
  updated_at: string;
};

export type AspireFeeQuote = {
  connectionId: string;
  requestId: string;
  title: string;
  currency: string;
  paymentMethod: 'none' | 'in_person' | 'aspire';
  feePolicyVersion: string;
  baseAmountCents: number;
  requesterFeeCents: number;
  providerFeeCents: number;
  tipAmountCents: number;
  customerTotalCents: number;
  providerNetCents: number;
  platformFeeRevenueCents: number;
  minimumPaidOrderCents: number;
  standardPayoutCadence: string;
  shippingRateCents?: number;
  shippingPaidBy?: 'buyer' | 'seller' | null;
  shippingCarrier?: string | null;
  shippingService?: string | null;
  requester: { percentBps: number; fixedCents: number; minCents: number; maxCents: number };
  provider: { percentBps: number };
  tips: { platformPercentBps: number };
};

export type CompletionConfirmation = {
  connection_id: string;
  user_id: string;
  confirmed_at: string;
};

async function bearerHeaders() {
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  const token = data.session?.access_token;
  if (!token) throw new Error('Sign in again to continue.');
  return { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
}

export async function fetchConnectionPayments(connectionIds: string[]) {
  const ids = [...new Set(connectionIds.filter(Boolean))].slice(0, 200);
  if (!ids.length) return [] as ConnectionPayment[];
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase.rpc('get_connection_payments_for_my_connections', {
    p_connection_ids: ids
  });
  if (error) throw error;
  return (data ?? []) as ConnectionPayment[];
}

export async function fetchCompletionConfirmations(connectionIds: string[]) {
  const ids = [...new Set(connectionIds.filter(Boolean))].slice(0, 200);
  if (!ids.length) return [] as CompletionConfirmation[];
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase.rpc('get_completion_confirmations_for_my_connections', {
    p_connection_ids: ids
  });
  if (error) throw error;
  return (data ?? []) as CompletionConfirmation[];
}

export async function fetchAspireFeeQuote(connectionId: string) {
  const headers = await bearerHeaders();
  const response = await fetch('/api/stripe/payment/quote', {
    method: 'POST',
    headers,
    body: JSON.stringify({ connectionId }),
    cache: 'no-store'
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(payload?.error || 'Could not calculate Aspire fees.') as Error & { code?: string };
    error.code = payload?.code;
    throw error;
  }
  return payload as AspireFeeQuote;
}

export async function confirmConnectionCompletion(connectionId: string) {
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase.rpc('confirm_connection_completion', { p_connection_id: connectionId });
  if (error) throw error;
  const confirmationCount = Number(data || 0);
  void trackProductEvent('connection_completion_marked', { confirmation_count: confirmationCount });
  return confirmationCount;
}

export async function setConnectionPaymentMethod(connectionId: string, method: 'none' | 'in_person' | 'aspire') {
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase.rpc('set_connection_payment_method', {
    p_connection_id: connectionId,
    p_method: method
  });
  if (error) throw error;
  return data as 'none' | 'in_person' | 'aspire';
}

export async function createAspireCheckout(connectionId: string) {
  const headers = await bearerHeaders();
  const response = await fetch('/api/stripe/payment/create', {
    method: 'POST',
    headers,
    body: JSON.stringify({ connectionId })
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(payload?.error || 'Could not start Aspire payment.') as Error & { code?: string };
    error.code = payload?.code;
    throw error;
  }
  const result = payload as {
    url: string;
    status: string;
    feePolicyVersion: string;
    baseAmountCents: number;
    requesterFeeCents: number;
    customerTotalCents: number;
    providerFeeCents: number;
    providerNetCents: number;
    tipAmountCents: number;
    shippingRateCents?: number;
    shippingPaidBy?: 'buyer' | 'seller' | null;
  };
  void trackProductEvent('checkout_started', {
    fee_policy_version: result.feePolicyVersion,
    shipping_enabled: Boolean(result.shippingPaidBy),
    shipping_paid_by: result.shippingPaidBy ?? null
  });
  return result;
}

export async function releaseAspirePayment(connectionId: string) {
  const headers = await bearerHeaders();
  const response = await fetch('/api/stripe/payment/release', {
    method: 'POST',
    headers,
    body: JSON.stringify({ connectionId })
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(payload?.error || 'Could not release Aspire payment.') as Error & { code?: string };
    error.code = payload?.code;
    throw error;
  }
  const result = payload as { status: 'released'; providerNetCents: number; feePolicyVersion: string; duplicate?: boolean; transactionType?: 'marketplace' | 'connection' };
  void trackProductEvent('payout_released', {
    fee_policy_version: result.feePolicyVersion,
    transaction_type: result.transactionType ?? null,
    duplicate: Boolean(result.duplicate)
  });
  return result;
}
