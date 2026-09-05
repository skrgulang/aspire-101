import { getSupabaseBrowserClient } from './client';

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
  status: ConnectionPaymentStatus;
  paid_at: string | null;
  released_at: string | null;
  refunded_at: string | null;
  disputed_at: string | null;
  created_at: string;
  updated_at: string;
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
  if (!connectionIds.length) return [] as ConnectionPayment[];
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase
    .from('connection_payments')
    .select('id,connection_id,request_id,payer_id,payee_id,currency,gross_amount_cents,platform_fee_cents,provider_amount_cents,status,paid_at,released_at,refunded_at,disputed_at,created_at,updated_at')
    .in('connection_id', connectionIds);
  if (error) throw error;
  return (data ?? []) as ConnectionPayment[];
}

export async function fetchCompletionConfirmations(connectionIds: string[]) {
  if (!connectionIds.length) return [] as CompletionConfirmation[];
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase
    .from('connection_completion_confirmations')
    .select('connection_id,user_id,confirmed_at')
    .in('connection_id', connectionIds);
  if (error) throw error;
  return (data ?? []) as CompletionConfirmation[];
}

export async function confirmConnectionCompletion(connectionId: string) {
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase.rpc('confirm_connection_completion', { p_connection_id: connectionId });
  if (error) throw error;
  return Number(data || 0);
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
  if (!response.ok) throw new Error(payload?.error || 'Could not start Aspire payment.');
  return payload as { url: string; status: string; amountCents: number; platformFeeCents: number; providerAmountCents: number };
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
  return payload as { status: 'released'; transferId: string };
}
