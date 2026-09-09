import { getSupabaseBrowserClient } from './client';

export type ClientSafetyContext = 'profile_name' | 'avatar' | 'request' | 'response' | 'message' | 'review';

export async function moderatePublicSignupName(name: string) {
  const response = await fetch('/api/moderation/content', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ context: 'signup_name', text: name.trim() }),
    cache: 'no-store'
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload?.error || 'Aspire could not approve that name.');
  return true;
}

export async function moderateAuthenticatedText(context: Exclude<ClientSafetyContext, 'avatar'>, text: string) {
  const trimmed = text.trim();
  if (!trimmed) return true;
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  const token = data.session?.access_token;
  if (!token) throw new Error('Sign in again to continue.');

  const response = await fetch('/api/moderation/content', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ context, text: trimmed }),
    cache: 'no-store'
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload?.error || 'Aspire could not approve that content.');
  return true;
}
