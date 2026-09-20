import { getSupabaseBrowserClient } from './client';
import { trackProductEvent } from '../analytics/client';
import type { AspireRequest } from './requests';
import { REQUEST_PUBLIC_SELECT } from './requestProjection';

export type RequestResponse = {
  id: string;
  request_id: string;
  responder_id: string;
  message: string | null;
  status: 'pending' | 'accepted' | 'declined' | 'withdrawn';
  created_at: string;
};

export type AspireConnection = {
  id: string;
  request_id: string;
  requester_id: string;
  responder_id: string;
  requester_confirmed: boolean;
  responder_confirmed: boolean;
  status: 'pending' | 'confirmed' | 'active' | 'completed' | 'cancelled';
  agreed_amount_cents: number | null;
  payment_method: 'none' | 'in_person' | 'aspire';
  scheduled_start_at: string | null;
  scheduled_end_at: string | null;
  coordination_status: 'planning' | 'scheduled' | 'on_the_way' | 'arrived' | 'in_progress';
};

export type ConnectionMessage = {
  id: number;
  connection_id: string;
  sender_id: string;
  body: string;
  created_at: string;
};

export type ConnectionUnread = {
  connection_id: string;
  unread_count: number;
  last_message_at: string | null;
};

export type CircleEntry = {
  connection_id: string;
  other_user_id: string;
  connected_at: string;
};

export type ConnectionReview = {
  id: number;
  connection_id: string;
  reviewer_id: string;
  reviewee_id: string;
  would_connect_again: boolean;
  tags: string[];
  note: string | null;
  created_at: string;
  updated_at: string;
};

export type ConnectionLifecycleState = {
  connection_id: string;
  viewer_completed: boolean;
  other_completed: boolean;
  completion_count: number;
  viewer_circle_choice: boolean | null;
  mutual_circle: boolean;
  blocked_between: boolean;
};

export type PublicProfile = {
  id: string;
  display_name: string | null;
  full_name: string | null;
  name: string | null;
  school: string | null;
  avatar_url: string | null;
};

const requestResponseSelect = 'id,request_id,responder_id,message,status,created_at' as const;
const connectionSelect = 'id,request_id,requester_id,responder_id,requester_confirmed,responder_confirmed,status,agreed_amount_cents,payment_method,scheduled_start_at,scheduled_end_at,coordination_status' as const;
const connectionMessageSelect = 'id,connection_id,sender_id,body,created_at' as const;

export async function fetchMyRequestInbox() {
  const supabase = getSupabaseBrowserClient();
  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError) throw authError;
  if (!authData.user) throw new Error('You must be signed in.');

  const { data: requests, error: requestError } = await supabase
    .from('requests')
    .select(REQUEST_PUBLIC_SELECT)
    .eq('poster_id', authData.user.id)
    .order('created_at', { ascending: false });
  if (requestError) throw requestError;

  const typedRequests = (requests ?? []) as unknown as AspireRequest[];
  const requestIds = typedRequests.map((request) => request.id);
  if (!requestIds.length) return { requests: typedRequests, responses: [] as RequestResponse[], profiles: [] as PublicProfile[] };

  const { data: responses, error: responseError } = await supabase.rpc('get_responses_for_my_requests', {
    p_request_ids: requestIds.slice(0, 200)
  });
  if (responseError) throw responseError;

  const typedResponses = (responses ?? []) as RequestResponse[];
  const responderIds = [...new Set(typedResponses.map((response) => response.responder_id))];
  let profiles: PublicProfile[] = [];
  if (responderIds.length) {
    const { data: profileData } = await supabase
      .from('profiles')
      .select('id, display_name, full_name, name, school, avatar_url')
      .in('id', responderIds);
    profiles = (profileData ?? []) as PublicProfile[];
  }

  return { requests: typedRequests, responses: typedResponses, profiles };
}

export async function fetchMyConnections() {
  const supabase = getSupabaseBrowserClient();
  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError) throw authError;
  if (!authData.user) throw new Error('You must be signed in.');

  const { data, error } = await supabase
    .from('connections')
    .select(connectionSelect)
    .or(`requester_id.eq.${authData.user.id},responder_id.eq.${authData.user.id}`)
    .order('created_at', { ascending: false });
  if (error) throw error;

  const connections = (data ?? []) as AspireConnection[];
  const requestIds = [...new Set(connections.map((connection) => connection.request_id))];
  const userIds = [...new Set(connections.flatMap((connection) => [connection.requester_id, connection.responder_id]))];

  let requests: AspireRequest[] = [];
  let profiles: PublicProfile[] = [];
  if (requestIds.length) {
    const { data: requestData } = await supabase.from('requests').select(REQUEST_PUBLIC_SELECT).in('id', requestIds);
    requests = (requestData ?? []) as unknown as AspireRequest[];
  }
  if (userIds.length) {
    const { data: profileData } = await supabase.from('profiles').select('id, display_name, full_name, name, school, avatar_url').in('id', userIds);
    profiles = (profileData ?? []) as PublicProfile[];
  }

  return { userId: authData.user.id, connections, requests, profiles };
}

export async function acceptRequestResponse(responseId: string) {
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase.rpc('accept_request_response', { p_response_id: responseId });
  if (error) throw error;
  void trackProductEvent('connection_chosen');
  return data as string;
}

export async function confirmConnection(connectionId: string) {
  const supabase = getSupabaseBrowserClient();
  const { error } = await supabase.rpc('confirm_connection', { p_connection_id: connectionId });
  if (error) throw error;
  void trackProductEvent('connection_confirmed');
}

export async function cancelConnection(connectionId: string) {
  const supabase = getSupabaseBrowserClient();

  // Pending means the requester chose someone but the responder has not confirmed.
  // Reopen the original request instead of killing it and forcing the requester to repost.
  const { data: resetResult, error: resetError } = await supabase.rpc('reset_pending_connection', {
    p_connection_id: connectionId
  });

  if (!resetError) {
    if (typeof window !== 'undefined') {
      const outcome = String(resetResult || 'reopened');
      window.sessionStorage.setItem('aspire-pending-choice-outcome', outcome);
      window.location.assign('/connections#my-activity');
    }
    return;
  }

  const resetDetail = `${resetError.message || ''} ${resetError.details || ''} ${resetError.hint || ''}`;
  if (/PAYMENT_ACTIVITY_EXISTS/i.test(resetDetail)) {
    throw new Error('This connection already has payment activity. Use the normal cancellation or Resolution Center flow instead.');
  }

  // Confirmed/active connections are not eligible for pending reset; use the regular
  // protected cancellation path for those lifecycle states.
  if (!/Only an unconfirmed connection choice can be reopened|Request is not awaiting responder confirmation/i.test(resetDetail)) {
    throw resetError;
  }

  const { error } = await supabase.rpc('cancel_connection', { p_connection_id: connectionId });
  if (error) throw error;
}

export async function fetchConnectionMessages(connectionId: string) {
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase
    .from('connection_messages')
    .select(connectionMessageSelect)
    .eq('connection_id', connectionId)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return (data ?? []) as ConnectionMessage[];
}

export async function sendConnectionMessage(connectionId: string, body: string) {
  const supabase = getSupabaseBrowserClient();
  const trimmed = body.trim();
  if (!trimmed) throw new Error('Write a message first.');
  if (trimmed.length > 2000) throw new Error('Messages can be up to 2,000 characters.');

  const { data, error } = await supabase.rpc('send_connection_message', {
    p_connection_id: connectionId,
    p_body: trimmed
  });
  if (error) {
    const detail = `${error.message || ''} ${error.details || ''} ${error.hint || ''}`;
    if (/MESSAGE_POLICY_BLOCKED/i.test(detail)) throw new Error('That message contains language that is not allowed on Aspire.');
    if (/MESSAGE_RATE_LIMIT/i.test(detail)) throw new Error('You are sending messages too quickly. Wait a moment and try again.');
    if (/ACCOUNT_SUSPENDED/i.test(detail)) throw new Error('This Aspire account is suspended from sending new private messages. Check your account notice or contact support.');
    if (/Authentication required/i.test(detail)) throw new Error('You must be signed in.');
    if (/Not authorized/i.test(detail)) throw new Error('Messaging is not available for this connection.');
    throw error;
  }
  const row = ((data ?? [])[0] ?? null) as ConnectionMessage | null;
  if (!row) throw new Error('Could not send this message.');
  return row;
}

export function subscribeToConnectionMessages(onMessage: (message: ConnectionMessage) => void) {
  const supabase = getSupabaseBrowserClient();
  const channel = supabase
    .channel(`aspire-connections-${Math.random().toString(36).slice(2)}`)
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'connection_messages' }, (payload) => {
      onMessage(payload.new as ConnectionMessage);
    })
    .subscribe();

  return () => {
    void supabase.removeChannel(channel);
  };
}

const connectionActivityKinds = new Set([
  'connection_chosen',
  'connection_confirmed',
  'connection_completed',
  'connection_cancelled',
  'connection_coordination',
  'circle_mutual',
  'resolution_case'
]);

export function subscribeToMyConnectionActivity(userId: string, onActivity: () => void) {
  const supabase = getSupabaseBrowserClient();
  const channel = supabase
    .channel(`aspire-connection-activity-${userId}-${Math.random().toString(36).slice(2)}`)
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${userId}` },
      (payload) => {
        const row = payload.new as { kind?: string };
        if (row.kind && connectionActivityKinds.has(row.kind)) onActivity();
      }
    )
    .subscribe();

  return () => {
    void supabase.removeChannel(channel);
  };
}

export async function markConnectionRead(connectionId: string, lastMessageId?: number) {
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase.rpc('mark_connection_read', {
    p_connection_id: connectionId,
    p_last_message_id: lastMessageId ?? null
  });
  if (error) throw error;
  return Number(data || 0);
}

export async function fetchConnectionUnreadCounts() {
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase.rpc('get_connection_unread_counts');
  if (error) throw error;
  return ((data ?? []) as Array<Record<string, unknown>>).map((row) => ({
    connection_id: String(row.connection_id),
    unread_count: Number(row.unread_count || 0),
    last_message_at: row.last_message_at ? String(row.last_message_at) : null
  })) as ConnectionUnread[];
}

export async function fetchConnectionLifecycleStates() {
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase.rpc('get_connection_lifecycle_states');
  if (error) throw error;
  return ((data ?? []) as Array<Record<string, unknown>>).map((row) => ({
    connection_id: String(row.connection_id),
    viewer_completed: Boolean(row.viewer_completed),
    other_completed: Boolean(row.other_completed),
    completion_count: Number(row.completion_count || 0),
    viewer_circle_choice: row.viewer_circle_choice == null ? null : Boolean(row.viewer_circle_choice),
    mutual_circle: Boolean(row.mutual_circle),
    blocked_between: Boolean(row.blocked_between)
  })) as ConnectionLifecycleState[];
}

export async function setCircleChoice(connectionId: string, keep: boolean) {
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase.rpc('set_circle_choice', { p_connection_id: connectionId, p_keep: keep });
  if (error) throw error;
  return Boolean(data);
}

export async function fetchMyCircle() {
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase.rpc('get_my_circle');
  if (error) throw error;
  return ((data ?? []) as Array<Record<string, unknown>>).map((row) => ({
    connection_id: String(row.connection_id),
    other_user_id: String(row.other_user_id),
    connected_at: String(row.connected_at)
  })) as CircleEntry[];
}

export async function fetchConnectionReviews(connectionIds: string[]) {
  const ids = [...new Set(connectionIds.filter(Boolean))].slice(0, 200);
  if (!ids.length) return [] as ConnectionReview[];
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase.rpc('get_my_connection_reviews', {
    p_connection_ids: ids
  });
  if (error) throw error;
  return (data ?? []) as ConnectionReview[];
}

export async function submitConnectionReview(connectionId: string, wouldConnectAgain: boolean, tags: string[] = [], note = '') {
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase.rpc('submit_connection_review', {
    p_connection_id: connectionId,
    p_would_connect_again: wouldConnectAgain,
    p_tags: tags,
    p_note: note || null
  });
  if (error) throw error;
  void trackProductEvent('review_submitted', {
    would_connect_again: wouldConnectAgain,
    tag_count: tags.length
  });
  return Number(data);
}
