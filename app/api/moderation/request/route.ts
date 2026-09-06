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

function classifyRisk(
  result: ModerationResult,
  platformFlags: string[],
  ruleFlags: string[]
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
  else if (Boolean(result.flagged) || maxScore >= 0.7 || highPlatform || ruleFlags.includes('restricted_market_term')) riskLevel = 'high';
  else if (maxScore >= 0.25 || platformFlags.length > 0 || ruleFlags.length > 0) riskLevel = 'medium';

  const modelScore = Math.round(Math.min(1, maxScore) * 100);
  const platformBoost = riskLevel === 'critical' ? 95 : riskLevel === 'high' ? 75 : riskLevel === 'medium' ? 40 : 8;
  const riskScore = Math.max(modelScore, platformFlags.length || ruleFlags.length ? platformBoost : modelScore);
  const recommendedAction = riskLevel === 'critical' ? 'block' : riskLevel === 'low' ? 'approve' : 'review';

  const positiveCategories = Object.entries(categories)
    .filter(([, flagged]) => flagged)
    .map(([key]) => key);
  const signals = [...new Set([...positiveCategories, ...platformFlags, ...ruleFlags])];
  const summary = riskLevel === 'low'
    ? 'Low automated risk. No major harmful-content or Aspire marketplace signals were detected.'
    : `${riskLevel[0].toUpperCase()}${riskLevel.slice(1)} automated risk. Review ${signals.slice(0, 5).join(', ') || 'the content and context'} before publishing.`;

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
  if (!response.ok) {
    throw new Error(`OPENAI_MODERATION:${payload.error?.message || `HTTP ${response.status}`}`);
  }
  const result = payload.results?.[0];
  if (!result) throw new Error('OPENAI_MODERATION:No moderation result returned.');
  return { payload, result };
}

async function canScanRequest(userId: string, posterId: string, supabase: ReturnType<typeof getSupabaseServiceClient>) {
  if (userId === posterId) return true;
  const { data } = await supabase
    .from('user_roles')
    .select('role')
    .eq('user_id', userId)
    .maybeSingle();
  return data?.role === 'moderator' || data?.role === 'admin';
}

export async function POST(request: Request) {
  const supabase = getSupabaseServiceClient();
  let requestId = '';

  try {
    const { user } = await getAuthenticatedUser(request);
    const body = await request.json().catch(() => ({})) as { requestId?: string };
    requestId = String(body.requestId || '').trim();
    if (!requestId) return NextResponse.json({ error: 'Request id is required.' }, { status: 400 });

    const { data: aspireRequest, error: requestError } = await supabase
      .from('requests')
      .select('id,poster_id,title,details,category,kind,moderation_status,moderation_flags')
      .eq('id', requestId)
      .maybeSingle();
    if (requestError) throw requestError;
    if (!aspireRequest) return NextResponse.json({ error: 'Request not found.' }, { status: 404 });
    if (!await canScanRequest(user.id, aspireRequest.poster_id, supabase)) {
      return NextResponse.json({ error: 'You cannot scan this request.' }, { status: 403 });
    }

    const { error: scanStateError } = await supabase.from('requests').update({
      ai_moderation_status: 'scanning',
      ai_summary: 'Aspire Safety Intelligence is checking this submission.'
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
      const { data: signedRows, error: signedError } = await supabase.storage
        .from('request-media')
        .createSignedUrls(paths, signedImageSeconds);
      if (signedError) throw signedError;
      imageUrls = (signedRows ?? []).map((row) => row.signedUrl).filter((url): url is string => Boolean(url));
    }

    const text = [aspireRequest.title, aspireRequest.details, aspireRequest.category, aspireRequest.kind]
      .filter(Boolean)
      .join('\n');
    const ruleFlags = Array.isArray(aspireRequest.moderation_flags) ? aspireRequest.moderation_flags : [];
    const platformFlags = platformPolicyFlags(text, aspireRequest.kind);
    const { payload, result } = await callOpenAiModeration(text, imageUrls);
    const assessment = classifyRisk(result, platformFlags, ruleFlags);
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
      image_count: imageUrls.length,
      summary: assessment.summary,
      raw_response: payload
    });
    if (insertError) throw insertError;

    const { error: updateError } = await supabase.from('requests').update({
      ai_moderation_status: 'complete',
      ai_risk_level: assessment.riskLevel,
      ai_risk_score: assessment.riskScore,
      ai_recommended_action: assessment.recommendedAction,
      ai_policy_flags: [...new Set([...platformFlags, ...ruleFlags])],
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
      flags: [...new Set([...platformFlags, ...ruleFlags])],
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
          ai_summary: message.startsWith('MISSING_ENV:OPENAI_API_KEY')
            ? 'AI safety scan is not connected yet. Human review is still required.'
            : 'AI safety scan could not finish. Human review is still required.'
        }).eq('id', requestId);
      } catch {
        // The post is already pending and hidden. A failed status write must not expose it.
      }
    }

    if (message === 'AUTH_REQUIRED') return NextResponse.json({ error: 'Sign in again to continue.' }, { status: 401 });
    if (message.startsWith('MISSING_ENV:OPENAI_API_KEY')) {
      return NextResponse.json({ error: 'Aspire Safety Intelligence is not connected to an API key yet.', code: 'AI_NOT_CONFIGURED' }, { status: 503 });
    }
    if (message.startsWith('OPENAI_MODERATION:')) {
      return NextResponse.json({ error: 'The AI safety scan could not complete. The post remains pending for human review.', code: 'AI_SCAN_FAILED' }, { status: 502 });
    }
    return NextResponse.json({ error: 'Could not complete the safety scan. The post remains pending for human review.' }, { status: 500 });
  }
}
