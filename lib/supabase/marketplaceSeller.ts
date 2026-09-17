import { getSupabaseBrowserClient } from './client';
import { runRequestAiSafety } from './trust';
import type { ItemCondition, RequestLanguageCode } from './requests';

export type MarketplaceDeliveryMethod = 'campus_pickup' | 'shipping' | 'seller_delivery' | 'aspirer_delivery';
export type ShippingPayer = 'buyer' | 'seller' | 'either';
export type SellerDeliveryMode = 'free' | 'fixed' | 'negotiable';

export type MarketplaceDraft = {
  id: string;
  user_id: string;
  campus_id: string | null;
  title: string;
  price_cents: number | null;
  item_condition: ItemCondition;
  details: string;
  fulfillment_methods: MarketplaceDeliveryMethod[];
  shipping_paid_by: ShippingPayer | null;
  seller_delivery_mode: SellerDeliveryMode | null;
  seller_delivery_price_cents: number | null;
  seller_area: string | null;
  created_at: string;
  updated_at: string;
};

export type MarketplaceDraftInput = {
  id?: string | null;
  campusId: string;
  title: string;
  priceCents?: number | null;
  itemCondition: ItemCondition;
  details?: string;
  fulfillmentMethods: MarketplaceDeliveryMethod[];
  shippingPaidBy?: ShippingPayer | null;
  sellerDeliveryMode?: SellerDeliveryMode | null;
  sellerDeliveryPriceCents?: number | null;
  sellerArea?: string | null;
};

export type MarketplaceListingInput = Omit<MarketplaceDraftInput, 'id'> & {
  languageCode?: RequestLanguageCode;
};

async function requireUser() {
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase.auth.getUser();
  if (error) throw error;
  if (!data.user) throw new Error('Sign in again to continue.');
  return { supabase, user: data.user };
}

function normalizeMethods(methods: MarketplaceDeliveryMethod[]) {
  return Array.from(new Set(methods)).slice(0, 4);
}

function normalizeSellerArea(value?: string | null) {
  const clean = value?.trim().replace(/\s+/g, ' ') || '';
  return clean ? clean.slice(0, 120) : null;
}

function primaryFulfillment(methods: MarketplaceDeliveryMethod[]) {
  // The legacy single-value column only allows pickup, shipping, or null.
  // Newer methods live in fulfillment_methods and must never be written here.
  if (methods.includes('campus_pickup')) return 'campus_pickup';
  if (methods.includes('shipping')) return 'shipping';
  return null;
}

function friendlyError(error: { message?: string; details?: string; hint?: string }, fallback: string) {
  const detail = `${error.message || ''} ${error.details || ''} ${error.hint || ''}`;
  if (/POST_RATE_LIMIT/i.test(detail)) return new Error('You are posting too quickly. Wait a little and try again.');
  if (/ACCOUNT_SUSPENDED/i.test(detail)) return new Error('This Aspire account is suspended from new posts.');
  if (/ACCOUNT_RESTRICTED/i.test(detail)) return new Error('This Aspire account is temporarily restricted from new posts.');
  if (/row-level security|policy/i.test(detail)) return new Error('Your seller session could not publish this item. Refresh and sign in again.');
  return new Error(error.message || fallback);
}

export async function listMarketplaceDrafts() {
  const { supabase, user } = await requireUser();
  const { data, error } = await supabase
    .from('marketplace_listing_drafts')
    .select('*')
    .eq('user_id', user.id)
    .order('updated_at', { ascending: false });
  if (error) throw friendlyError(error, 'Could not load draft items.');
  return (data ?? []) as MarketplaceDraft[];
}

export async function saveMarketplaceDraft(input: MarketplaceDraftInput) {
  const { supabase, user } = await requireUser();
  const methods = normalizeMethods(input.fulfillmentMethods);
  if (!methods.length) throw new Error('Choose at least one delivery option before saving.');

  const payload = {
    user_id: user.id,
    campus_id: input.campusId || null,
    title: input.title.trim().slice(0, 180),
    price_cents: input.priceCents ?? null,
    item_condition: input.itemCondition,
    details: input.details?.trim() || '',
    fulfillment_methods: methods,
    shipping_paid_by: methods.includes('shipping') ? input.shippingPaidBy || 'buyer' : null,
    seller_delivery_mode: methods.includes('seller_delivery') ? input.sellerDeliveryMode || 'negotiable' : null,
    seller_delivery_price_cents: methods.includes('seller_delivery') && input.sellerDeliveryMode === 'fixed'
      ? input.sellerDeliveryPriceCents ?? null
      : null,
    seller_area: normalizeSellerArea(input.sellerArea),
    updated_at: new Date().toISOString()
  };

  if (input.id) {
    const { data, error } = await supabase
      .from('marketplace_listing_drafts')
      .update(payload)
      .eq('id', input.id)
      .eq('user_id', user.id)
      .select('*')
      .single();
    if (error) throw friendlyError(error, 'Could not update this draft.');
    return data as MarketplaceDraft;
  }

  const { data, error } = await supabase
    .from('marketplace_listing_drafts')
    .insert(payload)
    .select('*')
    .single();
  if (error) throw friendlyError(error, 'Could not save this draft.');
  return data as MarketplaceDraft;
}

export async function deleteMarketplaceDraft(draftId: string) {
  const { supabase, user } = await requireUser();
  const { error } = await supabase
    .from('marketplace_listing_drafts')
    .delete()
    .eq('id', draftId)
    .eq('user_id', user.id);
  if (error) throw friendlyError(error, 'Could not delete this draft.');
}

export async function createMarketplaceListing(input: MarketplaceListingInput) {
  const { supabase, user } = await requireUser();
  const methods = normalizeMethods(input.fulfillmentMethods);
  if (!methods.length) throw new Error('Choose at least one delivery option.');
  if (!input.title.trim()) throw new Error('Add an item title.');
  if (!input.priceCents || input.priceCents <= 0) throw new Error('Add a price greater than $0.');
  if (!normalizeSellerArea(input.sellerArea)) throw new Error('Add a public selling area such as West Lafayette, IN.');

  const { data: allowed, error: accessError } = await supabase.rpc('can_post_request');
  if (accessError) throw accessError;
  if (!allowed) throw new Error('Verify your campus identity before publishing an item.');

  const shippingPolicy = methods.includes('shipping') ? input.shippingPaidBy || 'buyer' : null;
  const { data, error } = await supabase
    .from('requests')
    .insert({
      poster_id: user.id,
      kind: 'buy_sell',
      category: 'Buy & sell',
      title: input.title.trim().slice(0, 180),
      details: input.details?.trim() || null,
      campus_id: input.campusId,
      latitude: null,
      longitude: null,
      seller_area: normalizeSellerArea(input.sellerArea),
      amount_cents: input.priceCents,
      currency: 'USD',
      payment_method: 'aspire',
      market_intent: 'sell',
      item_condition: input.itemCondition,
      price_negotiable: false,
      fulfillment_method: primaryFulfillment(methods),
      fulfillment_methods: methods,
      shipping_paid_by_default: shippingPolicy,
      shipping_paid_by_preference: shippingPolicy,
      seller_delivery_mode: methods.includes('seller_delivery') ? input.sellerDeliveryMode || 'negotiable' : null,
      seller_delivery_price_cents: methods.includes('seller_delivery') && input.sellerDeliveryMode === 'fixed'
        ? input.sellerDeliveryPriceCents ?? null
        : null,
      quantity: 1,
      language_code: input.languageCode || 'en',
      cover_image_url: null,
      cover_image_source: 'none',
      cover_image_asset_id: null,
      listing_expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
    })
    .select('*')
    .single();

  if (error) throw friendlyError(error, 'Could not publish this item.');
  await runRequestAiSafety(data.id).catch(() => undefined);
  return data as { id: string; moderation_status?: string; title: string };
}

export async function rollbackMarketplaceListing(requestId: string) {
  const { supabase, user } = await requireUser();
  await supabase.from('requests').delete().eq('id', requestId).eq('poster_id', user.id);
}
