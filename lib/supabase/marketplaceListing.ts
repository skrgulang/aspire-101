import { getSupabaseBrowserClient } from './client';
import type { FlexibleFulfillmentMethod } from './marketplacePurchase';

export async function setMarketplaceFulfillmentMethods(requestId: string, methods: FlexibleFulfillmentMethod[]) {
  if (!methods.length) throw new Error('Choose at least one fulfillment method.');
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase.rpc('set_marketplace_fulfillment_methods', {
    p_request_id: requestId,
    p_methods: methods
  });
  if (error) throw error;
  return data;
}
