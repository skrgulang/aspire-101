import { getSupabaseBrowserClient } from './client';
import type { AspireRequest, TrustBand } from './requests';

export type SchoolVerificationStatus = 'pending' | 'verified' | 'rejected';
export type SchoolVerificationMethod = 'manual_id' | 'school_email';

export type SchoolVerification = {
  user_id: string;
  school: string;
  student_id: string | null;
  status: SchoolVerificationStatus;
  submitted_at: string;
  review_note: string | null;
  verification_method: SchoolVerificationMethod;
  school_email: string | null;
  verified_at: string | null;
};

const schoolVerificationSelect = 'user_id,school,student_id,status,submitted_at,review_note,verification_method,school_email,verified_at' as const;

export type AppRole = 'member' | 'moderator' | 'admin';
export type EnforcementState = 'active' | 'restricted' | 'suspended';

export type UserEnforcementState = {
  user_id: string;
  state: EnforcementState;
  reason: string | null;
  expires_at: string | null;
};

export type SafetyReportForModeration = {
  id: string;
  reporter_id: string;
  target_user_id: string | null;
  request_id: string | null;
  connection_id: string | null;
  reason: string;
  details: string | null;
  status: 'submitted' | 'reviewing' | 'resolved' | 'dismissed';
  created_at: string;
  reviewed_at: string | null;
};

const safetyReportSelect = 'id,reporter_id,target_user_id,request_id,connection_id,reason,details,status,created_at,reviewed_at' as const;

export type RequestAiSafetyPublicResult = {
  ok: boolean;
  requestId: string;
  imageCount: number;
  moderationStatus: 'pending' | 'approved' | 'rejected' | 'blocked';
};

export type RequestAiSafetyModeratorResult = RequestAiSafetyPublicResult & {
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  riskScore: number;
  recommendedAction: 'approve' | 'review' | 'block';
  flags: string[];
  behaviorFlags: string[];
  trustScore: number | null;
  trustBand: TrustBand | null;
};

type RequestAiSafetyWireResult = RequestAiSafetyPublicResult | RequestAiSafetyModeratorResult;

function hasRequestAiSafetyDetails(result: RequestAiSafetyWireResult): result is RequestAiSafetyModeratorResult {
  return 'riskLevel' in result
    && 'riskScore' in result
    && 'recommendedAction' in result
    && 'flags' in result
    && 'behaviorFlags' in result;
}

export async function fetchMySchoolVerification() {
  const supabase = getSupabaseBrowserClient();
  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError) throw authError;
  if (!authData.user) throw new Error('You must be signed in.');
  const { data, error } = await supabase
    .from('school_verifications')
    .select(schoolVerificationSelect)
    .eq('user_id', authData.user.id)
    .maybeSingle();
  if (error) throw error;
  return (data ?? null) as SchoolVerification | null;
}

export async function submitSchoolVerification(school: string, studentId: string) {
  const supabase = getSupabaseBrowserClient();
  const cleanSchool = school.trim();
  const cleanId = studentId.trim();
  if (cleanSchool.length < 2) throw new Error('Enter your school.');
  if (cleanId.length < 3) throw new Error('Enter your school ID.');
  const { data, error } = await supabase.rpc('submit_school_verification', {
    p_school: cleanSchool,
    p_student_id: cleanId
  });
  if (error) {
    if (error.code === '23505') throw new Error('That school ID is already connected to another Aspire account.');
    if (/ALREADY_VERIFIED/i.test(error.message || '')) throw new Error('Your school verification is already approved.');
    throw error;
  }
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) throw new Error('Could not load the submitted verification.');
  return row as SchoolVerification;
}

export async function canCurrentUserPost() {
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase.rpc('can_post_request');
  if (error) throw error;
  return Boolean(data);
}

export async function fetchMyRole(): Promise<AppRole> {
  const supabase = getSupabaseBrowserClient();
  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError) throw authError;
  if (!authData.user) return 'member';
  const { data, error } = await supabase.from('user_roles').select('role').eq('user_id', authData.user.id).maybeSingle();
  if (error) throw error;
  return ((data?.role as AppRole | undefined) ?? 'member');
}

export async function fetchVerificationQueue() {
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase
    .from('school_verifications')
    .select(schoolVerificationSelect)
    .order('submitted_at', { ascending: true });
  if (error) throw error;
  return (data ?? []) as SchoolVerification[];
}

export async function reviewSchoolVerification(userId: string, decision: 'verified' | 'rejected', note?: string) {
  const supabase = getSupabaseBrowserClient();
  const { error } = await supabase.rpc('review_school_verification', { p_user_id: userId, p_decision: decision, p_note: note?.trim() || null });
  if (error) throw error;
}

export async function fetchSafetyReportsForModeration() {
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase.rpc('moderator_fetch_safety_reports', { p_limit: 200 });
  if (error) throw error;
  return (data ?? []) as SafetyReportForModeration[];
}

export async function reviewSafetyReport(reportId: string, status: 'reviewing' | 'resolved' | 'dismissed', note?: string) {
  const supabase = getSupabaseBrowserClient();
  const { error } = await supabase.rpc('moderator_review_safety_report', { p_report_id: reportId, p_status: status, p_note: note?.trim() || null });
  if (error) throw error;
}

export async function fetchRequestsForModeration(limit = 80) {
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase.rpc('moderator_fetch_requests', { p_limit: limit });
  if (error) throw error;
  return (data ?? []) as AspireRequest[];
}

export async function fetchEnforcementStates(userIds: string[]) {
  if (!userIds.length) return [] as UserEnforcementState[];
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase
    .from('user_enforcement_states')
    .select('user_id,state,reason,expires_at')
    .in('user_id', [...new Set(userIds)]);
  if (error) throw error;
  return (data ?? []) as UserEnforcementState[];
}

export async function setUserEnforcement(userId: string, state: EnforcementState, reason?: string, expiresAt?: string | null) {
  const supabase = getSupabaseBrowserClient();
  const { error } = await supabase.rpc('moderator_set_user_enforcement', {
    p_user_id: userId,
    p_state: state,
    p_reason: reason?.trim() || null,
    p_expires_at: expiresAt || null
  });
  if (error) throw error;
}

async function requestAiSafety(requestId: string): Promise<RequestAiSafetyWireResult> {
  const supabase = getSupabaseBrowserClient();
  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  if (sessionError) throw sessionError;
  const token = sessionData.session?.access_token;
  if (!token) throw new Error('Sign in again to run the safety scan.');
  const response = await fetch('/api/moderation/request', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ requestId })
  });
  const payload = await response.json().catch(() => ({})) as RequestAiSafetyWireResult & { error?: string; code?: string };
  if (!response.ok) throw new Error(payload.error || 'Aspire Safety Intelligence could not finish the scan.');
  return payload;
}

export async function runRequestAiSafety(requestId: string): Promise<RequestAiSafetyPublicResult> {
  const payload = await requestAiSafety(requestId);
  return {
    ok: payload.ok,
    requestId: payload.requestId,
    moderationStatus: payload.moderationStatus,
    imageCount: payload.imageCount
  };
}

export async function runModeratorRequestAiSafety(requestId: string): Promise<RequestAiSafetyModeratorResult> {
  const payload = await requestAiSafety(requestId);
  if (!hasRequestAiSafetyDetails(payload)) {
    throw new Error('Moderator safety details were not returned. Check your staff access and try again.');
  }
  return payload;
}

export async function reviewRequestModeration(requestId: string, decision: 'approved' | 'rejected', note?: string) {
  const supabase = getSupabaseBrowserClient();
  const { error } = await supabase.rpc('moderator_review_request', { p_request_id: requestId, p_decision: decision, p_note: note?.trim() || null });
  if (error) throw error;
}

export async function removeRequestAsModerator(requestId: string, reason: string) {
  const supabase = getSupabaseBrowserClient();
  const { error } = await supabase.rpc('moderator_remove_request', { p_request_id: requestId, p_reason: reason.trim() });
  if (error) throw error;
}

export async function setModeratorByEmail(email: string, enabled: boolean) {
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase.rpc('set_moderator_by_email', { p_email: email.trim(), p_enabled: enabled });
  if (error) throw error;
  return data as string;
}