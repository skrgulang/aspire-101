import { getSupabaseBrowserClient } from './client';

export type MarketOrderStatus =
  | 'awaiting_payment'
  | 'payment_processing'
  | 'paid'
  | 'handoff_confirmed'
  | 'release_ready'
  | 'released'
  | 'disputed'
  | 'refunded'
  | 'cancelled'
  | 'off_platform';

export type MarketOrder = {
  id: string;
  connection_id: string;
  request_id: string;
  buyer_id: string;
  seller_id: string;
  payment_id: string | null;
  listing_intent: 'sell' | 'wanted';
  fulfillment_method: 'campus_pickup' | 'shipping' | 'aspirer_delivery';
  currency: string;
  agreed_amount_cents: number;
  status: MarketOrderStatus;
  seller_handed_off_at: string | null;
  buyer_received_at: string | null;
  dispute_opened_at: string | null;
  released_at: string | null;
  refunded_at: string | null;
  cancelled_at: string | null;
  created_at: string;
  updated_at: string;
  shipping_provider?: 'shippo' | null;
  shipping_carrier?: string | null;
  shipping_service?: string | null;
  shipping_shipment_id?: string | null;
  shipping_rate_id?: string | null;
  shipping_rate_cents?: number | null;
  shipping_currency?: string | null;
  shipping_transaction_id?: string | null;
  shipping_label_url?: string | null;
  shipping_tracking_number?: string | null;
  shipping_tracking_url?: string | null;
  shipping_status?: 'not_started' | 'rates_ready' | 'label_purchasing' | 'label_failed' | 'label_purchased' | 'in_transit' | 'delivered' | 'exception' | 'cancelled' | null;
  shipping_last_event_at?: string | null;
};

export type ShippingAddress = {
  name: string;
  street1: string;
  street2?: string;
  city: string;
  state: string;
  zip: string;
  country: string;
  email?: string;
  phone?: string;
};

export type ShippingParcel = { length: string; width: string; height: string; weight: string };

export type ShippingRate = {
  id: string;
  carrier: string;
  service: string;
  amountCents: number;
  currency: string;
  estimatedDays: number | null;
  durationTerms: string | null;
};

export type MarketDispute = {
  id: string;
  market_order_id: string;
  opened_by: string;
  reason: 'item_not_as_described' | 'item_not_received' | 'counterfeit_or_prohibited' | 'payment_issue' | 'unsafe_handoff' | 'other';
  details: string;
  status: 'open' | 'under_review' | 'resolved_buyer' | 'resolved_seller' | 'closed';
  created_at: string;
  resolved_at: string | null;
};

async function bearerHeaders() {
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  const token = data.session?.access_token;
  if (!token) throw new Error('Sign in again to continue.');
  return { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
}

export async function fetchMarketOrders(connectionIds: string[]) {
  if (!connectionIds.length) return [] as MarketOrder[];
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase
    .from('market_orders')
    .select('*')
    .in('connection_id', connectionIds)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as MarketOrder[];
}

export async function fetchMarketDisputes(orderIds: string[]) {
  if (!orderIds.length) return [] as MarketDispute[];
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase
    .from('market_disputes')
    .select('id,market_order_id,opened_by,reason,details,status,created_at,resolved_at')
    .in('market_order_id', orderIds)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as MarketDispute[];
}

export async function markMarketHandoff(connectionId: string) {
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase.rpc('market_mark_handoff', { p_connection_id: connectionId });
  if (error) throw error;
  return data as MarketOrder;
}

export async function confirmMarketReceipt(connectionId: string) {
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase.rpc('market_confirm_receipt', { p_connection_id: connectionId });
  if (error) throw error;
  return data as MarketOrder;
}

export async function openMarketDispute(connectionId: string, reason: MarketDispute['reason'], details: string) {
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase.rpc('market_open_dispute', {
    p_connection_id: connectionId,
    p_reason: reason,
    p_details: details
  });
  if (error) throw error;
  return data as MarketDispute;
}

export async function requestMarketRefund(connectionId: string) {
  const headers = await bearerHeaders();
  const response = await fetch('/api/stripe/market/refund', {
    method: 'POST',
    headers,
    body: JSON.stringify({ connectionId })
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(payload?.error || 'Could not refund this marketplace order.') as Error & { code?: string };
    error.code = payload?.code;
    throw error;
  }
  return payload as { status: 'refunded'; refundId: string };
}

export async function getShippingRates(orderId: string, addressFrom: ShippingAddress, addressTo: ShippingAddress, parcel: ShippingParcel) {
  const headers = await bearerHeaders();
  const response = await fetch('/api/shipping/rates', { method: 'POST', headers, body: JSON.stringify({ orderId, addressFrom, addressTo, parcel }) });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload?.error || 'Could not calculate shipping rates.');
  return payload as { shipmentId: string; rates: ShippingRate[] };
}

export async function purchaseShippingLabel(orderId: string, rateId: string) {
  const headers = await bearerHeaders();
  const response = await fetch('/api/shipping/label', { method: 'POST', headers, body: JSON.stringify({ orderId, rateId }) });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload?.error || 'Could not purchase the shipping label.');
  return payload as { status: string; transactionId: string | null; labelUrl: string; trackingNumber: string; trackingUrl: string | null; duplicate?: boolean };
}