import { NextResponse } from 'next/server';
import { timingSafeEqual } from 'node:crypto';
import { enforceAiRateLimit, getAuthenticatedUser, getSupabaseServiceClient, requireAal2, requireEnv } from '../../../../lib/server/aspireServer';

export const runtime = 'nodejs';

const moderationModel = 'omni-moderation-latest';
const signedImageSeconds = 10 * 60;
const aiImageMimeTypes = new Set(['image/jpeg', 'image/png', 'image/webp']);

type ModerationResult = {
  flagged?: boolean;
  categories?: Record<string, boolean>;
  category_scores?: Record<string, number>;
};

type ModerationPayload = {
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
  moderation_flags: string[] | null;
};

type BehaviorContext = {
  flags: string[];
  riskScore: number;
  trustScore: number | null;
  trustBand: string | null;
};

type ScanAccess = {
  allowed: boolean;
  staff: boolean;
};

type ReviewResultRow = {
  moderation_status?: 'pending' | 'approved' | 'rejected' | 'blocked' | null;
  post_review_status?: string | null;
  post_review_flags?: string[] | null;
  language_review_status?: string | null;
  language_review_flags?: string[] | null;
  market_review_status?: string | null;
  market_review_flags?: string[] | null;
};

const posterFlagHelp: Record<string, string> = {
  profanity: 'Some wording may violate Aspire community language rules.',
  hate_slur: 'Some wording may violate Aspire rules on hateful or abusive content.',
  threat_or_abuse: 'Some wording may be interpreted as threatening or abusive.',
  hidden_unicode: 'The text contains unusual or hidden formatting that needs review.',
  link_spam: 'The post contains link patterns that need a closer review.',
  contact_information: 'Contact information should stay inside Aspire until a connection is chosen.',
  off_platform_contact: 'Off-platform contact information or messaging language needs review.',
  excessive_punctuation: 'The text formatting looks spam-like and needs review.',
  declared_language_mismatch: 'The selected language may not match the post text.',
  missing_item_photo: 'A marketplace listing may be missing a required item photo.',
  missing_public_seller_area: 'A marketplace listing needs a public selling area without an exact private address.',
  missing_price: 'A marketplace listing needs a valid price or budget.',
  missing_condition: 'A marketplace listing needs an item condition.',
  missing_fulfillment_method: 'A marketplace listing needs at least one fulfillment option.',
  regulated_or_prohibited_item: 'The item or request may be restricted under Aspire rules.',
  regulated_item_needs_review: 'The item needs a Marketplace policy review before it can go live.',
  marketplace_prohibited_listing: 'This listing type may not be allowed in Aspire Market.',
  prohibited_listing_type: 'This listing type may not be allowed in Aspire Market.',
  credential_trade: 'Account credentials, verification codes, or account sales are not allowed.',
  sensitive_personal_data: 'The post may include sensitive personal information.',
  off_platform_payment: 'Payment language may move the transaction outside Aspire.',
  off_platform_evasion: 'The post may be trying to move payment or checkout outside Aspire.',
  off_platform_payment_or_evasion: 'Payment or checkout should stay inside Aspire.',
  scam_pressure: 'The payment wording may look unusually high-pressure and needs review.',
  price_anomaly: 'The price needs an additional Marketplace review.',
  duplicate_listing: 'A similar recent listing needs additional review.'
};

function posterReviewMessage(row: ReviewResultRow, result: ModerationResult, imageCount: number) {
  if (row.moderation_status === 'approved') {
    return 'Your post passed the automated review and is now live.';
  }

  const flags = [
    ...(row.post_review_flags ?? []),
    ...(row.language_review_flags ?? []),
    ...(row.market_review_flags ?? [])
  ];
  const reasons = [...new Set(flags.map((flag) => posterFlagHelp[flag]).filter(Boolean))].slice(0, 2);
  if (reasons.length) {
    return `Pending human review. ${reasons.join(' ')} Your post stays private until a moderator decides.`;
  }

  const flaggedCategories = Object.entries(result.categories ?? {}).filter(([, flagged]) => flagged).map(([key]) => key);
  if (flaggedCategories.some((key) => key.startsWith('sexual'))) {
    return 'Pending human review. Some text or image content may be sexual or otherwise inappropriate for Aspire. Your post stays private until a moderator decides.';
  }
  if (flaggedCategories.some((key) => key.startsWith('violence') || key.startsWith('self-harm') || key.startsWith('hate') || key.startsWith('harassment') || key.startsWith('illicit'))) {
    return 'Pending human review. A safety category was triggered by the post content. Your post stays private until a moderator decides.';
  }
  if (imageCount > 0 && result.flagged) {
    return 'Pending human review. One or more submitted images need a closer safety review. Your post stays private until a moderator decides.';
  }

  return 'Pending human review. Aspire could not safely auto-approve this post, so it stays private until a moderator checks it.';
}

function platformPolicyFlags(text: string, kind: string) {
  const flags = new Set<string>();
  if (/(telegram|whats\s?app|signal|wechat|snapchat|instagram|discord|dm me|text me|call me)/i.test(text) || /\b\d{3}[-.\s)]*\d{3}[-.\s]*\d{4}\b/.test(text)) flags.add('off_platform_contact');
  if (/(zelle|venmo|cash\s?app|paypal friends|friends and family|bitcoin|crypto|wire transfer|gift[ -]?card|cash only|pay me directly|outside aspire|off[- ]platform)/i.test(text)) flags.add('off_platform_payment');
  if (/(password|login credentials?|account credentials?|verification code|one[- ]time code|\botp\b|2fa code)/i.test(text)) flags.add('credential_trade');
  if (/(gun|firearm|ammo|ammunition|silencer|switchblade|taser|weed|marijuana|cocaine|fentanyl|vape|nicotine|steroid)/i.test(text)) flags.add('regulated_or_prohibited_item');
  if (/(act now|pay first|deposit first|send (the )?(money|payment) first|no refund|guaranteed profit|easy money|too good to be true)/i.test(text)) flags.add('scam_pressure');
  if (/(cheaper|discount|better price).{0,40}(telegram|zelle|venmo|cash\s?app|outside aspire|off[- ]platform)/i.test(text)) flags.add('off_platform_evasion');
  if (/(social security|\bssn\b|credit card number|bank account number|routing number|passport number)/i.test(text)) flags.add('sensitive_personal_data');
  if (kind === 'buy_sell' && /(counterfeit|fake designer|replica|stolen|hot item|gift[ -]?card|account for sale|game account)/i.test(text)) flags.add('marketplace_prohibited_listing');
  return [...flags];
}

function median(values: number[]) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : Math.round((sorted[middle - 1] + sorted[middle]) / 2);
}

async function loadBehaviorContext(aspireRequest: RequestForScan, supabase: ReturnType<typeof getSupabaseServiceClient>): Promise<BehaviorContext> {
  try {
    await supabase.rpc('refresh_user_trust_profile', { p_user_id: aspireRequest.poster_id });
  } catch {
    // The behavior scan can continue with no trust snapshot if refresh fails.
  }

  const hourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const [hourPosts, dayPosts, duplicatePosts, profileResult, trustResult] = await Promise.all([
    supabase.from('requests').select('id', { count: 'exact', head: true }).eq('poster_id', aspireRequest.poster_id).gte('created_at', hourAgo),
    supabase.from('requests').select('id', { count: 'exact', head: true }).eq('poster_id', aspireRequest.poster_id).gte('created_at', dayAgo),
    supabase.from('requests').select('id', { count: 'exact', head: true }).eq('poster_id', aspireRequest.poster_id).eq('title', aspireRequest.title).neq('id', aspireRequest.id).gte('created_at', dayAgo),
    supabase.from('profiles').select('created_at').eq('id', aspireRequest.poster_id).maybeSingle(),
    supabase.from('user_trust_profiles').select('trust_score,trust_band,removed_posts,high_risk_rejections').eq('user_id', aspireRequest.poster_id).maybeSingle()
  ]);

  const flags = new Set<string>();
  let riskScore = 0;
  if ((hourPosts.count ?? 0) >= 6) { flags.add('rapid_posting'); riskScore += 20; }
  if ((dayPosts.count ?? 0) >= 15) { flags.add('posting_burst'); riskScore += 15; }
  if ((duplicatePosts.count ?? 0) >= 2) { flags.add('repeated_duplicate_listing'); riskScore += 25; }

  const profileCreatedAt = profileResult.data?.created_at ? new Date(profileResult.data.created_at).getTime() : 0;
  const accountAgeHours = profileCreatedAt ? (Date.now() - profileCreatedAt) / 3600000 : null;
  if (accountAgeHours !== null && accountAgeHours < 48 && (aspireRequest.amount_cents ?? 0) >= 20000 && ['buy_sell', 'paid_help'].includes(aspireRequest.kind)) {
    flags.add('new_account_high_value');
    riskScore += 25;
  }

  const trust = trustResult.data as { trust_score?: number; trust_band?: string; removed_posts?: number; high_risk_rejections?: number } | null;
  const trustScore = typeof trust?.trust_score === 'number' ? trust.trust_score : null;
  const trustBand = typeof trust?.trust_band === 'string' ? trust.trust_band : null;
  if (trustBand === 'restricted') { flags.add('restricted_trust_history'); riskScore += 35; }
  else if (trustBand === 'caution') { flags.add('caution_trust_history'); riskScore += 18; }
  if ((trust?.removed_posts ?? 0) > 0) { flags.add('prior_enforcement'); riskScore += 15; }
  if ((trust?.high_risk_rejections ?? 0) > 0) { flags.add('prior_high_risk_rejection'); riskScore += 15; }

  if (aspireRequest.kind === 'buy_sell' && aspireRequest.campus_id && aspireRequest.amount_cents) {
    const baselineResult = await supabase
      .from('requests')
      .select('amount_cents')
      .eq('kind', 'buy_sell')
      .eq('campus_id', aspireRequest.campus_id)
      .eq('moderation_status', 'approved')
      .eq('market_intent', aspireRequest.market_intent || 'sell')
      .not('amount_cents', 'is', null)
      .limit(50);
    const prices = (baselineResult.data ?? []).map((row) => Number(row.amount_cents)).filter((value) => Number.isFinite(value) && value > 0);
    const campusMedian = median(prices);
    if (campusMedian && prices.length >= 5) {
      if (aspireRequest.amount_cents <= campusMedian * 0.35) { flags.add('price_far_below_campus_baseline'); riskScore += 20; }
      else if (aspireRequest.amount_cents >= campusMedian * 3) { flags.add('price_far_above_campus_baseline'); riskScore += 10; }
    }
  }

  return { flags: [...flags], riskScore: Math.min(100, riskScore), trustScore, trustBand };
}

function classifyRisk(result: ModerationResult, platformFlags: string[], ruleFlags: string[], behavior: BehaviorContext) {
  const categories = result.categories ?? {};
  const scores = result.category_scores ?? {};
  const ranked = Object.entries(scores).filter(([, score]) => Number.isFinite(score)).sort((a, b) => b[1] - a[1]);
  const maxScore = ranked[0]?.[1] ?? 0;
  const severeKeys = new Set(['sexual/minors', 'hate/threatening', 'self-harm/instructions', 'self-harm/intent', 'violence/graphic', 'illicit/violent']);
  const severeScore = ranked.filter(([key]) => severeKeys.has(key)).reduce((max, [, score]) => Math.max(max, score), 0);
  const highPlatform = platformFlags.some((flag) => ['regulated_or_prohibited_item', 'credential_trade', 'marketplace_prohibited_listing', 'off_platform_evasion', 'sensitive_personal_data'].includes(flag));

  let riskLevel: 'low' | 'medium' | 'high' | 'critical' = 'low';
  if (severeScore >= 0.5 || (Boolean(result.flagged) && severeScore >= 0.25)) riskLevel = 'critical';
  else if (Boolean(result.flagged) || maxScore >= 0.7 || highPlatform || ruleFlags.includes('restricted_market_term') || behavior.riskScore >= 60) riskLevel = 'high';
  else if (maxScore >= 0.25 || platformFlags.length > 0 || ruleFlags.length > 0 || behavior.riskScore >= 25) riskLevel = 'medium';

  const modelScore = Math.round(Math.min(1, maxScore) * 100);
  const floor = riskLevel === 'critical' ? 95 : riskLevel === 'high' ? 75 : riskLevel === 'medium' ? 40 : 0;
  const riskScore = Math.max(modelScore, behavior.riskScore, platformFlags.length || ruleFlags.length ? floor : 0);
  const recommendedAction: 'approve' | 'review' | 'block' = riskLevel === 'critical' ? 'block' : riskLevel === 'low' ? 'approve' : 'review';
  const modelSignals = Object.entries(categories).filter(([, flagged]) => flagged).map(([key]) => key);
  const signals = [...new Set([...modelSignals, ...platformFlags, ...ruleFlags, ...behavior.flags])];
  const summary = riskLevel === 'low'
    ? 'Low automated risk. No major harmful-content, scam, or abnormal-behavior signals were detected.'
    : `${riskLevel[0].toUpperCase()}${riskLevel.slice(1)} automated risk. Review ${signals.slice(0, 6).join(', ') || 'the content and account context'} before publishing.`;
  return { riskLevel, riskScore, recommendedAction, summary };
}

async function callOpenAiModeration(text: string, imageUrls: string[]) {
  const apiKey = requireEnv('OPENAI_API_KEY');
  const input: Array<Record<string, unknown>> = [{ type: 'text', text: text.slice(0, 30000) }];
  imageUrls.slice(0, 5).forEach((url) => input.push({ type: 'image_url', image_url: { url } }));
  const response = await fetch('https://api.openai.com/v1/moderations', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: moderationModel, input }),
    cache: 'no-store'
  });
  const payload = await response.json().catch(() => ({})) as ModerationPayload;
  if (!response.ok) throw new Error(`OPENAI_MODERATION:${payload.error?.message || `HTTP ${response.status}`}`);
  const result = payload.results?.[0];
  if (!result) throw new Error('OPENAI_MODERATION:No moderation result returned.');
  return { payload, result };
}

async function getScanAccess(userId: string, posterId: string, supabase: ReturnType<typeof getSupabaseServiceClient>): Promise<ScanAccess> {
  const { data, error } = await supabase.from('user_roles').select('role').eq('user_id', userId).maybeSingle();
  if (error) throw error;
  const staff = data?.role === 'moderator' || data?.role === 'admin';
  return { allowed: userId === posterId || staff, staff };
}

function isCronAuthorized(request: Request) {
  const secret = process.env.CRON_SECRET;
  const authorization = request.headers.get('authorization') || '';
  if (!secret) return false;
  const expected = `Bearer ${secret}`;
  const receivedBytes = Buffer.from(authorization);
  const expectedBytes = Buffer.from(expected);
  return receivedBytes.length === expectedBytes.length && timingSafeEqual(receivedBytes, expectedBytes);
}

export async function POST(request: Request) {
  const supabase = getSupabaseServiceClient();
  let requestId = '';
  let behavior: BehaviorContext | null = null;
  let staffCanViewInternals = false;

  try {
    const cronAuthorized = isCronAuthorized(request);
    const auth = cronAuthorized ? null : await getAuthenticatedUser(request);
    const body = await request.json().catch(() => ({})) as { requestId?: string };
    requestId = String(body.requestId || '').trim();
    if (!requestId) return NextResponse.json({ error: 'Request id is required.' }, { status: 400 });

    const { data: requestRow, error: requestError } = await supabase
      .from('requests')
      .select('id,poster_id,title,details,category,kind,campus_id,amount_cents,market_intent,moderation_flags')
      .eq('id', requestId)
      .maybeSingle();
    if (requestError) throw requestError;
    if (!requestRow) return NextResponse.json({ error: 'Request not found.' }, { status: 404 });
    const aspireRequest = requestRow as RequestForScan;

    if (!cronAuthorized) {
      if (!auth?.user) return NextResponse.json({ error: 'You cannot scan this request.' }, { status: 403 });
      const access = await getScanAccess(auth.user.id, aspireRequest.poster_id, supabase);
      if (!access.allowed) return NextResponse.json({ error: 'You cannot scan this request.' }, { status: 403 });
      if (access.staff && auth.user.id !== aspireRequest.poster_id) await requireAal2(auth.accessToken);
      staffCanViewInternals = access.staff;
      await enforceAiRateLimit(supabase, auth.user.id, 'moderation', 20);
    }

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

    const { data: mediaRows, error: mediaError } = await supabase.from('request_media').select('storage_path,mime_type').eq('request_id', requestId).order('sort_order');
    if (mediaError) throw mediaError;
    const paths = (mediaRows ?? []).filter((row) => aiImageMimeTypes.has(String(row.mime_type || '').toLowerCase())).map((row) => row.storage_path).filter(Boolean).slice(0, 5);
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
    const combinedFlags = [...new Set([...platformFlags, ...ruleFlags, ...behavior.flags])];
    const moderationStatus: 'pending' | 'approved' = assessment.recommendedAction === 'approve' && assessment.riskLevel === 'low' && behavior.riskScore < 25 && combinedFlags.length === 0
      ? 'approved'
      : 'pending';
    const moderatedAt = moderationStatus === 'approved' ? new Date().toISOString() : null;
    const moderationReason = moderationStatus === 'approved'
      ? 'Automatically approved by Aspire Safety Intelligence (low risk).'
      : null;

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

    const { data: updatedRequest, error: updateError } = await supabase.from('requests').update({
      moderation_status: moderationStatus,
      moderation_version: 'ai_v2',
      moderated_by: null,
      moderated_at: moderatedAt,
      moderation_reason: moderationReason,
      ai_moderation_status: 'complete',
      ai_risk_level: assessment.riskLevel,
      ai_risk_score: assessment.riskScore,
      ai_recommended_action: assessment.recommendedAction,
      ai_policy_flags: combinedFlags,
      ai_summary: assessment.summary,
      ai_last_scanned_at: new Date().toISOString()
    }).eq('id', requestId).select('moderation_status,post_review_status,post_review_flags,language_review_status,language_review_flags,market_review_status,market_review_flags').single();
    if (updateError) throw updateError;

    const actualStatus = (updatedRequest?.moderation_status || moderationStatus) as 'pending' | 'approved' | 'rejected' | 'blocked';
    const userMessage = posterReviewMessage((updatedRequest ?? {}) as ReviewResultRow, result, imageUrls.length);
    const publicResult = { ok: true, requestId, moderationStatus: actualStatus, imageCount: imageUrls.length, userMessage };
    if (!cronAuthorized && !staffCanViewInternals) return NextResponse.json(publicResult);

    return NextResponse.json({
      ...publicResult,
      riskLevel: assessment.riskLevel,
      riskScore: assessment.riskScore,
      recommendedAction: assessment.recommendedAction,
      flags: combinedFlags,
      behaviorFlags: behavior.flags,
      trustScore: behavior.trustScore,
      trustBand: behavior.trustBand
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'UNKNOWN';
    if (requestId && message !== 'AI_RATE_LIMIT') {
      try {
        await supabase.from('requests').update({
          ai_moderation_status: 'error',
          ai_risk_level: 'unknown',
          ai_risk_score: null,
          ai_recommended_action: 'review',
          ...(behavior ? { behavior_risk_score: behavior.riskScore, behavior_flags: behavior.flags, trust_score_snapshot: behavior.trustScore, trust_band_snapshot: behavior.trustBand } : {}),
          ai_summary: message.startsWith('MISSING_ENV:OPENAI_API_KEY') ? 'AI content scan is not connected yet. Scam-pattern and behavior signals are still saved for human review.' : 'AI content scan could not finish. The post remains pending for human review.'
        }).eq('id', requestId);
      } catch {
        // Fail closed: the post already remains pending and hidden.
      }
    }
    if (message === 'AUTH_REQUIRED') return NextResponse.json({ error: 'Sign in again to continue.' }, { status: 401 });
    if (message === 'MFA_REQUIRED') return NextResponse.json({ error: 'Complete two-step verification to use staff moderation tools.', code: 'MFA_REQUIRED' }, { status: 403 });
    if (message === 'AI_RATE_LIMIT') return NextResponse.json({ error: 'Safety rescans are being requested too quickly. Try again later.', code: 'AI_RATE_LIMIT' }, { status: 429 });
    if (message.startsWith('MISSING_ENV:OPENAI_API_KEY')) return NextResponse.json({ error: 'Aspire Safety Intelligence is not connected to an API key yet. Behavioral scam checks still ran and the post remains pending.', code: 'AI_NOT_CONFIGURED' }, { status: 503 });
    if (message.startsWith('OPENAI_MODERATION:')) return NextResponse.json({ error: 'The AI content scan could not complete. Behavioral scam checks still ran and the post remains pending.', code: 'AI_SCAN_FAILED' }, { status: 502 });
    return NextResponse.json({ error: 'Could not complete the safety scan. The post remains pending for human review.' }, { status: 500 });
  }
}
