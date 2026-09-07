import { getSupabaseBrowserClient } from './client';
import type { ItemCondition, MarketIntent, RequestKind } from './requests';

export type AspireAgentAction = 'join_existing' | 'create_request' | 'explore' | 'need_details';
export type AspireAgentOutcome = 'planned' | 'opened_match' | 'drafted_post' | 'posted' | 'connected' | 'completed' | 'dismissed';
export type AspireAgentMode = 'action' | 'platform_help' | 'account_help';
export type AspireAgentLink = { label: string; href: string };

export class AspireAgentError extends Error {
  code?: string;

  constructor(message: string, code?: string) {
    super(message);
    this.name = 'AspireAgentError';
    this.code = code;
  }
}

export type AspireAgentPlan = {
  status: 'ready' | 'needs_details' | 'blocked';
  intent_summary: string;
  assistant_message: string;
  category: string;
  kind: RequestKind;
  title: string;
  details: string;
  amount_cents: number | null;
  payment_method: 'none' | 'in_person' | 'aspire';
  market_intent: MarketIntent | null;
  item_condition: ItemCondition | null;
  price_negotiable: boolean | null;
  time_text: string;
  place_text: string;
  confidence: 'high' | 'medium' | 'low';
  next_action: AspireAgentAction;
  questions: string[];
};

export type AspireAgentMatch = {
  id: string;
  title: string;
  category: string;
  kind: string;
  amount_cents: number | null;
  market_intent: string | null;
  reason: string;
  strength: 'strong' | 'possible';
};

export type AspireAgentResponse = {
  ok: boolean;
  mode?: AspireAgentMode;
  sessionId: string | null;
  status: 'ready' | 'needs_details' | 'blocked';
  assistantMessage: string;
  campus?: { id: string; name: string; shortName: string };
  plan: AspireAgentPlan | null;
  matches: AspireAgentMatch[];
  links?: AspireAgentLink[];
};

export type AspireAgentDraftEnvelope = {
  sessionId: string | null;
  createdAt: string;
  plan: AspireAgentPlan;
};

export type AspireAgentMatchEnvelope = {
  sessionId: string | null;
  createdAt: string;
  matches: AspireAgentMatch[];
};

const draftKey = 'aspire-agent-draft';
const matchKey = 'aspire-agent-matches';

function looksLikePlatformQuestion(message: string) {
  const value = message.toLowerCase().trim();
  const questionLanguage = /(^|\s)(what|how|why|where|when|can|could|does|do|is|are|will|should)(\s|$)|\?/i.test(value);
  const platformSubject = /\b(aspire|aspire protected|protection|refund|payout|service fee|fees|marketplace rules|moderation|pending review|my circle|verification|verified|profile photo|profile picture|avatar|payment protection|seller payout|provider payout)\b/i.test(value);
  const personalStatus = /\b(where|why|status|what).{0,35}\b(my )?(payment|payout|refund|post|money)\b/i.test(value);
  const explicitPlatformHow = /\bhow does (aspire|protected|marketplace|delivery|refund|payout|moderation|verification)\b/i.test(value);
  return personalStatus || explicitPlatformHow || (questionLanguage && platformSubject);
}

async function authToken() {
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  const token = data.session?.access_token;
  if (!token) throw new AspireAgentError('Sign in again to use Aspire Agent.', 'AUTH_REQUIRED');
  return token;
}

export async function runAspireAgent(message: string, campusId?: string | null) {
  const token = await authToken();
  const trimmed = message.trim();
  const platformQuestion = looksLikePlatformQuestion(trimmed);
  const endpoint = platformQuestion ? '/api/ai/platform-help' : '/api/ai/agent';
  const body = platformQuestion
    ? { question: trimmed }
    : { message: trimmed, campusId: campusId || undefined };

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  const payload = await response.json().catch(() => ({})) as AspireAgentResponse & { error?: string; code?: string };
  if (!response.ok) {
    throw new AspireAgentError(payload.error || 'Aspire Agent could not finish that request.', payload.code);
  }
  return payload as AspireAgentResponse;
}

export function saveAspireAgentDraft(sessionId: string | null, plan: AspireAgentPlan) {
  if (typeof window === 'undefined') return;
  const envelope: AspireAgentDraftEnvelope = { sessionId, createdAt: new Date().toISOString(), plan };
  window.sessionStorage.setItem(draftKey, JSON.stringify(envelope));
}

export function readAspireAgentDraft() {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.sessionStorage.getItem(draftKey);
    return raw ? JSON.parse(raw) as AspireAgentDraftEnvelope : null;
  } catch {
    return null;
  }
}

export function clearAspireAgentDraft() {
  if (typeof window !== 'undefined') window.sessionStorage.removeItem(draftKey);
}

export function saveAspireAgentMatches(sessionId: string | null, matches: AspireAgentMatch[]) {
  if (typeof window === 'undefined') return;
  const envelope: AspireAgentMatchEnvelope = { sessionId, createdAt: new Date().toISOString(), matches };
  window.sessionStorage.setItem(matchKey, JSON.stringify(envelope));
}

export function readAspireAgentMatches() {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.sessionStorage.getItem(matchKey);
    return raw ? JSON.parse(raw) as AspireAgentMatchEnvelope : null;
  } catch {
    return null;
  }
}

export function clearAspireAgentMatches() {
  if (typeof window !== 'undefined') window.sessionStorage.removeItem(matchKey);
}

export async function markAspireAgentOutcome(sessionId: string | null | undefined, outcome: AspireAgentOutcome) {
  if (!sessionId) return;
  const supabase = getSupabaseBrowserClient();
  const { error } = await supabase
    .from('aspire_ai_sessions')
    .update({ outcome })
    .eq('id', sessionId);
  if (error) throw error;
}
