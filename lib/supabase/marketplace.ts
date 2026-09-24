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
  listing_intent: 'sell' | 'wanted';
  fulfillment_method: 'campus_pickup' | 'shipping' | 'aspirer_delivery' | 'seller_delivery';
  currency: string;
  agreed_amount_cents: number;
  status: MarketOrderStatus;
  reservation_expires_at: string;
  seller_handed_off_at: string | null;
  buyer_received_at: string | null;
  shipping_carrier?: string | null;
  shipping_service?: string | null;
  shipping_rate_id?: string | null;
  shipping_rate_cents?: number | null;
  shipping_currency?: string | null;
  shipping_label_url?: string | null;
  shipping_tracking_number?: string | null;
  shipping_tracking_url?: string | null;
  shipping_status?: 'not_started' | 'rates_ready' | 'label_purchasing' | 'label_failed' | 'label_purchased' | 'in_transit' | 'delivered' | 'exception' | 'cancelled' | null;
  shipping_paid_by?: 'buyer' | 'seller' | null;
  seller_delivery_fee_cents?: number | null;
  seller_delivery_status?: 'not_started' | 'awaiting_payment' | 'ready' | 'out_for_delivery' | 'delivered' | 'completed' | 'cancelled' | null;
};

export type MarketPriceProposal = {
  id: string;
  market_order_id: string;
  connection_id: string;
  proposed_by: string;
  amount_cents: number;
  currency: string;
  status: 'pending' | 'accepted' | 'declined' | 'superseded';
  responded_by: string | null;
  responded_at: string | null;
  created_at: string;
  updated_at: string;
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
  opened_by: string | null;
  source?: 'user' | 'stripe_dispute' | 'stripe_radar';
  stripe_status?: string | null;
  stripe_outcome?: string | null;
  reason: 'item_not_as_described' | 'item_not_received' | 'counterfeit_or_prohibited' | 'payment_issue' | 'unsafe_handoff' | 'other';
  details: string;
  status: 'open' | 'under_review' | 'resolved_buyer' | 'resolved_seller' | 'resolved_split' | 'closed';
  resolution_refund_cents?: number | null;
  resolution_seller_release_cents?: number | null;
  created_at: string;
  resolved_at: string | null;
};

export type MarketDisputeMessage = {
  id: string;
  dispute_id: string;
  author_id: string;
  audience: 'participants' | 'staff';
  message_type: 'participant_reply' | 'staff_reply' | 'internal_note';
  body: string;
  created_at: string;
};

export type MarketDisputeAttachment = {
  id: string;
  dispute_id: string;
  uploaded_by: string;
  file_name: string;
  mime_type: 'image/jpeg' | 'image/png' | 'image/webp' | 'application/pdf';
  size_bytes: number;
  audience: 'participants' | 'staff';
  created_at: string;
  url: string | null;
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
  const { data, error } = await supabase.rpc('get_my_market_orders_v2', {
    p_connection_ids: connectionIds
  });
  if (error) throw error;
  return (data ?? []) as MarketOrder[];
}

export async function cancelMarketReservation(connectionId: string) {
  const headers = await bearerHeaders();
  const response = await fetch('/api/marketplace/reservation/cancel', {
    method: 'POST',
    headers,
    body: JSON.stringify({ connectionId })
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload?.error || 'Could not cancel this reservation.');
}

/** Seller-side cancellation for an unpaid reservation with no Checkout in flight. */
export async function cancelUnpaidMarketReservation(connectionId: string) {
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase.rpc('cancel_unpaid_marketplace_reservation', {
    p_connection_id: connectionId
  });
  if (error) {
    const detail = `${error.message || ''} ${error.details || ''}`;
    if (/PAYMENT_PROCESSING/i.test(detail)) {
      throw new Error('Payment is still being confirmed. Refresh shortly before trying to cancel.');
    }
    if (/UNPAID_CANCELLATION_NOT_AVAILABLE/i.test(detail)) {
      throw new Error('This order can no longer use unpaid cancellation. Use the protected refund or problem-report flow.');
    }
    if (/FULFILLMENT_ALREADY_STARTED/i.test(detail)) {
      throw new Error('Delivery or handoff has already started. Use Report a problem so the order stays protected.');
    }
    throw error;
  }
  return data as MarketOrder;
}

export async function fetchMarketPriceProposals(orderIds: string[]) {
  if (!orderIds.length) return [] as MarketPriceProposal[];
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase.rpc('get_my_market_price_proposals', {
    p_order_ids: orderIds
  });
  if (error) {
    if (error.code === '42P01' || error.code === 'PGRST202' || error.code === 'PGRST205') return [] as MarketPriceProposal[];
    throw error;
  }
  return (data ?? []) as MarketPriceProposal[];
}

function priceProposalError(error: { code?: string; message?: string }) {
  const detail = error.message || '';
  if (/PRICE_LOCKED_(CHECKOUT|PAYMENT|ORDER)/.test(detail)) {
    return new Error('The price is locked because checkout or order fulfillment has already started.');
  }
  if (detail.includes('PRICE_BELOW_ASPIRE_MINIMUM')) {
    return new Error('That price is below the minimum for Pay with Aspire.');
  }
  if (detail.includes('PRICE_LEAVES_NO_SELLER_PROCEEDS')) {
    return new Error('That price would leave no seller proceeds after fees or shipping.');
  }
  return error;
}

export async function proposeMarketPrice(orderId: string, amountCents: number) {
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase.rpc('propose_market_price', {
    p_market_order_id: orderId,
    p_amount_cents: amountCents
  });
  if (error) throw priceProposalError(error);
  return String(data || '');
}

export async function respondMarketPrice(proposalId: string, accept: boolean) {
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase.rpc('respond_market_price', {
    p_proposal_id: proposalId,
    p_accept: accept
  });
  if (error) throw priceProposalError(error);
  return String(data || '');
}

export async function fetchMarketDisputes(orderIds: string[]) {
  if (!orderIds.length) return [] as MarketDispute[];
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase.rpc('get_my_market_disputes', {
    p_order_ids: orderIds
  });
  if (error) throw error;
  return (data ?? []) as MarketDispute[];
}

export function subscribeToMarketplaceOrderChanges(onChange: () => void) {
  const supabase = getSupabaseBrowserClient();
  const channel = supabase
    .channel(`market-orders-${Math.random().toString(36).slice(2)}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'market_orders' }, onChange)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'connection_payments' }, onChange)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'market_disputes' }, onChange)
    .subscribe();

  return () => {
    void supabase.removeChannel(channel);
  };
}

export async function markMarketHandoff(connectionId: string) {
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase.rpc('market_mark_handoff_safe', { p_connection_id: connectionId });
  if (error) throw error;
  return String(data || 'handoff_confirmed');
}

export async function confirmMarketReceipt(connectionId: string) {
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase.rpc('market_confirm_receipt_safe', { p_connection_id: connectionId });
  if (error) throw error;
  return String(data || 'release_ready');
}

export async function openMarketDispute(connectionId: string, reason: MarketDispute['reason'], details: string) {
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase.rpc('market_open_dispute_safe', {
    p_connection_id: connectionId,
    p_reason: reason,
    p_details: details
  });
  if (error) throw error;
  return String(data || '');
}

export async function fetchMarketDisputeMessages(disputeIds: string[]) {
  const ids = [...new Set(disputeIds.filter(Boolean))].slice(0, 50);
  if (!ids.length) return [] as MarketDisputeMessage[];
  const response = await fetch(`/api/market/dispute/thread?disputeIds=${encodeURIComponent(ids.join(','))}`, {
    headers: await bearerHeaders(),
    cache: 'no-store'
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload?.error || 'Could not load dispute replies.');
  return (payload?.messages ?? []) as MarketDisputeMessage[];
}

export async function addMarketDisputeMessage(disputeId: string, message: string) {
  const response = await fetch('/api/market/dispute/thread', {
    method: 'POST',
    headers: await bearerHeaders(),
    body: JSON.stringify({ disputeId, message: message.trim() })
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload?.error || 'Could not send your dispute update.');
  return payload.message as MarketDisputeMessage;
}

export async function fetchMarketDisputeAttachments(disputeIds: string[]) {
  const ids = [...new Set(disputeIds.filter(Boolean))].slice(0, 50);
  if (!ids.length) return [] as MarketDisputeAttachment[];
  const response = await fetch(`/api/market/dispute/attachment?disputeIds=${encodeURIComponent(ids.join(','))}`, {
    headers: await bearerHeaders(),
    cache: 'no-store'
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload?.error || 'Could not load dispute evidence.');
  return (payload?.attachments ?? []) as MarketDisputeAttachment[];
}

export async function uploadMarketDisputeAttachment(disputeId: string, file: File) {
  const descriptor = { disputeId, fileName: file.name, mimeType: file.type, sizeBytes: file.size };
  const prepare = await fetch('/api/market/dispute/attachment', {
    method: 'POST',
    headers: await bearerHeaders(),
    body: JSON.stringify({ action: 'prepare', ...descriptor })
  });
  const prepared = await prepare.json().catch(() => ({}));
  if (!prepare.ok) throw new Error(prepared?.error || 'Could not prepare evidence upload.');
  const supabase = getSupabaseBrowserClient();
  const { error: uploadError } = await supabase.storage
    .from('market-dispute-evidence')
    .uploadToSignedUrl(prepared.path, prepared.token, file, { contentType: file.type, cacheControl: '3600' });
  if (uploadError) throw uploadError;
  const finalize = await fetch('/api/market/dispute/attachment', {
    method: 'POST',
    headers: await bearerHeaders(),
    body: JSON.stringify({ action: 'finalize', path: prepared.path, ...descriptor })
  });
  const saved = await finalize.json().catch(() => ({}));
  if (!finalize.ok) throw new Error(saved?.error || 'Could not save dispute evidence.');
  return saved.attachment as MarketDisputeAttachment;
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

export async function getShippingRates(orderId: string, addressFrom: ShippingAddress, _addressTo: ShippingAddress | null, parcel: ShippingParcel) {
  const headers = await bearerHeaders();
  const response = await fetch('/api/shipping/rates', { method: 'POST', headers, body: JSON.stringify({ orderId, addressFrom, parcel }) });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload?.error || 'Could not calculate shipping rates.');
  return payload as { shipmentId: string; rates: ShippingRate[]; selectedRateId: string | null };
}

export async function fetchShippingRates(orderId: string) {
  const headers = await bearerHeaders();
  const response = await fetch(`/api/shipping/rates?orderId=${encodeURIComponent(orderId)}`, { headers, cache: 'no-store' });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload?.error || 'Could not load carrier rates.');
  return payload as { shipmentId: string | null; rates: ShippingRate[]; selectedRateId: string | null };
}

export async function selectShippingRate(orderId: string, rateId: string) {
  const headers = await bearerHeaders();
  const response = await fetch('/api/shipping/rate', { method: 'POST', headers, body: JSON.stringify({ orderId, rateId }) });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(payload?.error || 'Could not select that carrier rate.') as Error & { code?: string };
    error.code = payload?.code;
    throw error;
  }
  return payload as { orderId: string; rate: ShippingRate; shippingPaidBy: 'buyer' | 'seller' };
}

export async function purchaseShippingLabel(orderId: string, rateId?: string | null) {
  const headers = await bearerHeaders();
  const response = await fetch('/api/shipping/label', { method: 'POST', headers, body: JSON.stringify({ orderId, rateId: rateId || null }) });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload?.error || 'Could not purchase the shipping label.');
  return payload as { status: string; transactionId: string | null; labelUrl: string; trackingNumber: string; trackingUrl: string | null; duplicate?: boolean };
}
