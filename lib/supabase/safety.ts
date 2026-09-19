import { getSupabaseBrowserClient } from './client';

export type SafetyReason = 'spam' | 'harassment' | 'scam' | 'unsafe' | 'illegal' | 'hate' | 'sexual' | 'other';

export type SafetyReportHistoryItem = {
  id: string;
  target_user_id: string | null;
  request_id: string | null;
  connection_id: string | null;
  reason: SafetyReason;
  details: string | null;
  status: 'submitted' | 'reviewing' | 'resolved' | 'dismissed';
  created_at: string;
  reviewed_at: string | null;
};

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

  const { error: insertError } = await supabase.rpc('submit_safety_report', {
    p_reason: input.reason,
    p_details: input.details?.trim() || null,
    p_target_user_id: input.targetUserId ?? null,
    p_request_id: input.requestId ?? null,
    p_connection_id: input.connectionId ?? null
  });
  if (insertError) {
    if (/SAFETY_REPORT_RATE_LIMIT/i.test(insertError.message || '')) {
      throw new Error('Too many reports were submitted recently. Please try again later.');
    }
    throw insertError;
  }
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


export async function fetchMySafetyReports(limit = 100) {
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase.rpc('get_my_safety_reports', {
    p_limit: Math.max(1, Math.min(200, Math.trunc(limit)))
  });
  if (error) {
    const detail = `${error.message || ''} ${error.details || ''}`;
    if (/get_my_safety_reports|could not find the function|does not exist/i.test(detail)) return [] as SafetyReportHistoryItem[];
    throw error;
  }
  return (data ?? []) as SafetyReportHistoryItem[];
}
