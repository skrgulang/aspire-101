import { NextResponse } from 'next/server';
import {
  getAuthenticatedUser,
  getSupabaseServiceClient,
  requireEnv
} from '../../../../lib/server/aspireServer';

export const runtime = 'nodejs';

const moderationModel = 'omni-moderation-latest';
const signedImageSeconds = 10 * 60;
const aiImageMimeTypes = new Set(['image/jpeg', 'image/png', 'image/webp']);

type ModerationResult = {
  flagged?: boolean;
  categories?: Record<string, boolean>;
  category_scores?: Record<string, number>;
  category_applied_input_types?: Record<string, string[]>;
};

type ModerationPayload = {
  id?: string;
  model?: string;
  results?: ModerationResult[];
  error?: { message?: string };
};

type RequestForScan = {
  id: string;
  poster_id: string;
  title: string;
  details: string | null;
  category: string;
  kind: string;
  campus_id: string | null;
  amount_cents: number | null;
  market_intent: string | null;
  moderation_status: string;
  moderation_flags: string[] | null;
  created_at: string;
};

type TrustProfile = {
  trust_score: number;
  trust_band: string;
  rejected_posts: number;
  removed_posts: number;
  high_risk_rejections: number;
};

type BehaviorContext = {
  flags: string[];
  riskScore: number;
  trustScore: number | null;
  trustBand: string | null;
};

function platformPolicyFlags(text: string, kind: string) {
  const value = text.toLowerCase();
  const flags = new Set<string>();

  if (/(telegram|whats\s?app|signal|wechat|snapchat|instagram|discord|dm me|text me|call me)/i.test(value) || /\b\d{3}[-.\s)]*\d{3}[-.\s]*\d{4}\b/.test(value)) {
    flags.add('off_platform_contact');
  }
  if (/(zelle|venmo|cash\s?app|paypal friends|friends and family|bitcoin|crypto|wire transfer|gift[ -]?card|cash only|pay me directly|outside aspire|off[- ]platform)/i.test(value)) {
    flags.add('off_platform_payment');
  }
  if (/(password|login credentials?|account credentials?|verification code|one[- ]time code|\botp\b|2fa code)/i.test(value)) {
    flags.add('credential_trade');
  }
  if (/(gun|firearm|ammo|ammunition|silencer|switchblade|taser|weed|marijuana|cocaine|fentanyl|vape|nicotine|steroid)/i.test(value)) {
    flags.add('regulated_or_prohibited_item');
  }
  if (/(act now|pay first|deposit first|send (the )?(money|payment) first|no refund|guaranteed profit|easy money|too good to be true)/i.test(value)) {
    flags.add('scam_pressure');
  }
  if (/(cheaper|discount|better price).{0,40}(telegram|zelle|venmo|cash\s?app|outside aspire|off[- ]platform)/i.test(value)) {
    flags.add('off_platform_evasion');
  }
  if (/(social security|\bssn\b|credit card number|bank account number|routing number|passport number)/i.test(value)) {
    flags.add('sensitive_personal_data');
  }
  if (kind === 'buy_sell' && /(counterfeit|fake designer|replica|stolen|hot item|gift[ -]?card|account for sale|game account)/i.test(value)) {
    flags.add('marketplace_prohibited_listing');
  }

  return [...flags];
}

function topScores(scores: Record<string, number>) {
  return Object.entries(scores)
    .filter(([, score]) => Number.isFinite(score))
    .sort((a, b) => b[1] - a[1]);
}

function median(values: number[]) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : Math.round((sorted[middle - 1] + sorted[middle]) / 2);
}

async function loadBehaviorContext(
  aspireRequest: RequestForScan,
  supabase: ReturnType<typeof getSupabaseServiceClient>
): Promise<BehaviorContext> {
  await supabase.rpc('refresh_user_trust_profile', { p_user_id: aspireRequest.poster_id }).catch(() => undefined);

  const hourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  const [hourPosts, dayPosts, duplicatePosts, profileResult, trustResult, baselineResult] = await Promise.all([
    supabase.from('requests').select('id', { count: 'exact', head: true }).eq('poster_id', aspireRequest.poster_id).gte('created_at', hourAgo),
    supabase.from('requests').select('id', { count: 'exact', head: true }).eq('poster_id', aspireRequest.poster_id).gte('created_at', dayAgo),
    supabase.from('requests').select('id', { count: 'exact', head: true }).eq('poster_id', aspireRequest.poster_id).eq('title', aspireRequest.title).neq('id', aspireRequest.id).gte('created_at', dayAgo),
    supabase.from('profiles').select('created_at').eq('id', aspireRequest.poster_id).maybeSingle(),
    supabase.from('user_trust_profiles').select('trust_score,trust_band,rejected_posts,removed_posts,high_risk_rejections').eq('user_id', aspireRequest.poster_id).maybeSingle(),
    aspireRequest.kind === 'buy_sell' && aspireRequest.campus_id && aspireRequest.amount_cents
      ? supabase.from('requests').select('amount_cents').eq('kind', 'buy_sell').eq('campus_id', aspireRequest.campus_id).eq('moderation_status', 'approved').eq('market_intent', aspireRequest.market_intent || 'sell').not('amount_cents', 'is', null).limit(50)
      : Promise.resolve({ data: [] as Array<{ amount_cents: number | null }>, error: null })
  ]);

  const flags = new Set<string>();
  let riskScore = 0;
  const hourCount = hourPosts.count ?? 0;
  const dayCount = dayPosts.count ?? 0;
  const duplicateCount = duplicatePosts.count ?? 0;
  const trust = (trustResult.data ?? null) as TrustProfile | null;
  const trustScore = trust?.trust_score ?? null;
  const trustBand = trust?.trust_band ?? null;

  if (hourCount >= 6) { flags.add('rapid_posting'); riskScore += 20; }
  if (dayCount >= 15) { flags.add('posting_burst'); riskScore += 15; }
  if (duplicateCount >= 2) { flags.add('repeated_duplicate_listing'); riskScore += 25; }

  const createdAt = profileResult.data?.created_at ? new Date(profileResult.data.created_at).getTime() : 0;
  const accountAgeHours = createdAt ? (Date.now() - createdAt) / (60 * 60 * 1000) : null;
  const highValue = (aspireRequest.amount_cents ?? 0) >= 20000;
  if (accountAgeHours !== null && accountAgeHours < 48 && highValue && ['buy_sell', 'paid_help'].includes(aspireRequest.kind)) {
    flags.add('new_account_high_value');
    riskScore += 25;
  }

  if (trustBand === 'restricted') { flags.add('restricted_trust_history'); riskScore += 35; }
  else if (trustBand === 'caution') { flags.add('caution_trust_history'); riskScore += 18; }
  if ((trust?.removed_posts ?? 0) > 0) { flags.add('prior_enforcement'); riskScore += 15; }
  if ((trust?.high_risk_rejections ?? 0) > 0) { flags.add('prior_high_risk_rejection'); riskScore += 15; }

  const prices = (baselineResult.data ?? [])
    .map((row) => Number(row.amount_cents))
    .filter((value) => Number.isFinite(value) && value > 0);
  const campusMedian = median(prices);
  if (campusMedian && prices.length >= 5 && aspireRequest.amount_cents) {
    if (aspireRequest.amount_cents <= campusMedian * 0.35) {
      flags.add('price_far_below_campus_baseline');
      riskScore += 20;
    } else if (aspireRequest.amount_cents >= campusMedian * 3) {
      flags.add('price_far_above_campus_baseline');
      riskScore += 10;
    }
  }

  return {
    flags: [...flags],
    riskScore: Math.min(100, riskScore),
    trustScore,
    trustBand
  };
}

function classifyRisk(
  result: ModerationResult,
  platformFlags: string[],
  ruleFlags: string[],
  behavior: BehaviorContext
) {
  const categories = result.categories ?? {};
  const scores = result.category_scores ?? {};
  const ranked = topScores(scores);
  const maxScore = ranked[0]?.[1] ?? 0;

  const severeKeys = new Set([
    'sexual/minors',
    'hate/threatening',
    'self-harm/instructions',
    'self-harm/intent',
    'violence/graphic',
    'illicit/violent'
  ]);
  const severeScore = ranked
    .filter(([key]) => severeKeys.has(key))
    .reduce((max, [, score]) => Math.max(max, score), 0);

  const highPlatform = platformFlags.some((flag) => [
    'regulated_or_prohibited_item',
    'credential_trade',
    'marketplace_prohibited_listing',
    'off_platform_evasion',
    'sensitive_personal_data'
  ].includes(flag));

  let riskLevel: 'low' | 'medium' | 'high' | 'critical' = 'low';
  if (severeScore >= 0.5 || (Boolean(result.flagged) && severeScore >= 0.25)) riskLevel = 'critical';
  else if (Boolean(result.flagged) || maxScore >= 0.7 || highPlatform || ruleFlags.includes('restricted_market_term') || behavior.riskScore >= 60) riskLevel = 'high';
  else if (maxScore >= 0.25 || platformFlags.length > 0 || ruleFlags.length > 0 || behavior.riskScore >= 25) riskLevel = 'medium';

  const modelScore = Math.round(Math.min(1, maxScore) * 100);
  const platformBoost = riskLevel === 'critical' ? 95 : riskLevel === 'high' ? 75 : riskLevel === 'medium' ? 40 : 8;
  const riskScore = Math.max(modelScore, platformFlags.length || ruleFlags.length ? platformBoost : modelScore, behavior.riskScore);
  const recommendedAction = riskLevel === 'critical' ? 'block' : riskLevel === 'low' ? 'approve' : 'review';

  const positiveCategories = Object.entries(categories)
    .filter(([, flagged]) => flagged)
    .map(([key]) => key);
  const signals = [...new Set([...positiveCategories, ...platformFlags, ...ruleFlags, ...behavior.flags])];
  const summary = riskLevel === 'low'
    ? 'Low automated risk. No major harmful-content, scam, or abnormal-behavior signals were detected.'
    : `${riskLevel[0].toUpperCase()}${riskLevel.slice(1)} automated risk. Review ${signals.slice(0, 6).join(', ') || 'the content and account context'} before publishing.`;

  return { riskLevel, riskScore, recommendedAction, summary };
}

async function callOpenAiModeration(text: string, imageUrls: string[]) {
  const apiKey = requireEnv('OPENAI_API_KEY');
  const input: Array<Record<string, unknown>> = [
    { type: 'text', text: text.slice(0, 30000) }
  ];
  imageUrls.slice(0, 5).forEach((url) => {
    input.push({ type: 'image_url', image_url: { url } });
  });

  const response = await fetch('https://api.openai.com/v1/moderations', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ model: moderationModel, input }),
    cache: 'no-store'
  });

  const payload = await response.json().catch(() => ({})) as ModerationPayload;
  if (!response.ok) throw new Error(`OPENAI_MODERATION:${payload.error?.message || `HTTP ${response.status}`}`);
  const result = payload.results?.[0];
  if (!result) throw new Error('OPENAI_MODERATION:No moderation result returned.');
  return { payload, result };
}

async function canScanRequest(userId: string, posterId: string, supabase: ReturnType<typeof getSupabaseServiceClient>) {
  if (userId === posterId) return true;
  const { data } = await supabase.from('user_roles').select('role').eq('user_id', userId).maybeSingle();
  return data?.role === 'moderator' || data?.role === 'admin';
}

export async function POST(request: Request) {
  const supabase = getSupabaseServiceClient();
  let requestId = '';
  let behavior: BehaviorContext | null = null;

  try {
    const { user } = await getAuthenticatedUser(request);
    const body = await request.json().catch(() => ({})) as { requestId?: string };
    requestId = String(body.requestId || '').trim();
    if (!requestId) return NextResponse.json({ error: 'Request id is required.' }, { status: 400 });

    const { data: requestRow, error: requestError } = await supabase
      .from('requests')
      .select('id,poster_id,title,details,category,kind,campus_id,amount_cents,market_intent,moderation_status,moderation_flags,created_at')
      .eq('id', requestId)
      .maybeSingle();
    if (requestError) throw requestError;
    if (!requestRow) return NextResponse.json({ error: 'Request not found.' }, { status: 404 });
    const aspireRequest = requestRow as RequestForScan;
    if (!await canScanRequest(user.id, aspireRequest.poster_id, supabase)) return NextResponse.json({ error: 'You cannot scan this request.' }, { status: 403 });

    behavior = await loadBehaviorContext(aspireRequest, supabase);
    const { error: scanStateError } = await supabase.from('requests').update({
      ai_moderation_status: 'scanning',
      ai_summary: 'Aspire Safety Intelligence is checking content, scam patterns, and account behavior.',
      behavior_risk_score: behavior.riskScore,
      behavior_flags: behavior.flags,
      trust_score_snapshot: behavior.trustScore,
      trust_band_snapshot: behavior.trustBand
    }).eq('id', requestId);
    if (scanStateError) throw scanStateError;

    const { data: mediaRows, error: mediaError } = await supabase
      .from('request_media')
      .select('storage_path,mime_type')
      .eq('request_id', requestId)
      .order('sort_order');
    if (mediaError) throw mediaError;

    const paths = (mediaRows ?? [])
      .filter((row) => aiImageMimeTypes.has(String(row.mime_type || '').toLowerCase()))
      .map((row) => row.storage_path)
      .filter(Boolean)
      .slice(0, 5);
    let imageUrls: string[] = [];
    if (paths.length) {
      const { data: signedRows, error: signedError } = await supabase.storage.from('request-media').createSignedUrls(paths, signedImageSeconds);
      if (signedError) throw signedError;
      imageUrls = (signedRows ?? []).map((row) => row.signedUrl).filter((url): url is string => Boolean(url));
    }

    const text = [aspireRequest.title, aspireRequest.details, aspireRequest.category, aspireRequest.kind].filter(Boolean).join('\n');
    const ruleFlags = Array.isArray(aspireRequest.moderation_flags) ? aspireRequest.moderation_flags : [];
    const platformFlags = platformPolicyFlags(text, aspireRequest.kind);
    const { payload, result } = await callOpenAiModeration(text, imageUrls);
    const assessment = classifyRisk(result, platformFlags, ruleFlags, behavior);
    const now = new Date().toISOString();

    const { error: insertError } = await supabase.from('request_ai_assessments').insert({
      request_id: requestId,
      provider: 'openai',
      model: payload.model || moderationModel,
      model_flagged: Boolean(result.flagged),
      risk_level: assessment.riskLevel,
      risk_score: assessment.riskScore,
      recommended_action: assessment.recommendedAction,
      categories: result.categories ?? {},
      category_scores: result.category_scores ?? {},
      platform_flags: platformFlags,
      rule_flags: ruleFlags,
      behavior_flags: behavior.flags,
      trust_score_snapshot: behavior.trustScore,
      trust_band_snapshot: behavior.trustBand,
      image_count: imageUrls.length,
      summary: assessment.summary,
      raw_response: payload
    });
    if (insertError) throw insertError;

    const combinedFlags = [...new Set([...platformFlags, ...ruleFlags, ...behavior.flags])];
    const { error: updateError } = await supabase.from('requests').update({
      ai_moderation_status: 'complete',
      ai_risk_level: assessment.riskLevel,
      ai_risk_score: assessment.riskScore,
      ai_recommended_action: assessment.recommendedAction,
      ai_policy_flags: combinedFlags,
      ai_summary: assessment.summary,
      ai_last_scanned_at: now
    }).eq('id', requestId);
    if (updateError) throw updateError;

    return NextResponse.json({
      ok: true,
      requestId,
      riskLevel: assessment.riskLevel,
      riskScore: assessment.riskScore,
      recommendedAction: assessment.recommendedAction,
      flags: combinedFlags,
      behaviorFlags: behavior.flags,
      trustScore: behavior.trustScore,
      trustBand: behavior.trustBand,
      imageCount: imageUrls.length
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'UNKNOWN';
    if (requestId) {
      try {
        await supabase.from('requests').update({
          ai_moderation_status: 'error',
          ai_risk_level: 'unknown',
          ai_risk_score: null,
          ai_recommended_action: 'review',
          ...(behavior ? {
            behavior_risk_score: behavior.riskScore,
            behavior_flags: behavior.flags,
            trust_score_snapshot: behavior.trustScore,
            trust_band_snapshot: behavior.trustBand
          } : {}),
          ai_summary: message.startsWith('MISSING_ENV:OPENAI_API_KEY')
            ? 'AI content scan is not connected yet. Scam-pattern and behavior signals are still saved for human review.'
            : 'AI content scan could not finish. The post remains pending for human review.'
        }).eq('id', requestId);
      } catch {
        // Fail closed: the post already remains pending and hidden.
      }
    }

    if (message === 'AUTH_REQUIRED') return NextResponse.json({ error: 'Sign in again to continue.' }, { status: 401 });
    if (message.startsWith('MISSING_ENV:OPENAI_API_KEY')) return NextResponse.json({ error: 'Aspire Safety Intelligence is not connected to an API key yet. Behavioral scam checks still ran and the post remains pending.', code: 'AI_NOT_CONFIGURED' }, { status: 503 });
    if (message.startsWith('OPENAI_MODERATION:')) return NextResponse.json({ error: 'The AI content scan could not complete. Behavioral scam checks still ran and the post remains pending.', code: 'AI_SCAN_FAILED' }, { status: 502 });
    return NextResponse.json({ error: 'Could not complete the safety scan. The post remains pending for human review.' }, { status: 500 });
  }
}
