import { createHmac, timingSafeEqual } from 'node:crypto';
import { createClient, type User } from '@supabase/supabase-js';

const stripeApiBase = 'https://api.stripe.com';
// Accounts v2 is preview-only. Current Stripe MCP/OpenAPI schema is 2026-08-26.preview.
const stripeV2PreviewVersion = '2026-08-26.preview';

export type StripePayoutState = {
  ready: boolean;
  status: 'NOT_STARTED' | 'ACTION_REQUIRED' | 'UNDER_REVIEW' | 'READY' | 'RESTRICTED';
  requirementsDue: number;
};

type StripeV2Account = {
  configuration?: {
    recipient?: {
      capabilities?: {
        stripe_balance?: {
          stripe_transfers?: { status?: string | null };
        };
      };
    };
  };
  requirements?: {
    entries?: Array<{
      status?: string | null;
      awaiting_action_from?: string | null;
      minimum_deadline?: { status?: string | null } | null;
    }>;
  };
};

export function requireBearerToken(request: Request) {
  const header = request.headers.get('authorization') || '';
  const match = header.match(/^Bearer\s+(.+)$/i);
  if (!match?.[1]) throw new Error('AUTH_REQUIRED');
  return match[1];
}

export function requireEnv(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`MISSING_ENV:${name}`);
  return value;
}

/** Derive data mode from the credential itself so configuration cannot drift. */
export function stripeLivemode() {
  const secret = requireEnv('STRIPE_SECRET_KEY');
  if (/^(sk|rk)_live_/.test(secret)) return true;
  if (/^(sk|rk)_test_/.test(secret)) return false;
  throw new Error('INVALID_ENV:STRIPE_SECRET_KEY');
}

export async function getAuthenticatedUser(request: Request): Promise<{ user: User; accessToken: string }> {
  const accessToken = requireBearerToken(request);
  const url = requireEnv('NEXT_PUBLIC_SUPABASE_URL');
  const key = requireEnv('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY');
  const supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await supabase.auth.getUser(accessToken);
  if (error || !data.user) throw new Error('AUTH_REQUIRED');
  return { user: data.user, accessToken };
}

export function getSupabaseServiceClient() {
  const url = requireEnv('NEXT_PUBLIC_SUPABASE_URL');
  const key = requireEnv('SUPABASE_SERVICE_ROLE_KEY');
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

/** JSON helper for Stripe Accounts v2 preview endpoints. */
export async function stripeRequest<T>(path: string, init: RequestInit = {}) {
  const secret = requireEnv('STRIPE_SECRET_KEY');
  const response = await fetch(`${stripeApiBase}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${secret}`,
      'Stripe-Version': stripeV2PreviewVersion,
      'Content-Type': 'application/json',
      ...(init.headers || {})
    },
    cache: 'no-store'
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = payload?.error?.message || payload?.message || `Stripe request failed (${response.status}).`;
    throw new Error(`STRIPE:${message}`);
  }
  return payload as T;
}

/** Form-encoded helper for stable Stripe v1 endpoints such as Checkout, Transfers and Refunds. */
export async function stripeFormRequest<T>(
  path: string,
  params: Record<string, string | number | boolean | null | undefined>,
  options: { idempotencyKey?: string } = {}
) {
  const secret = requireEnv('STRIPE_SECRET_KEY');
  const body = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== null && value !== undefined) body.set(key, String(value));
  });

  const response = await fetch(`${stripeApiBase}${path}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${secret}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      ...(options.idempotencyKey ? { 'Idempotency-Key': options.idempotencyKey } : {})
    },
    body,
    cache: 'no-store'
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = payload?.error?.message || payload?.message || `Stripe request failed (${response.status}).`;
    throw new Error(`STRIPE:${message}`);
  }
  return payload as T;
}

export async function stripeGet<T>(path: string) {
  const secret = requireEnv('STRIPE_SECRET_KEY');
  const response = await fetch(`${stripeApiBase}${path}`, {
    method: 'GET',
    headers: { Authorization: `Bearer ${secret}` },
    cache: 'no-store'
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = payload?.error?.message || payload?.message || `Stripe request failed (${response.status}).`;
    throw new Error(`STRIPE:${message}`);
  }
  return payload as T;
}

/** Read recipient transfer readiness from the same Accounts v2 model used at onboarding. */
export async function getStripePayoutState(accountId: string): Promise<StripePayoutState> {
  const account = await stripeRequest<StripeV2Account>(
    `/v2/core/accounts/${encodeURIComponent(accountId)}?include[]=configuration.recipient&include[]=requirements`
  );
  const transferStatus = account.configuration?.recipient?.capabilities?.stripe_balance?.stripe_transfers?.status || '';
  const entries = account.requirements?.entries ?? [];
  const requirementsDue = entries.length;
  const pastDue = entries.some((entry) =>
    entry.status === 'past_due' || entry.minimum_deadline?.status === 'past_due'
  );
  const awaitingStripe = entries.length > 0 && entries.every((entry) => entry.awaiting_action_from === 'stripe');

  if (transferStatus === 'active') {
    return { ready: true, status: 'READY', requirementsDue };
  }
  if (transferStatus === 'restricted' || pastDue) {
    return { ready: false, status: 'RESTRICTED', requirementsDue };
  }
  if (transferStatus === 'pending' || awaitingStripe) {
    return { ready: false, status: 'UNDER_REVIEW', requirementsDue };
  }
  return { ready: false, status: 'ACTION_REQUIRED', requirementsDue };
}

export function calculatePlatformFee(grossAmountCents: number) {
  const rawBps = Number.parseInt(process.env.ASPIRE_PLATFORM_FEE_BPS || '0', 10);
  const rawFixed = Number.parseInt(process.env.ASPIRE_PLATFORM_FEE_FIXED_CENTS || '0', 10);
  const bps = Number.isFinite(rawBps) ? Math.min(3000, Math.max(0, rawBps)) : 0;
  const fixed = Number.isFinite(rawFixed) ? Math.min(10000, Math.max(0, rawFixed)) : 0;
  return Math.min(grossAmountCents, Math.round((grossAmountCents * bps) / 10000) + fixed);
}

export function verifyStripeWebhookSignature(payload: string, signatureHeader: string | null) {
  if (!signatureHeader) throw new Error('WEBHOOK_SIGNATURE');
  // Stripe sends sandbox and live events to the same endpoint in this deployment.
  // The livemode bit is inside the signed payload, so it cannot be used to choose
  // a secret before verification. Try the configured endpoint secrets instead.
  const secrets = [
    process.env.STRIPE_WEBHOOK_SECRET_LIVE,
    process.env.STRIPE_WEBHOOK_SECRET_TEST,
    process.env.STRIPE_WEBHOOK_SECRET
  ].filter((value): value is string => Boolean(value?.trim()));
  if (!secrets.length) throw new Error('MISSING_ENV:STRIPE_WEBHOOK_SECRET');
  const pieces = signatureHeader.split(',').map((piece) => piece.trim());
  const timestamp = pieces.find((piece) => piece.startsWith('t='))?.slice(2);
  const signatures = pieces.filter((piece) => piece.startsWith('v1=')).map((piece) => piece.slice(3));
  if (!timestamp || !signatures.length) throw new Error('WEBHOOK_SIGNATURE');

  const timestampNumber = Number(timestamp);
  if (!Number.isFinite(timestampNumber) || Math.abs(Date.now() / 1000 - timestampNumber) > 300) {
    throw new Error('WEBHOOK_SIGNATURE');
  }

  const valid = secrets.some((secret) => {
    const expected = createHmac('sha256', secret).update(`${timestamp}.${payload}`, 'utf8').digest('hex');
    const expectedBuffer = Buffer.from(expected, 'utf8');
    return signatures.some((candidate) => {
      const candidateBuffer = Buffer.from(candidate, 'utf8');
      return candidateBuffer.length === expectedBuffer.length && timingSafeEqual(candidateBuffer, expectedBuffer);
    });
  });
  if (!valid) throw new Error('WEBHOOK_SIGNATURE');
}

export function publicOrigin(request: Request) {
  const configured = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (configured) return configured.replace(/\/$/, '');
  return new URL(request.url).origin;
}

export function apiError(error: unknown) {
  const raw = error instanceof Error ? error.message : 'UNKNOWN';
  if (raw === 'AUTH_REQUIRED') return { status: 401, body: { error: 'Sign in again to continue.' } };
  if (raw === 'PHONE_REQUIRED') return { status: 409, body: { error: 'Verify your phone before using Aspire payments.', code: 'PHONE_REQUIRED' } };
  if (raw === 'SCHOOL_REQUIRED') return { status: 409, body: { error: 'Verify your school identity before using Aspire payments.', code: 'SCHOOL_REQUIRED' } };
  if (raw === 'NOT_REQUESTER') return { status: 403, body: { error: 'Only the requester can secure this payment.', code: raw } };
  if (raw === 'CONNECTION_NOT_READY') return { status: 409, body: { error: 'Both people must confirm the connection first.', code: raw } };
  if (raw === 'PAYOUT_NOT_READY') return { status: 409, body: { error: 'The person receiving money must finish Stripe payout setup first.', code: raw } };
  if (raw === 'PAYMENT_NOT_REQUIRED') return { status: 409, body: { error: 'This connection is not set to Pay with Aspire.', code: raw } };
  if (raw === 'PAYMENT_ALREADY_SECURED') return { status: 409, body: { error: 'Payment is already secured for this connection.', code: raw } };
  if (raw === 'COMPLETION_NOT_READY') return { status: 409, body: { error: 'Both people must mark the connection complete before payment can be released.', code: raw } };
  if (raw === 'PAYMENT_NOT_SECURED') return { status: 409, body: { error: 'Payment must be secured before it can be released.', code: raw } };
  if (raw === 'WEBHOOK_SIGNATURE') return { status: 400, body: { error: 'Invalid Stripe webhook signature.' } };
  if (raw.startsWith('MISSING_ENV:')) return { status: 503, body: { error: 'Payments are not connected to this deployment yet.', code: raw } };
  if (raw.startsWith('INVALID_ENV:')) return { status: 503, body: { error: 'Payments are not configured correctly for this deployment.', code: raw } };
  if (raw.startsWith('STRIPE:')) return { status: 502, body: { error: raw.slice(7), code: 'STRIPE_ERROR' } };
  if (raw.startsWith('SHIPPO:')) return { status: 502, body: { error: raw.slice(7), code: 'SHIPPING_PROVIDER_ERROR' } };
  return { status: 500, body: { error: 'Could not complete that payment step.' } };
}
