import { createClient, type User } from '@supabase/supabase-js';

const stripeApiBase = 'https://api.stripe.com';
const stripeVersion = '2026-08-26.preview';

export function requireBearerToken(request: Request) {
  const header = request.headers.get('authorization') || '';
  const match = header.match(/^Bearer\s+(.+)$/i);
  if (!match?.[1]) throw new Error('AUTH_REQUIRED');
  return match[1];
}

function requireEnv(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`MISSING_ENV:${name}`);
  return value;
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

export async function stripeRequest<T>(path: string, init: RequestInit = {}) {
  const secret = requireEnv('STRIPE_SECRET_KEY');
  const response = await fetch(`${stripeApiBase}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${secret}`,
      'Stripe-Version': stripeVersion,
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

export function publicOrigin(request: Request) {
  const configured = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (configured) return configured.replace(/\/$/, '');
  return new URL(request.url).origin;
}

export function apiError(error: unknown) {
  const raw = error instanceof Error ? error.message : 'UNKNOWN';
  if (raw === 'AUTH_REQUIRED') return { status: 401, body: { error: 'Sign in again to continue.' } };
  if (raw === 'PHONE_REQUIRED') return { status: 409, body: { error: 'Verify your phone before setting up payouts.', code: 'PHONE_REQUIRED' } };
  if (raw === 'SCHOOL_REQUIRED') return { status: 409, body: { error: 'Verify your school identity before setting up payouts.', code: 'SCHOOL_REQUIRED' } };
  if (raw.startsWith('MISSING_ENV:')) return { status: 503, body: { error: 'Payments are not connected to this deployment yet.', code: raw } };
  if (raw.startsWith('STRIPE:')) return { status: 502, body: { error: raw.slice(7), code: 'STRIPE_ERROR' } };
  return { status: 500, body: { error: 'Could not complete that payment setup step.' } };
}
