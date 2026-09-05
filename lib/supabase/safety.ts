import { getSupabaseBrowserClient } from './client';

export type SafetyReason = 'spam' | 'harassment' | 'scam' | 'unsafe' | 'illegal' | 'hate' | 'sexual' | 'other';

export async function acknowledgeSafety(contextType: string, requestId?: string) {
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase.auth.getUser();
  if (error) throw error;
  if (!data.user) throw new Error('You must be signed in.');

  const { error: insertError } = await supabase.from('safety_acknowledgements').insert({
    user_id: data.user.id,
    request_id: requestId ?? null,
    context_type: contextType,
    acknowledgement_version: 'v1'
  });
  if (insertError) throw insertError;
}

export async function reportSafety(input: {
  reason: SafetyReason;
  details?: string;
  targetUserId?: string;
  requestId?: string;
  connectionId?: string;
}) {
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase.auth.getUser();
  if (error) throw error;
  if (!data.user) throw new Error('You must be signed in to report something.');

  const { error: insertError } = await supabase.from('safety_reports').insert({
    reporter_id: data.user.id,
    target_user_id: input.targetUserId ?? null,
    request_id: input.requestId ?? null,
    connection_id: input.connectionId ?? null,
    reason: input.reason,
    details: input.details?.trim() || null
  });
  if (insertError) throw insertError;
}

export async function blockUser(blockedId: string) {
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase.auth.getUser();
  if (error) throw error;
  if (!data.user) throw new Error('You must be signed in to block someone.');

  const { error: insertError } = await supabase.from('user_blocks').upsert({
    blocker_id: data.user.id,
    blocked_id: blockedId
  });
  if (insertError) throw insertError;
}

export async function fetchBlockedUserIds() {
  const supabase = getSupabaseBrowserClient();
  const { data: authData } = await supabase.auth.getUser();
  if (!authData.user) return [] as string[];

  const { data, error } = await supabase.from('user_blocks').select('blocked_id');
  if (error) throw error;
  return (data ?? []).map((row) => row.blocked_id as string);
}
