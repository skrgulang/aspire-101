import { getSupabaseBrowserClient } from './client';

export type ResolutionReason = 'no_show' | 'cancellation' | 'incomplete' | 'not_as_described' | 'payment' | 'safety' | 'other';
export type RequestedResolution = 'refund' | 'provider_compensation' | 'partial' | 'review' | 'safety_review';
export type ResolutionStatus = 'submitted' | 'under_review' | 'resolved_refund' | 'resolved_release' | 'resolved_partial' | 'dismissed';

export type ConnectionResolutionCase = {
  id: string;
  connection_id: string;
  request_id: string;
  opened_by: string;
  against_user_id: string | null;
  reason: ResolutionReason;
  requested_resolution: RequestedResolution;
  details: string | null;
  status: ResolutionStatus;
  payment_status_snapshot: string | null;
  payment_total_cents_snapshot: number | null;
  currency_snapshot: string | null;
  scheduled_start_snapshot: string | null;
  meeting_label_snapshot: string | null;
  coordination_status_snapshot: string | null;
  evidence_snapshot: Record<string, unknown>;
  resolution_note: string | null;
  refund_cents: number | null;
  provider_release_cents: number | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  created_at: string;
  updated_at: string;
};

export type ConnectionResolutionResponse = {
  id: string;
  case_id: string;
  connection_id: string;
  author_id: string;
  body: string;
  created_at: string;
};

export type ConnectionNoShowIncident = {
  id: string;
  case_id: string;
  connection_id: string;
  user_id: string;
  confirmed_by: string;
  note: string | null;
  created_at: string;
};

function missingPreviewRelation(error: { code?: string; message?: string } | null) {
  if (!error) return false;
  return error.code === '42P01'
    || error.code === 'PGRST205'
    || /could not find the table|relation .* does not exist/i.test(error.message || '');
}

export async function fetchResolutionCases(connectionIds: string[]) {
  if (!connectionIds.length) return [] as ConnectionResolutionCase[];
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase
    .from('connection_resolution_cases')
    .select('*')
    .in('connection_id', connectionIds)
    .order('created_at', { ascending: false });
  if (error) {
    if (missingPreviewRelation(error)) return [] as ConnectionResolutionCase[];
    throw error;
  }
  return (data ?? []) as ConnectionResolutionCase[];
}

export async function fetchResolutionCaseResponses(caseIds: string[]) {
  if (!caseIds.length) return [] as ConnectionResolutionResponse[];
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase
    .from('connection_resolution_responses')
    .select('id,case_id,connection_id,author_id,body,created_at')
    .in('case_id', caseIds)
    .order('created_at', { ascending: true });
  if (error) {
    if (missingPreviewRelation(error)) return [] as ConnectionResolutionResponse[];
    throw error;
  }
  return (data ?? []) as ConnectionResolutionResponse[];
}

export async function fetchNoShowIncidents(userIds: string[]) {
  const ids = [...new Set(userIds.filter(Boolean))];
  if (!ids.length) return [] as ConnectionNoShowIncident[];
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase
    .from('connection_no_show_incidents')
    .select('id,case_id,connection_id,user_id,confirmed_by,note,created_at')
    .in('user_id', ids)
    .order('created_at', { ascending: false });
  if (error) {
    if (missingPreviewRelation(error)) return [] as ConnectionNoShowIncident[];
    throw error;
  }
  return (data ?? []) as ConnectionNoShowIncident[];
}

export async function fetchResolutionCasesForModeration(limit = 100) {
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase
    .from('connection_resolution_cases')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) {
    if (missingPreviewRelation(error)) return [] as ConnectionResolutionCase[];
    throw error;
  }
  return (data ?? []) as ConnectionResolutionCase[];
}

export async function openResolutionCase(input: {
  connectionId: string;
  reason: ResolutionReason;
  details?: string;
  requestedResolution?: RequestedResolution;
  againstUserId?: string | null;
}) {
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase.rpc('open_connection_resolution_case', {
    p_connection_id: input.connectionId,
    p_reason: input.reason,
    p_details: input.details?.trim() || null,
    p_requested_resolution: input.requestedResolution || 'review',
    p_against_user_id: input.againstUserId || null
  });
  if (error) {
    const text = `${error.message || ''} ${error.details || ''}`;
    if (/NO_SHOW_GRACE_PERIOD/i.test(text)) throw new Error('No-show reports unlock 10 minutes after the agreed start time. Use chat or “Running late” before then.');
    if (/function .*open_connection_resolution_case.*does not exist|could not find the function/i.test(text)) throw new Error('Resolution Center is not enabled in this preview database yet.');
    throw error;
  }
  return String(data || '');
}

export async function addResolutionCaseResponse(caseId: string, body: string) {
  const clean = body.trim();
  if (!clean) throw new Error('Write a short update first.');
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase.rpc('add_connection_resolution_response', {
    p_case_id: caseId,
    p_body: clean
  });
  if (error) throw error;
  return String(data || '');
}

export async function reviewResolutionCase(caseId: string, status: 'under_review' | 'dismissed', note?: string) {
  const supabase = getSupabaseBrowserClient();
  const { error } = await supabase.rpc('review_connection_resolution_case', {
    p_case_id: caseId,
    p_status: status,
    p_note: note?.trim() || null
  });
  if (error) throw error;
}

async function authHeaders() {
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  const token = data.session?.access_token;
  if (!token) throw new Error('Sign in again to continue.');
  return { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
}

export async function resolveResolutionCase(caseId: string, action: 'refund_full' | 'dismiss', note?: string) {
  const response = await fetch('/api/resolution/resolve', {
    method: 'POST',
    headers: await authHeaders(),
    body: JSON.stringify({ caseId, action, note: note?.trim() || null })
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload?.error || 'Could not resolve this case.');
  return payload as { ok: true; status: ResolutionStatus; refundCents?: number };
}
