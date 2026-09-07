import { getSupabaseBrowserClient } from './client';
import type { AspireRequest } from './requests';

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
  agreed_terms: Record<string, unknown>;
  payment_method: 'none' | 'in_person' | 'aspire';
  created_at: string;
  updated_at: string;
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

export type CircleChoice = {
  connection_id: string;
  user_id: string;
  keep_in_circle: boolean;
  created_at: string;
  updated_at: string;
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

export type PublicProfile = {
  id: string;
  display_name: string | null;
  full_name: string | null;
  name: string | null;
  school: string | null;
  avatar_url: string | null;
};

export async function fetchMyRequestInbox() {
  const supabase = getSupabaseBrowserClient();
  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError) throw authError;
  if (!authData.user) throw new Error('You must be signed in.');

  const { data: requests, error: requestError } = await supabase
    .from('requests')
    .select('*')
    .eq('poster_id', authData.user.id)
    .order('created_at', { ascending: false });
  if (requestError) throw requestError;

  const typedRequests = (requests ?? []) as AspireRequest[];
  const requestIds = typedRequests.map((request) => request.id);
  if (!requestIds.length) return { requests: typedRequests, responses: [] as RequestResponse[], profiles: [] as PublicProfile[] };

  const { data: responses, error: responseError } = await supabase
    .from('request_responses')
    .select('*')
    .in('request_id', requestIds)
    .order('created_at', { ascending: true });
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
    .select('*')
    .or(`requester_id.eq.${authData.user.id},responder_id.eq.${authData.user.id}`)
    .order('created_at', { ascending: false });
  if (error) throw error;

  const connections = (data ?? []) as AspireConnection[];
  const requestIds = [...new Set(connections.map((connection) => connection.request_id))];
  const userIds = [...new Set(connections.flatMap((connection) => [connection.requester_id, connection.responder_id]))];

  let requests: AspireRequest[] = [];
  let profiles: PublicProfile[] = [];
  if (requestIds.length) {
    const { data: requestData } = await supabase.from('requests').select('*').in('id', requestIds);
    requests = (requestData ?? []) as AspireRequest[];
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
  return data as string;
}

export async function confirmConnection(connectionId: string) {
  const supabase = getSupabaseBrowserClient();
  const { error } = await supabase.rpc('confirm_connection', { p_connection_id: connectionId });
  if (error) throw error;
}

export async function cancelConnection(connectionId: string) {
  const supabase = getSupabaseBrowserClient();
  const { error } = await supabase.rpc('cancel_connection', { p_connection_id: connectionId });
  if (error) throw error;
}

export async function fetchConnectionMessages(connectionId: string) {
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase
    .from('connection_messages')
    .select('*')
    .eq('connection_id', connectionId)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return (data ?? []) as ConnectionMessage[];
}

export async function sendConnectionMessage(connectionId: string, body: string) {
  const supabase = getSupabaseBrowserClient();
  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError) throw authError;
  if (!authData.user) throw new Error('You must be signed in.');

  const trimmed = body.trim();
  if (!trimmed) throw new Error('Write a message first.');
  if (trimmed.length > 2000) throw new Error('Messages can be up to 2,000 characters.');

  const { data, error } = await supabase
    .from('connection_messages')
    .insert({ connection_id: connectionId, sender_id: authData.user.id, body: trimmed })
    .select('*')
    .single();
  if (error) {
    const detail = `${error.message || ''} ${error.details || ''} ${error.hint || ''}`;
    if (/MESSAGE_POLICY_BLOCKED/i.test(detail)) throw new Error('That message contains language that is not allowed on Aspire.');
    if (/MESSAGE_RATE_LIMIT/i.test(detail)) throw new Error('You are sending messages too quickly. Wait a moment and try again.');
    throw error;
  }
  return data as ConnectionMessage;
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

export async function markConnectionRead(connectionId: string, lastMessageId?: number) {
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase.rpc('mark_connection_read', {
    p_connection_id: connectionId,
    p_last_read_message_id: lastMessageId ?? null
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

export async function fetchCircleChoices(connectionIds: string[]) {
  if (!connectionIds.length) return [] as CircleChoice[];
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase
    .from('connection_circle_choices')
    .select('connection_id,user_id,keep_in_circle,created_at,updated_at')
    .in('connection_id', connectionIds);
  if (error) throw error;
  return (data ?? []) as CircleChoice[];
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
  if (!connectionIds.length) return [] as ConnectionReview[];
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase
    .from('connection_reviews')
    .select('id,connection_id,reviewer_id,reviewee_id,would_connect_again,tags,note,created_at,updated_at')
    .in('connection_id', connectionIds);
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
  return Number(data);
}
