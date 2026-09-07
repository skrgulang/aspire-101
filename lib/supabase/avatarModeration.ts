import { getSupabaseBrowserClient } from './client';

export type AvatarModerationQueueItem = {
  id: string;
  userId: string;
  displayName: string;
  school: string;
  mimeType: string;
  status: 'review' | 'scanning';
  model: string | null;
  modelFlagged: boolean | null;
  riskLevel: 'unknown' | 'low' | 'medium' | 'high' | 'critical';
  riskScore: number | null;
  categories: Record<string, boolean>;
  summary: string | null;
  previewUrl: string | null;
  createdAt: string;
  updatedAt: string;
};

async function authHeaders() {
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  const token = data.session?.access_token;
  if (!token) throw new Error('Sign in again to use avatar moderation.');
  return { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
}

export async function fetchAvatarModerationQueue() {
  const headers = await authHeaders();
  const response = await fetch('/api/moderation/avatar/queue', { headers, cache: 'no-store' });
  const payload = await response.json().catch(() => ({})) as { reviews?: AvatarModerationQueueItem[]; error?: string };
  if (!response.ok) throw new Error(payload.error || 'Could not load profile photo reviews.');
  return payload.reviews ?? [];
}

export async function reviewAvatarModeration(reviewId: string, decision: 'approved' | 'rejected', note = '') {
  const headers = await authHeaders();
  const response = await fetch('/api/moderation/avatar/review', {
    method: 'POST',
    headers,
    body: JSON.stringify({ reviewId, decision, note: note.trim() || undefined })
  });
  const payload = await response.json().catch(() => ({})) as { ok?: boolean; status?: string; error?: string };
  if (!response.ok) throw new Error(payload.error || 'Could not review this profile photo.');
  return payload;
}
