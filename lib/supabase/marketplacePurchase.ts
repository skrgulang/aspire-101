import { getSupabaseBrowserClient } from './client';

export type MarketplaceFulfillmentMethod = 'campus_pickup' | 'shipping' | 'aspirer_delivery';
export type MarketplacePaymentMethod = 'aspire' | 'in_person';
export type ShippingPaidBy = 'buyer' | 'seller';
export type MarketplaceDeliveryAddress = {
  name?: string;
  street1: string;
  street2?: string;
  city: string;
  state: string;
  zip: string;
  country: string;
};

export async function purchaseMarketplaceListingWithOptions(input: {
  requestId: string;
  fulfillmentMethod: MarketplaceFulfillmentMethod;
  paymentMethod?: MarketplacePaymentMethod;
  shippingPaidBy?: ShippingPaidBy | null;
}) {
  const supabase = getSupabaseBrowserClient();
  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError) throw authError;
  if (!authData.user) throw new Error('You must be signed in to buy an item.');

  const { data, error } = await supabase.rpc('purchase_marketplace_listing', {
    p_request_id: input.requestId,
    p_fulfillment_method: input.fulfillmentMethod,
    p_payment_method: input.paymentMethod || 'aspire',
    p_shipping_paid_by: input.shippingPaidBy || null
  });

  if (error) {
    const detail = `${error.message || ''} ${error.details || ''}`;
    if (/CANNOT_BUY_OWN_LISTING/i.test(detail)) throw new Error('You cannot buy your own listing.');
    if (/LISTING_EXPIRED/i.test(detail)) throw new Error('This listing has expired.');
    if (/LISTING_UNAVAILABLE/i.test(detail)) throw new Error('This item was just reserved or is no longer available.');
    if (/FULFILLMENT_METHOD_NOT_OFFERED/i.test(detail)) throw new Error('That delivery method is not offered by this seller.');
    if (/SHIPPING_PAYER_NOT_OFFERED/i.test(detail)) throw new Error('That shipping payment option is not offered by this seller. Reopen the item and use the seller’s shipping terms.');
    if (/PAYMENT_METHOD_NOT_ALLOWED/i.test(detail)) throw new Error('That payment option is not available for this delivery method.');
    if (/MARKETPLACE_REQUIRES_ASPIRE/i.test(detail)) throw new Error('This marketplace order must use Aspire Protected checkout.');
    throw new Error(error.message || 'Could not reserve this item.');
  }

  return String(data);
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
