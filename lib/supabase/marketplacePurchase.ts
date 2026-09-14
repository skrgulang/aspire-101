import { getSupabaseBrowserClient } from './client';
import { runRequestAiSafety } from './trust';

export type FlexibleFulfillmentMethod = 'campus_pickup' | 'shipping' | 'aspirer_delivery';
export type DeliveryRewardMode = 'free' | 'fixed' | 'negotiable';

export type MarketplacePurchaseInput = {
  requestId: string;
  fulfillmentMethod: FlexibleFulfillmentMethod;
  pickupArea?: string | null;
  dropoffArea?: string | null;
  rewardMode?: DeliveryRewardMode | null;
  rewardCents?: number | null;
  preferredAt?: string | null;
};

export type MarketplacePurchaseResult = {
  connection_id: string;
  market_order_id: string | null;
  delivery_job_id: string | null;
  delivery_request_id: string | null;
  fulfillment_method: FlexibleFulfillmentMethod;
};

export type ListingFulfillment = {
  id: string;
  fulfillment_method: FlexibleFulfillmentMethod | null;
  fulfillment_methods: FlexibleFulfillmentMethod[];
};

export async function fetchListingFulfillmentMethods(requestIds: string[]) {
  if (requestIds.length === 0) return new Map<string, ListingFulfillment>();
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase
    .from('requests')
    .select('id,fulfillment_method,fulfillment_methods')
    .in('id', requestIds);
  if (error) throw error;

  const map = new Map<string, ListingFulfillment>();
  for (const row of data ?? []) {
    const legacy = (row.fulfillment_method || 'campus_pickup') as FlexibleFulfillmentMethod;
    const methods = Array.isArray(row.fulfillment_methods) && row.fulfillment_methods.length > 0
      ? row.fulfillment_methods as FlexibleFulfillmentMethod[]
      : [legacy];
    map.set(row.id, { id: row.id, fulfillment_method: legacy, fulfillment_methods: methods });
  }
  return map;
}

export async function purchaseMarketplaceListingFlexible(input: MarketplacePurchaseInput) {
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase.rpc('purchase_marketplace_listing_flexible', {
    p_request_id: input.requestId,
    p_fulfillment_method: input.fulfillmentMethod,
    p_pickup_area: input.pickupArea || null,
    p_dropoff_area: input.dropoffArea || null,
    p_reward_mode: input.rewardMode || null,
    p_reward_cents: input.rewardCents ?? null,
    p_preferred_at: input.preferredAt || null
  });
  if (error) throw error;

  const result = data as MarketplacePurchaseResult;
  if (result?.delivery_request_id) {
    // The linked delivery post remains hidden by RLS until moderation approves it.
    await runRequestAiSafety(result.delivery_request_id).catch(() => null);
  }
  return result;
}
