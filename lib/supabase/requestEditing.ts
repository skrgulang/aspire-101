import { getSupabaseBrowserClient } from './client';
import { REQUEST_PUBLIC_SELECT } from './requestProjection';
import type { AspireRequest, ItemCondition, RequestLanguageCode } from './requests';
import type { RequestMedia } from './requestMedia';

export type EditableRequest = AspireRequest & {
  fulfillment_methods?: string[];
  seller_area?: string | null;
  shipping_paid_by_default?: 'buyer' | 'seller' | 'either' | null;
  shipping_paid_by_preference?: 'buyer' | 'seller' | 'either' | null;
  seller_delivery_mode?: 'free' | 'fixed' | 'negotiable' | null;
  seller_delivery_price_cents?: number | null;
};

export type ResubmitRequestInput = {
  requestId: string;
  title: string;
  details: string;
  languageCode: RequestLanguageCode;
  amountCents: number | null;
  itemCondition: ItemCondition | null;
  priceNegotiable: boolean;
  fulfillmentMethods: string[];
  sellerArea: string;
  shippingPaidBy: 'buyer' | 'seller' | 'either' | null;
  sellerDeliveryMode: 'free' | 'fixed' | 'negotiable' | null;
  sellerDeliveryPriceCents: number | null;
  removeMediaIds?: string[];
};

function friendlyResubmitError(error: { message?: string; details?: string; hint?: string }) {
  const detail = `${error.message || ''} ${error.details || ''} ${error.hint || ''}`;
  if (/REQUEST_NOT_FOUND/i.test(detail)) return new Error('This post could not be found, or it is not yours.');
  if (/REQUEST_NOT_EDITABLE/i.test(detail)) return new Error('This post is no longer editable because it is not open.');
  if (/REQUEST_NOT_READY_FOR_RESUBMIT/i.test(detail)) return new Error('This post is not waiting for edits. Refresh My Activity to see its current review status.');
  if (/REQUEST_HAS_CONNECTION/i.test(detail)) return new Error('This post already has protected activity, so its transaction details cannot be rewritten.');
  if (/INVALID_MEDIA_SELECTION/i.test(detail)) return new Error('One or more selected photos can no longer be changed. Refresh the post and try again.');
  if (/INVALID_TITLE/i.test(detail)) return new Error('Add a clear title between 1 and 180 characters.');
  if (/DETAILS_TOO_LONG/i.test(detail)) return new Error('Keep the description under 5,000 characters.');
  if (/INVALID_LANGUAGE/i.test(detail)) return new Error('Choose a supported post language.');
  if (/INVALID_AMOUNT/i.test(detail)) return new Error('Add a positive price or amount.');
  if (/INVALID_FULFILLMENT_METHODS/i.test(detail)) return new Error('Choose at least one valid delivery or pickup option.');
  if (/INVALID_SELLER_AREA/i.test(detail)) return new Error('Add a public selling area such as West Lafayette, IN — not an exact address.');
  if (/INVALID_ITEM_CONDITION/i.test(detail)) return new Error('Choose the item condition.');
  if (/INVALID_SHIPPING_PAYER/i.test(detail)) return new Error('Choose who covers shipping.');
  if (/INVALID_SELLER_DELIVERY_MODE/i.test(detail)) return new Error('Choose a valid seller delivery price option.');
  if (/INVALID_SELLER_DELIVERY_PRICE/i.test(detail)) return new Error('Add a seller delivery price greater than $0.');
  if (/CONTENT_POLICY_BLOCKED/i.test(detail)) return new Error('The revised wording still contains language that cannot be submitted. Edit it and try again.');
  return new Error(error.message || 'Could not resubmit this post.');
}

export async function fetchEditableRequest(requestId: string) {
  const supabase = getSupabaseBrowserClient();
  const { data: auth, error: authError } = await supabase.auth.getUser();
  if (authError) throw authError;
  if (!auth.user) throw new Error('Sign in again before editing this post.');

  const { data, error } = await supabase
    .from('requests')
    .select(REQUEST_PUBLIC_SELECT)
    .eq('id', requestId)
    .eq('poster_id', auth.user.id)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error('This post could not be found, or it is not yours.');
  return data as EditableRequest;
}

export async function removeRequestMediaStorageObjects(assets: RequestMedia[]) {
  if (!assets.length) return;
  const supabase = getSupabaseBrowserClient();
  const { data: auth, error: authError } = await supabase.auth.getUser();
  if (authError) throw authError;
  if (!auth.user) throw new Error('Sign in again before changing photos.');

  const owned = assets.filter((asset) => asset.uploader_id === auth.user!.id);
  if (owned.length !== assets.length) throw new Error('One or more photos cannot be changed by this account.');

  // The v2 resubmit RPC already removed the request_media rows transactionally.
  // At this point the storage paths are intentionally unreferenced, so cleanup
  // cannot alter a reviewed media record even if a storage call fails.
  await supabase.storage
    .from('request-media')
    .remove(owned.map((asset) => asset.storage_path))
    .catch(() => undefined);
}

export async function resubmitRequestForReview(input: ResubmitRequestInput) {
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase.rpc('resubmit_request_for_review_v2', {
    p_request_id: input.requestId,
    p_title: input.title.trim(),
    p_details: input.details.trim(),
    p_language_code: input.languageCode,
    p_amount_cents: input.amountCents,
    p_item_condition: input.itemCondition,
    p_price_negotiable: input.priceNegotiable,
    p_fulfillment_methods: input.fulfillmentMethods,
    p_seller_area: input.sellerArea.trim(),
    p_shipping_paid_by: input.shippingPaidBy,
    p_seller_delivery_mode: input.sellerDeliveryMode,
    p_seller_delivery_price_cents: input.sellerDeliveryPriceCents,
    p_remove_media_ids: input.removeMediaIds ?? []
  });
  if (error) throw friendlyResubmitError(error);
  return String(data || input.requestId);
}
