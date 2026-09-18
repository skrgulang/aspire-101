import { getSupabaseBrowserClient } from './client';
import type { MarketplaceDeliveryAddress } from './marketplacePurchase';

export type SellerDeliveryQuoteStatus = 'requested' | 'quoted' | 'accepted' | 'declined' | 'cancelled';
export type SellerDeliveryStatus = 'not_started' | 'awaiting_payment' | 'ready' | 'out_for_delivery' | 'delivered' | 'completed' | 'cancelled';

export type SellerDeliveryQuote = {
  id: string;
  request_id: string;
  buyer_id: string;
  seller_id: string;
  buyer_area: string;
  buyer_note: string | null;
  status: SellerDeliveryQuoteStatus;
  delivery_cents: number | null;
  seller_note: string | null;
  connection_id: string | null;
  market_order_id: string | null;
  created_at: string;
  updated_at: string;
  quoted_at: string | null;
  accepted_at: string | null;
  declined_at: string | null;
  listing?: {
    id: string;
    title: string;
    amount_cents: number | null;
    currency: string;
    seller_delivery_mode: 'free' | 'fixed' | 'negotiable' | null;
    seller_delivery_price_cents: number | null;
    status: string;
  } | null;
  order?: {
    id: string;
    status: string;
    agreed_amount_cents: number;
    currency: string;
    seller_delivery_fee_cents: number | null;
    seller_delivery_status: SellerDeliveryStatus;
  } | null;
};

type ListingSummary = NonNullable<SellerDeliveryQuote['listing']>;
type OrderSummary = NonNullable<SellerDeliveryQuote['order']>;
const sellerDeliveryQuoteSelect = 'id,request_id,buyer_id,seller_id,buyer_area,buyer_note,status,delivery_cents,seller_note,connection_id,market_order_id,created_at,updated_at,quoted_at,accepted_at,declined_at' as const;

function readableError(error: { message?: string; details?: string }, fallback: string) {
  const detail = `${error.message || ''} ${error.details || ''}`;
  if (/GENERAL_AREA_REQUIRED/i.test(detail)) return new Error('Add a general area such as Chauncey, WALC, or Purdue West.');
  if (/SELLER_DELIVERY_NOT_OFFERED|SELLER_DELIVERY_NOT_CONFIGURED/i.test(detail)) return new Error('This seller is not offering Seller Delivery for this item.');
  if (/LISTING_NOT_APPROVED/i.test(detail)) return new Error('This marketplace listing is still under review.');
  if (/LISTING_UNAVAILABLE|LISTING_EXPIRED/i.test(detail)) return new Error('This item is no longer available.');
  if (/QUOTE_NOT_READY/i.test(detail)) return new Error('Wait for the seller to confirm a delivery quote first.');
  if (/DELIVERY_QUOTE_REQUIRED/i.test(detail)) return new Error('Enter the delivery amount before sending the quote.');
  if (/DELIVERY_ADDRESS_INCOMPLETE/i.test(detail)) return new Error('Complete the exact delivery address before accepting the quote.');
  if (/ADDRESS_LOCKED_UNTIL_PAYMENT/i.test(detail)) return new Error('The exact address stays private until the buyer completes protected checkout.');
  if (/PAYMENT_REQUIRED/i.test(detail)) return new Error('The buyer must complete protected payment before delivery can begin.');
  return new Error(error.message || fallback);
}

async function requireUser() {
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase.auth.getUser();
  if (error) throw error;
  if (!data.user) throw new Error('Sign in to use Seller Delivery.');
  return { supabase, user: data.user };
}

export async function requestSellerDelivery(input: {
  requestId: string;
  buyerArea: string;
  buyerNote?: string;
}) {
  const { supabase } = await requireUser();
  const { data, error } = await supabase.rpc('request_market_seller_delivery', {
    p_request_id: input.requestId,
    p_buyer_area: input.buyerArea,
    p_buyer_note: input.buyerNote || null
  });
  if (error) throw readableError(error, 'Could not send the Seller Delivery request.');
  return String(data);
}

export async function fetchMySellerDeliveryQuotes(): Promise<{ userId: string; quotes: SellerDeliveryQuote[] }> {
  const { supabase, user } = await requireUser();
  const { data, error } = await supabase
    .from('market_seller_delivery_quotes')
    .select(sellerDeliveryQuoteSelect)
    .order('updated_at', { ascending: false });
  if (error) throw readableError(error, 'Could not load Seller Delivery requests.');

  const quotes = (data || []) as SellerDeliveryQuote[];
  const requestIds = [...new Set(quotes.map((q) => q.request_id))];
  const connectionIds = [...new Set(quotes.map((q) => q.connection_id).filter(Boolean))] as string[];

  const [requestsResult, ordersResult] = await Promise.all([
    requestIds.length
      ? supabase.from('requests').select('id,title,amount_cents,currency,seller_delivery_mode,seller_delivery_price_cents,status').in('id', requestIds)
      : Promise.resolve({ data: [], error: null } as any),
    connectionIds.length
      ? supabase.rpc('get_my_market_orders_v2', { p_connection_ids: connectionIds })
      : Promise.resolve({ data: [], error: null } as any)
  ]);

  const requestMap = new Map<string, ListingSummary>();
  for (const row of (requestsResult.data || []) as ListingSummary[]) requestMap.set(row.id, row);
  const orderMap = new Map<string, OrderSummary>();
  for (const row of (ordersResult.data || []) as OrderSummary[]) orderMap.set(row.id, row);

  return {
    userId: user.id,
    quotes: quotes.map((quote) => ({
      ...quote,
      listing: requestMap.get(quote.request_id) || null,
      order: quote.market_order_id ? orderMap.get(quote.market_order_id) || null : null
    }))
  };
}

export async function quoteSellerDelivery(input: { quoteId: string; deliveryCents?: number | null; note?: string }) {
  const { supabase } = await requireUser();
  const { data, error } = await supabase.rpc('quote_market_seller_delivery', {
    p_quote_id: input.quoteId,
    p_delivery_cents: input.deliveryCents ?? null,
    p_seller_note: input.note || null
  });
  if (error) throw readableError(error, 'Could not send the delivery quote.');
  return data;
}

export async function declineSellerDelivery(quoteId: string, note?: string) {
  const { supabase } = await requireUser();
  const { data, error } = await supabase.rpc('decline_market_seller_delivery', {
    p_quote_id: quoteId,
    p_note: note || null
  });
  if (error) throw readableError(error, 'Could not decline the delivery request.');
  return data;
}

export async function cancelSellerDeliveryRequest(quoteId: string) {
  const { supabase } = await requireUser();
  const { data, error } = await supabase.rpc('cancel_market_seller_delivery_request', { p_quote_id: quoteId });
  if (error) throw readableError(error, 'Could not cancel the delivery request.');
  return data;
}

export async function acceptSellerDeliveryQuote(input: {
  quoteId: string;
  address: MarketplaceDeliveryAddress;
  instructions?: string;
}) {
  const { supabase } = await requireUser();
  const { data, error } = await supabase.rpc('accept_market_seller_delivery_quote', {
    p_quote_id: input.quoteId,
    p_delivery_address: input.address,
    p_delivery_instructions: input.instructions || null
  });
  if (error) throw readableError(error, 'Could not create the protected Seller Delivery order.');
  return String(data);
}

export async function getSellerDeliveryAddress(marketOrderId: string) {
  const { supabase } = await requireUser();
  const { data, error } = await supabase.rpc('get_market_seller_delivery_address', {
    p_market_order_id: marketOrderId
  });
  if (error) throw readableError(error, 'Could not unlock the delivery address.');
  return data as { address: MarketplaceDeliveryAddress; instructions?: string | null };
}

export async function setSellerDeliveryStatus(marketOrderId: string, status: Exclude<SellerDeliveryStatus, 'not_started' | 'awaiting_payment'>) {
  const { supabase } = await requireUser();
  const { data, error } = await supabase.rpc('update_market_seller_delivery_status', {
    p_market_order_id: marketOrderId,
    p_status: status
  });
  if (error) throw readableError(error, 'Could not update delivery status.');
  return data;
}
