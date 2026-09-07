import { getSupabaseBrowserClient } from './client';
import { createRequest } from './requests';

export type DeliveryCompensationMode = 'free' | 'fixed' | 'discuss';
export type DeliveryProtectionMode = 'none' | 'aspire' | 'off_platform';

export type MarketDeliveryLink = {
  id: string;
  market_order_id: string;
  delivery_request_id: string;
  buyer_id: string;
  compensation_mode: DeliveryCompensationMode;
  protection_mode: DeliveryProtectionMode;
  requested_amount_cents: number | null;
  pickup_area: string;
  dropoff_area: string;
  status: 'active' | 'cancelled' | 'completed';
  created_at: string;
  updated_at: string;
};

export type ConnectionPaymentAgreement = {
  connection_id: string;
  amount_cents: number;
  payment_method: 'aspire' | 'in_person';
  proposed_by: string;
  requester_accepted_at: string | null;
  responder_accepted_at: string | null;
  status: 'proposed' | 'agreed' | 'cancelled';
  created_at: string;
  updated_at: string;
};

export async function fetchMarketDeliveryLinks(orderIds: string[]) {
  if (!orderIds.length) return [] as MarketDeliveryLink[];
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase
    .from('market_delivery_links')
    .select('*')
    .in('market_order_id', orderIds)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as MarketDeliveryLink[];
}

export async function createLinkedDeliveryRequest(input: {
  marketOrderId: string;
  campusId: string;
  itemTitle: string;
  pickupArea: string;
  dropoffArea: string;
  compensationMode: DeliveryCompensationMode;
  protectionMode: DeliveryProtectionMode;
  amountCents?: number | null;
}) {
  const pickupArea = input.pickupArea.trim();
  const dropoffArea = input.dropoffArea.trim();
  if (pickupArea.length < 2 || dropoffArea.length < 2) throw new Error('Add a pickup area and drop-off area.');

  const fixed = input.compensationMode === 'fixed';
  const amount = fixed ? Number(input.amountCents || 0) : null;
  if (fixed && (!Number.isInteger(amount) || amount! <= 0)) throw new Error('Set a positive delivery amount.');
  if (fixed && !['aspire', 'off_platform'].includes(input.protectionMode)) throw new Error('Choose how the delivery will be paid.');

  const paymentMethod = input.compensationMode === 'fixed'
    ? (input.protectionMode === 'aspire' ? 'aspire' : 'in_person')
    : 'none';
  const kind = input.compensationMode === 'free' ? 'community' : 'paid_help';
  const compensationCopy = input.compensationMode === 'free'
    ? 'No payment offered.'
    : input.compensationMode === 'fixed'
      ? `${input.protectionMode === 'aspire' ? 'Pay with Aspire requested.' : 'Payment will be arranged off-platform and is not Aspire Protected.'}`
      : 'Compensation will be discussed after matching. If money is involved, both people must choose Pay with Aspire for payment protection or explicitly use an unprotected off-platform payment.';

  const request = await createRequest({
    kind,
    category: 'Pickup / errand',
    title: `Deliver ${input.itemTitle}`.slice(0, 180),
    details: `Help deliver an item from an Aspire Market purchase. Pickup area: ${pickupArea}. Drop-off area: ${dropoffArea}. Exact address should only be shared after a connection is chosen. ${compensationCopy}`,
    campusId: input.campusId,
    amount_cents: fixed ? amount! : undefined,
    payment_method: paymentMethod
  });

  const supabase = getSupabaseBrowserClient();
  const { data: link, error } = await supabase.rpc('link_market_delivery_request', {
    p_market_order_id: input.marketOrderId,
    p_delivery_request_id: request.id,
    p_compensation_mode: input.compensationMode,
    p_protection_mode: input.protectionMode,
    p_requested_amount_cents: fixed ? amount : null,
    p_pickup_area: pickupArea,
    p_dropoff_area: dropoffArea
  });
  if (error) {
    // Keep the request recoverable but close it if the protected link could not be created.
    await supabase.from('requests').update({ status: 'cancelled' }).eq('id', request.id).catch(() => undefined);
    throw error;
  }
  return { request, link: link as MarketDeliveryLink };
}

export async function cancelLinkedDeliveryRequest(linkId: string) {
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase.rpc('cancel_market_delivery_request', { p_delivery_link_id: linkId });
  if (error) throw error;
  return data as MarketDeliveryLink;
}

export async function fetchConnectionPaymentAgreements(connectionIds: string[]) {
  if (!connectionIds.length) return [] as ConnectionPaymentAgreement[];
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase
    .from('connection_payment_agreements')
    .select('*')
    .in('connection_id', connectionIds);
  if (error) throw error;
  return (data ?? []) as ConnectionPaymentAgreement[];
}

export async function proposeConnectionPaymentTerms(connectionId: string, amountCents: number, method: 'aspire' | 'in_person') {
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase.rpc('propose_connection_payment_terms', {
    p_connection_id: connectionId,
    p_amount_cents: amountCents,
    p_payment_method: method
  });
  if (error) throw error;
  return data as ConnectionPaymentAgreement;
}

export async function acceptConnectionPaymentTerms(connectionId: string) {
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase.rpc('accept_connection_payment_terms', { p_connection_id: connectionId });
  if (error) throw error;
  return data as ConnectionPaymentAgreement;
}
