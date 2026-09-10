import { getSupabaseBrowserClient } from './client';
import {
  clearPostCoverPreference,
  coverSourceForAsset,
  fetchRecommendedCover,
  readPostCoverPreference,
  type RequestCoverSource
} from './coverImages';
import { runRequestAiSafety } from './trust';

export type RequestKind =
  | 'community'
  | 'paid_help'
  | 'split_cost'
  | 'buy_sell'
  | 'collaboration';

export type MarketIntent = 'sell' | 'wanted';
export type ItemCondition = 'new' | 'like_new' | 'good' | 'fair' | 'for_parts';
export type FulfillmentMethod = 'campus_pickup' | 'shipping';
export type RequestModerationStatus = 'pending' | 'approved' | 'rejected' | 'blocked';
export type AiModerationStatus = 'not_scanned' | 'scanning' | 'complete' | 'error';
export type AiRiskLevel = 'unknown' | 'low' | 'medium' | 'high' | 'critical';
export type AiRecommendedAction = 'approve' | 'review' | 'block';
export type TrustBand = 'restricted' | 'caution' | 'new' | 'established' | 'trusted';
export type RequestLanguageCode = 'en' | 'zh' | 'es' | 'ko' | 'ja' | 'fr' | 'hi' | 'ar' | 'vi' | 'other';

export const requestLanguages: { value: RequestLanguageCode; label: string; shortLabel: string }[] = [
  { value: 'en', label: 'English', shortLabel: 'English' },
  { value: 'zh', label: '中文 / Chinese', shortLabel: '中文' },
  { value: 'es', label: 'Español / Spanish', shortLabel: 'Español' },
  { value: 'ko', label: '한국어 / Korean', shortLabel: '한국어' },
  { value: 'ja', label: '日本語 / Japanese', shortLabel: '日本語' },
  { value: 'fr', label: 'Français / French', shortLabel: 'Français' },
  { value: 'hi', label: 'हिन्दी / Hindi', shortLabel: 'हिन्दी' },
  { value: 'ar', label: 'العربية / Arabic', shortLabel: 'العربية' },
  { value: 'vi', label: 'Tiếng Việt / Vietnamese', shortLabel: 'Tiếng Việt' },
  { value: 'other', label: 'Other language', shortLabel: 'Other' }
];

export function requestLanguageLabel(code?: string | null) {
  return requestLanguages.find((item) => item.value === code)?.shortLabel || 'English';
}

export function detectRequestLanguage(locale?: string | null): RequestLanguageCode {
  const base = (locale || '').trim().toLowerCase().split('-')[0];
  if (requestLanguages.some((item) => item.value === base)) return base as RequestLanguageCode;
  return 'en';
}

function readPreferredPostLanguage(): RequestLanguageCode {
  if (typeof window === 'undefined') return 'en';
  const stored = window.localStorage.getItem('aspire:post-language');
  if (stored && requestLanguages.some((item) => item.value === stored)) return stored as RequestLanguageCode;
  return detectRequestLanguage(window.navigator.language);
}

export type AspireRequest = {
  id: string;
  poster_id: string;
  kind: RequestKind;
  category: string;
  title: string;
  details: string | null;
  campus: string | null;
  campus_id?: string | null;
  city: string | null;
  latitude: number | null;
  longitude: number | null;
  amount_cents: number | null;
  currency: string;
  payment_method: 'aspire' | 'in_person' | 'none';
  market_intent?: MarketIntent | null;
  item_condition?: ItemCondition | null;
  price_negotiable?: boolean;
  fulfillment_method?: FulfillmentMethod | null;
  quantity?: number;
  language_code?: RequestLanguageCode;
  cover_image_url?: string | null;
  cover_image_source?: RequestCoverSource;
  cover_image_asset_id?: string | null;
  moderation_status?: RequestModerationStatus;
  moderation_flags?: string[];
  moderation_version?: string;
  moderated_by?: string | null;
  moderated_at?: string | null;
  moderation_reason?: string | null;
  ai_moderation_status?: AiModerationStatus;
  ai_risk_level?: AiRiskLevel;
  ai_risk_score?: number | null;
  ai_recommended_action?: AiRecommendedAction;
  ai_policy_flags?: string[];
  ai_summary?: string | null;
  ai_last_scanned_at?: string | null;
  behavior_risk_score?: number | null;
  behavior_flags?: string[];
  trust_score_snapshot?: number | null;
  trust_band_snapshot?: TrustBand | null;
  status: 'open' | 'matched' | 'in_progress' | 'completed' | 'cancelled' | 'expired';
  created_at: string;
  updated_at: string;
};

export type CreateRequestInput = Pick<AspireRequest, 'kind' | 'category' | 'title'> & {
  details?: string;
  campusId: string;
  amount_cents?: number;
  currency?: string;
  payment_method?: AspireRequest['payment_method'];
  market_intent?: MarketIntent;
  item_condition?: ItemCondition;
  price_negotiable?: boolean;
  fulfillment_method?: FulfillmentMethod;
  quantity?: number;
  language_code?: RequestLanguageCode;
  cover_image_url?: string | null;
  cover_image_source?: RequestCoverSource;
  cover_image_asset_id?: string | null;
};

function friendlyPolicyError(error: { message?: string; details?: string; hint?: string }, fallback: string) {
  const detail = `${error.message || ''} ${error.details || ''} ${error.hint || ''}`;
  if (/CONTENT_POLICY_BLOCKED/i.test(detail)) return new Error('This post contains language that is not allowed on Aspire. Edit it before submitting.');
  if (/MESSAGE_POLICY_BLOCKED/i.test(detail)) return new Error('That message contains language that is not allowed on Aspire.');
  if (/POST_RATE_LIMIT/i.test(detail)) return new Error('You are posting too quickly. Wait a little before submitting another request.');
  if (/RESPONSE_RATE_LIMIT/i.test(detail)) return new Error('You are responding too quickly. Wait a little and try again.');
  if (/ACCOUNT_SUSPENDED/i.test(detail)) return new Error('This Aspire account is suspended from new interactions. Check your account notice or contact support.');
  if (/ACCOUNT_RESTRICTED/i.test(detail)) return new Error('This Aspire account is temporarily restricted from creating new posts or responses. Check your account notice or contact support.');
  return new Error(error.message || fallback);
}

function notifyCampusFeedChanged() {
  if (typeof window === 'undefined') return;
  const version = String(Date.now());
  try { window.localStorage.setItem('aspire:campus-feed-refresh-version', version); } catch { /* ignore storage errors */ }
  window.dispatchEvent(new Event('aspire:campus-feed-refresh'));
}

export async function fetchOpenRequests(limit = 24) {
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase
    .from('requests')
    .select('*')
    .eq('status', 'open')
    .eq('moderation_status', 'approved')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []) as AspireRequest[];
}

export async function createRequest(input: CreateRequestInput) {
  const supabase = getSupabaseBrowserClient();
  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError) throw authError;
  if (!authData.user) throw new Error('You must be signed in to post a request.');

  const { data: allowed, error: accessError } = await supabase.rpc('can_post_request');
  if (accessError) throw accessError;
  if (!allowed) {
    const { data: enforcement } = await supabase
      .from('user_enforcement_states')
      .select('state,reason,expires_at')
      .eq('user_id', authData.user.id)
      .maybeSingle();
    const stillApplies = enforcement && (!enforcement.expires_at || new Date(enforcement.expires_at).getTime() > Date.now());
    if (stillApplies && enforcement.state === 'suspended') throw new Error(`Your Aspire account is suspended from new interactions.${enforcement.reason ? ` ${enforcement.reason}` : ''}`);
    if (stillApplies && enforcement.state === 'restricted') throw new Error(`Your Aspire account is temporarily restricted from creating new posts.${enforcement.reason ? ` ${enforcement.reason}` : ''}`);
    throw new Error('Verify your school identity in Profile before posting.');
  }

  let coverImageUrl = input.cover_image_url ?? null;
  let coverImageAssetId = input.cover_image_asset_id ?? null;
  let coverImageSource: RequestCoverSource = input.cover_image_source ?? 'none';

  if (input.cover_image_source === undefined) {
    const preference = readPostCoverPreference(input.campusId);
    if (preference?.mode === 'none') {
      coverImageUrl = null;
      coverImageAssetId = null;
      coverImageSource = 'none';
    } else if (preference?.mode === 'asset') {
      coverImageUrl = preference.image_url;
      coverImageAssetId = preference.asset_id;
      coverImageSource = preference.source;
    } else {
      try {
        const recommended = await fetchRecommendedCover(input.campusId, input.category);
        if (recommended) {
          coverImageUrl = recommended.image_url;
          coverImageAssetId = recommended.id;
          coverImageSource = coverSourceForAsset(recommended);
        }
      } catch {
        // Recommended artwork is presentation-only and must never block posting.
      }
    }
  }

  const isMarket = input.kind === 'buy_sell';
  const { data, error } = await supabase
    .from('requests')
    .insert({
      poster_id: authData.user.id,
      kind: input.kind,
      category: input.category,
      title: input.title.trim(),
      details: input.details?.trim() || null,
      campus_id: input.campusId,
      latitude: null,
      longitude: null,
      amount_cents: input.amount_cents ?? null,
      currency: input.currency || 'USD',
      payment_method: input.payment_method || 'none',
      market_intent: isMarket ? input.market_intent || 'sell' : null,
      item_condition: isMarket && input.market_intent !== 'wanted' ? input.item_condition || 'good' : null,
      price_negotiable: isMarket ? Boolean(input.price_negotiable) : false,
      fulfillment_method: isMarket ? input.fulfillment_method || 'campus_pickup' : null,
      quantity: isMarket ? Math.max(1, Math.min(99, input.quantity || 1)) : 1,
      language_code: input.language_code || readPreferredPostLanguage(),
      cover_image_url: coverImageUrl,
      cover_image_source: coverImageSource,
      cover_image_asset_id: coverImageAssetId
    })
    .select('*')
    .single();

  if (error) throw friendlyPolicyError(error, 'Could not submit this request.');
  clearPostCoverPreference();
  notifyCampusFeedChanged();
  await runRequestAiSafety(data.id).catch(() => undefined);
  return data as AspireRequest;
}

export async function respondToRequest(requestId: string, message?: string) {
  const supabase = getSupabaseBrowserClient();
  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError) throw authError;
  if (!authData.user) throw new Error('You must be signed in to respond.');

  const { data, error } = await supabase
    .from('request_responses')
    .insert({ request_id: requestId, responder_id: authData.user.id, message: message?.trim() || null })
    .select('*')
    .single();
  if (error) throw friendlyPolicyError(error, 'Could not send your response.');
  return data;
}
