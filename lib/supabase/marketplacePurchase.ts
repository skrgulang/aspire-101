import { getSupabaseBrowserClient } from './client';

export type MarketplaceFulfillmentMethod = 'campus_pickup' | 'shipping' | 'aspirer_delivery';
export type MarketplacePaymentMethod = 'aspire' | 'in_person';
export type ShippingPaidBy = 'buyer' | 'seller';
export type AspirerCompensationMode = 'free' | 'fixed' | 'discuss';
export type MarketplaceDeliveryAddress = {
  name?: string;
  street1: string;
  street2?: string;
  city: string;
  state: string;
  zip: string;
  country: string;
};

function marketplacePurchaseError(error: { message?: string; details?: string }, fallback: string) {
  const detail = `${error.message || ''} ${error.details || ''}`;
  if (/CANNOT_BUY_OWN_LISTING/i.test(detail)) return new Error('You cannot buy your own listing.');
  if (/LISTING_EXPIRED/i.test(detail)) return new Error('This listing has expired.');
  if (/LISTING_UNAVAILABLE/i.test(detail)) return new Error('This item was just reserved or is no longer available.');
  if (/FULFILLMENT_METHOD_NOT_OFFERED/i.test(detail)) return new Error('That delivery method is not offered by this seller.');
  if (/SHIPPING_PAYER_NOT_OFFERED/i.test(detail)) return new Error('That shipping payment option is not offered by this seller. Reopen the item and use the seller’s shipping terms.');
  if (/PAYMENT_METHOD_NOT_ALLOWED/i.test(detail)) return new Error('That payment option is not available for this delivery method.');
  if (/MARKETPLACE_REQUIRES_ASPIRE/i.test(detail)) return new Error('This marketplace order must use Aspire Protected checkout.');
  if (/DELIVERY_ADDRESS_INCOMPLETE/i.test(detail)) return new Error('Complete the delivery address before continuing.');
  if (/DELIVERY_DROPOFF_AREA_REQUIRED/i.test(detail)) return new Error('Add a general drop-off area for the public Aspirer delivery request.');
  if (/DELIVERY_AMOUNT_REQUIRED/i.test(detail)) return new Error('Enter a delivery reward greater than $0.');
  if (/POST_NOT_ALLOWED/i.test(detail)) return new Error('Your account cannot create the linked delivery request right now. Check campus verification and account status.');
  return new Error(error.message || fallback);
}

async function requireSignedIn() {
  const supabase = getSupabaseBrowserClient();
  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError) throw authError;
  if (!authData.user) throw new Error('You must be signed in to buy an item.');
  return supabase;
}

async function requireSellerPayoutReady(requestId: string, paymentMethod: MarketplacePaymentMethod) {
  if (paymentMethod !== 'aspire') return;

  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  const token = data.session?.access_token;
  if (!token) throw new Error('Sign in again to continue.');

  const response = await fetch('/api/marketplace/purchase-ready', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ requestId, paymentMethod }),
    cache: 'no-store'
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload?.error || 'The seller is not ready to receive an Aspire payout yet.');
  }
}

export async function purchaseMarketplaceListingWithOptions(input: {
  requestId: string;
  fulfillmentMethod: MarketplaceFulfillmentMethod;
  paymentMethod?: MarketplacePaymentMethod;
  shippingPaidBy?: ShippingPaidBy | null;
}) {
  const supabase = await requireSignedIn();
  const paymentMethod = input.paymentMethod || 'aspire';
  await requireSellerPayoutReady(input.requestId, paymentMethod);

  const { data, error } = await supabase.rpc('purchase_marketplace_listing', {
    p_request_id: input.requestId,
    p_fulfillment_method: input.fulfillmentMethod,
    p_payment_method: paymentMethod,
    p_shipping_paid_by: input.shippingPaidBy || null
  });

  if (error) throw marketplacePurchaseError(error, 'Could not reserve this item.');
  return String(data);
}

export async function purchaseMarketplaceWithAspirerDelivery(input: {
  requestId: string;
  address: MarketplaceDeliveryAddress;
  instructions?: string;
  compensationMode: AspirerCompensationMode;
  requestedAmountCents?: number | null;
  pickupArea: string;
  dropoffArea: string;
}) {
  const supabase = await requireSignedIn();
  const { data, error } = await supabase.rpc('purchase_marketplace_with_aspirer_delivery', {
    p_request_id: input.requestId,
    p_delivery_address: input.address,
    p_delivery_instructions: input.instructions || null,
    p_compensation_mode: input.compensationMode,
    p_requested_amount_cents: input.compensationMode === 'fixed' ? input.requestedAmountCents || null : null,
    p_pickup_area: input.pickupArea || 'Seller pickup area',
    p_dropoff_area: input.dropoffArea
  });

  if (error) throw marketplacePurchaseError(error, 'Could not reserve the item and create the Aspirer delivery request.');
  const row = Array.isArray(data) ? data[0] : data;
  if (!row?.connection_id || !row?.market_order_id || !row?.delivery_request_id || !row?.delivery_link_id) {
    throw new Error('Aspire could not finish the linked delivery setup. Nothing was reserved; try again.');
  }
  return {
    connectionId: String(row.connection_id),
    marketOrderId: String(row.market_order_id),
    deliveryRequestId: String(row.delivery_request_id),
    deliveryLinkId: String(row.delivery_link_id)
  };
}

export async function setMarketplaceDeliveryAddress(input: {
  connectionId: string;
  address: MarketplaceDeliveryAddress;
  instructions?: string;
}) {
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase.rpc('set_market_order_delivery_address', {
    p_connection_id: input.connectionId,
    p_delivery_address: input.address,
    p_delivery_instructions: input.instructions || null
  });
  if (error) {
    const detail = `${error.message || ''} ${error.details || ''}`;
    if (/DELIVERY_ADDRESS_INCOMPLETE/i.test(detail)) throw new Error('Complete the delivery address before continuing.');
    if (/NOT_BUYER/i.test(detail)) throw new Error('Only the buyer can set the delivery address.');
    throw new Error(error.message || 'Could not save the delivery address.');
  }
  return data;
}

export async function cancelUnpaidMarketplaceReservation(connectionId: string) {
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase.rpc('cancel_unpaid_marketplace_reservation', {
    p_connection_id: connectionId
  });
  if (error) throw marketplacePurchaseError(error, 'Could not release the unpaid reservation.');
  return Boolean(data);
}
