import { getSupabaseBrowserClient } from './client';
import { trackProductEvent } from '../analytics/client';
import { validateRequestImages } from './requestMedia';
import { runRequestAiSafety } from './trust';
import type { ItemCondition, RequestLanguageCode } from './requests';

export type MarketplaceDeliveryMethod = 'campus_pickup' | 'shipping' | 'seller_delivery' | 'aspirer_delivery';
export type ShippingPayer = 'buyer' | 'seller' | 'either';
export type SellerDeliveryMode = 'free' | 'fixed' | 'negotiable';

export type MarketplaceDraft = {
  id: string;
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
  photo_storage_path: string | null;
  photo_mime_type: string | null;
  language_code: RequestLanguageCode;
  photo_url?: string;
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
  languageCode?: RequestLanguageCode;
};

export type MarketplaceListingInput = Omit<MarketplaceDraftInput, 'id'>;

const draftBucket = 'marketplace-drafts';
const draftSignedUrlSeconds = 60 * 60;
const marketplaceDraftSelect = 'id,campus_id,title,price_cents,item_condition,details,fulfillment_methods,shipping_paid_by,seller_delivery_mode,seller_delivery_price_cents,seller_area,photo_storage_path,photo_mime_type,language_code,updated_at' as const;

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
  // This legacy column only allows pickup, shipping, or null. Newer methods
  // stay in fulfillment_methods so Aspirer-only / seller-only listings publish.
  if (methods.includes('campus_pickup')) return 'campus_pickup';
  if (methods.includes('shipping')) return 'shipping';
  return null;
}

function extensionFor(file: File) {
  if (file.type === 'image/png') return 'png';
  if (file.type === 'image/webp') return 'webp';
  return 'jpg';
}

function extensionFromPath(path: string) {
  const ext = path.split('.').pop()?.toLowerCase();
  return ext && /^[a-z0-9]{2,5}$/.test(ext) ? ext : 'jpg';
}

function friendlyError(error: { message?: string; details?: string; hint?: string }, fallback: string) {
  const detail = `${error.message || ''} ${error.details || ''} ${error.hint || ''}`;
  if (/POST_RATE_LIMIT/i.test(detail)) return new Error('You are posting too quickly. Wait a little and try again.');
  if (/ACCOUNT_SUSPENDED/i.test(detail)) return new Error('This Aspire account is suspended from new posts.');
  if (/ACCOUNT_RESTRICTED/i.test(detail)) return new Error('This Aspire account is temporarily restricted from new posts.');
  if (/row-level security|permission denied for function can_upload_|policy/i.test(detail)) return new Error('Aspire could not attach that photo to this draft. Please try again.');
  return new Error(error.message || fallback);
}

async function attachDraftPhotoUrls(rows: MarketplaceDraft[]) {
  const paths = rows.map((row) => row.photo_storage_path).filter((value): value is string => Boolean(value));
  if (!paths.length) return rows;

  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase.storage.from(draftBucket).createSignedUrls(paths, draftSignedUrlSeconds);
  if (error || !data) return rows;

  const urlByPath = new Map<string, string>();
  data.forEach((entry, index) => {
    const url = entry?.signedUrl;
    if (url) urlByPath.set(paths[index], url);
  });

  return rows.map((row) => ({
    ...row,
    photo_url: row.photo_storage_path ? urlByPath.get(row.photo_storage_path) : undefined
  }));
}

export async function listMarketplaceDrafts() {
  const { supabase, user } = await requireUser();
  const { data, error } = await supabase
    .from('marketplace_listing_drafts')
    .select(marketplaceDraftSelect)
    .eq('user_id', user.id)
    .order('updated_at', { ascending: false });
  if (error) throw friendlyError(error, 'Could not load draft items.');
  return attachDraftPhotoUrls((data ?? []) as MarketplaceDraft[]);
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
    language_code: input.languageCode || 'any',
    updated_at: new Date().toISOString()
  };

  if (input.id) {
    const { data, error } = await supabase
      .from('marketplace_listing_drafts')
      .update(payload)
      .eq('id', input.id)
      .eq('user_id', user.id)
      .select(marketplaceDraftSelect)
      .single();
    if (error) throw friendlyError(error, 'Could not update this draft.');
    return data as MarketplaceDraft;
  }

  const { data, error } = await supabase
    .from('marketplace_listing_drafts')
    .insert(payload)
    .select(marketplaceDraftSelect)
    .single();
  if (error) throw friendlyError(error, 'Could not save this draft.');
  return data as MarketplaceDraft;
}

export async function uploadMarketplaceDraftPhoto(draftId: string, file: File) {
  validateRequestImages([file]);
  const { supabase, user } = await requireUser();
  const { data: draft, error: draftError } = await supabase
    .from('marketplace_listing_drafts')
    .select('id,photo_storage_path')
    .eq('id', draftId)
    .eq('user_id', user.id)
    .single();
  if (draftError) throw friendlyError(draftError, 'Could not find this draft.');

  const previousPath = (draft?.photo_storage_path as string | null) || null;
  const path = `${user.id}/${draftId}/${crypto.randomUUID()}.${extensionFor(file)}`;
  const { error: uploadError } = await supabase.storage
    .from(draftBucket)
    .upload(path, file, { cacheControl: '3600', upsert: false, contentType: file.type });
  if (uploadError) throw friendlyError(uploadError, 'Could not upload this draft photo.');

  const { data: updated, error: updateError } = await supabase
    .from('marketplace_listing_drafts')
    .update({ photo_storage_path: path, photo_mime_type: file.type, updated_at: new Date().toISOString() })
    .eq('id', draftId)
    .eq('user_id', user.id)
    .select(marketplaceDraftSelect)
    .single();

  if (updateError) {
    await supabase.storage.from(draftBucket).remove([path]).catch(() => undefined);
    throw friendlyError(updateError, 'Could not attach the photo to this draft.');
  }

  if (previousPath && previousPath !== path) {
    await supabase.storage.from(draftBucket).remove([previousPath]).catch(() => undefined);
  }

  const { data: signed } = await supabase.storage.from(draftBucket).createSignedUrl(path, draftSignedUrlSeconds);
  return { ...(updated as MarketplaceDraft), photo_url: signed?.signedUrl };
}

export async function downloadMarketplaceDraftPhoto(path: string, mimeType?: string | null) {
  const { supabase, user } = await requireUser();
  if (!path.startsWith(`${user.id}/`)) throw new Error('This draft photo does not belong to your account.');

  const { data, error } = await supabase.storage.from(draftBucket).download(path);
  if (error || !data) throw error || new Error('Could not restore this draft photo.');

  const type = mimeType || data.type || 'image/jpeg';
  return new File([data], `draft-photo.${extensionFromPath(path)}`, { type });
}

export async function deleteMarketplaceDraft(draftId: string) {
  const { supabase, user } = await requireUser();
  const { data: draft } = await supabase
    .from('marketplace_listing_drafts')
    .select('photo_storage_path')
    .eq('id', draftId)
    .eq('user_id', user.id)
    .maybeSingle();

  const photoPath = (draft?.photo_storage_path as string | null) || null;

  // Delete the database row first so a storage failure can only leave an
  // unreferenced private object, never a live draft pointing at a missing photo.
  const { error } = await supabase
    .from('marketplace_listing_drafts')
    .delete()
    .eq('id', draftId)
    .eq('user_id', user.id);
  if (error) throw friendlyError(error, 'Could not delete this draft.');

  if (photoPath) await supabase.storage.from(draftBucket).remove([photoPath]).catch(() => undefined);
}

export async function createMarketplaceListing(input: MarketplaceListingInput) {
  const { supabase } = await requireUser();
  const methods = normalizeMethods(input.fulfillmentMethods);
  if (!methods.length) throw new Error('Choose at least one delivery option.');
  if (!input.title.trim()) throw new Error('Add an item title.');
  if (!input.priceCents || input.priceCents <= 0) throw new Error('Add a price greater than $0.');
  if (!normalizeSellerArea(input.sellerArea)) throw new Error('Add a public selling area such as West Lafayette, IN.');

  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  if (sessionError) throw sessionError;
  const token = sessionData.session?.access_token;
  if (!token) throw new Error('Sign in again to publish this item.');

  const response = await fetch('/api/marketplace/listing/create', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      campusId: input.campusId,
      title: input.title.trim().slice(0, 180),
      priceCents: input.priceCents,
      itemCondition: input.itemCondition,
      details: input.details?.trim() || '',
      fulfillmentMethods: methods,
      shippingPaidBy: methods.includes('shipping') ? input.shippingPaidBy || 'buyer' : null,
      sellerDeliveryMode: methods.includes('seller_delivery') ? input.sellerDeliveryMode || 'negotiable' : null,
      sellerDeliveryPriceCents: methods.includes('seller_delivery') && input.sellerDeliveryMode === 'fixed'
        ? input.sellerDeliveryPriceCents ?? null
        : null,
      sellerArea: normalizeSellerArea(input.sellerArea),
      languageCode: input.languageCode || 'en'
    })
  });

  const payload = await response.json().catch(() => ({})) as {
    id?: string;
    title?: string;
    moderation_status?: string;
    error?: string;
    code?: string;
  };

  if (!response.ok || !payload.id) {
    if (payload.code === 'PAYOUT_NOT_READY') {
      throw new Error('Finish Stripe payout verification before publishing an item for sale.');
    }
    throw new Error(payload.error || 'Could not publish this item.');
  }

  const data = {
    id: payload.id,
    title: payload.title || input.title.trim(),
    moderation_status: payload.moderation_status
  };
  await runRequestAiSafety(data.id).catch(() => undefined);
  void trackProductEvent('marketplace_listing_created', {
    item_condition: input.itemCondition,
    language_code: input.languageCode || 'en',
    fulfillment_count: methods.length,
    shipping_enabled: methods.includes('shipping'),
    seller_delivery_enabled: methods.includes('seller_delivery')
  });
  return data;
}

export async function rollbackMarketplaceListing(requestId: string) {
  const { supabase, user } = await requireUser();
  await supabase.from('requests').delete().eq('id', requestId).eq('poster_id', user.id);
}
