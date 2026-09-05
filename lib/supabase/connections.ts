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

  const { data, error } = await supabase
    .from('connection_messages')
    .insert({ connection_id: connectionId, sender_id: authData.user.id, body: body.trim() })
    .select('*')
    .single();
  if (error) throw error;
  return data as ConnectionMessage;
}
