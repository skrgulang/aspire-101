import { getSupabaseBrowserClient } from './client';
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
};

function friendlyPolicyError(error: { message?: string; details?: string; hint?: string }, fallback: string) {
  const detail = `${error.message || ''} ${error.details || ''} ${error.hint || ''}`;
  if (/CONTENT_POLICY_BLOCKED/i.test(detail)) {
    return new Error('This post contains language that is not allowed on Aspire. Edit it before submitting.');
  }
  if (/MESSAGE_POLICY_BLOCKED/i.test(detail)) {
    return new Error('That message contains language that is not allowed on Aspire.');
  }
  return new Error(error.message || fallback);
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
  if (!allowed) throw new Error('Verify your school identity in Profile before posting.');

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
      quantity: isMarket ? Math.max(1, Math.min(99, input.quantity || 1)) : 1
    })
    .select('*')
    .single();

  if (error) throw friendlyPolicyError(error, 'Could not submit this request.');

  // The request stays pending regardless of scan availability. Text is scanned now;
  // requestMedia runs a second multimodal scan after any images finish uploading.
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
    .insert({
      request_id: requestId,
      responder_id: authData.user.id,
      message: message?.trim() || null
    })
    .select('*')
    .single();

  if (error) throw friendlyPolicyError(error, 'Could not send your response.');
  return data;
}
