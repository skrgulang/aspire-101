import { getSupabaseBrowserClient } from './client';

export type LiveConnection = {
  id: string;
  request_id: string;
  requester_id: string;
  responder_id: string;
  status: 'pending' | 'confirmed' | 'active' | 'completed' | 'cancelled';
  payment_method: 'none' | 'in_person' | 'aspire';
  scheduled_start_at: string | null;
  scheduled_end_at: string | null;
  timezone: string | null;
  meeting_label: string | null;
  coordination_status: 'planning' | 'scheduled' | 'on_the_way' | 'arrived' | 'in_progress';
  last_coordination_actor_id: string | null;
  last_coordination_at: string | null;
};

export type LiveConnectionRequest = {
  id: string;
  title: string;
  category: string;
  campus: string | null;
};

export type LiveConnectionProfile = {
  id: string;
  display_name: string | null;
  full_name: string | null;
  name: string | null;
  avatar_url: string | null;
};

export type ConnectionLocationShare = {
  connection_id: string;
  user_id: string;
  latitude: number;
  longitude: number;
  accuracy_meters: number | null;
  expires_at: string;
  updated_at: string;
};

export type ConnectionEvent = {
  id: number;
  connection_id: string;
  actor_id: string | null;
  event_type: 'schedule_set' | 'on_the_way' | 'arrived' | 'in_progress' | 'location_shared' | 'location_stopped' | 'reminder';
  body: string;
  metadata: Record<string, unknown>;
  created_at: string;
};

export async function fetchLiveConnections() {
  const supabase = getSupabaseBrowserClient();
  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError) throw authError;
  if (!authData.user) throw new Error('You must be signed in.');

  // Location is intentionally temporary. The database also hides expired rows with RLS,
  // but this keeps old coordinates from lingering when a user returns to Aspire Live.
  await supabase.rpc('cleanup_expired_connection_locations');

  const { data: connectionRows, error: connectionError } = await supabase
    .from('connections')
    .select('id,request_id,requester_id,responder_id,status,payment_method,scheduled_start_at,scheduled_end_at,timezone,meeting_label,coordination_status,last_coordination_actor_id,last_coordination_at')
    .or(`requester_id.eq.${authData.user.id},responder_id.eq.${authData.user.id}`)
    .in('status', ['confirmed', 'active'])
    .order('updated_at', { ascending: false });
  if (connectionError) throw connectionError;

  const connections = (connectionRows ?? []) as LiveConnection[];
  const requestIds = [...new Set(connections.map((connection) => connection.request_id))];
  const userIds = [...new Set(connections.flatMap((connection) => [connection.requester_id, connection.responder_id]))];
  const connectionIds = connections.map((connection) => connection.id);

  let requests: LiveConnectionRequest[] = [];
  let profiles: LiveConnectionProfile[] = [];
  let locations: ConnectionLocationShare[] = [];

  if (requestIds.length) {
    const { data } = await supabase
      .from('requests')
      .select('id,title,category,campus')
      .in('id', requestIds);
    requests = (data ?? []) as LiveConnectionRequest[];
  }

  if (userIds.length) {
    const { data } = await supabase
      .from('profiles')
      .select('id,display_name,full_name,name,avatar_url')
      .in('id', userIds);
    profiles = (data ?? []) as LiveConnectionProfile[];
  }

  if (connectionIds.length) {
    const { data } = await supabase
      .from('connection_live_locations')
      .select('connection_id,user_id,latitude,longitude,accuracy_meters,expires_at,updated_at')
      .in('connection_id', connectionIds)
      .gt('expires_at', new Date().toISOString());
    locations = (data ?? []) as ConnectionLocationShare[];
  }

  return { userId: authData.user.id, connections, requests, profiles, locations };
}

export async function fetchConnectionEvents(connectionId: string) {
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase
    .from('connection_events')
    .select('id,connection_id,actor_id,event_type,body,metadata,created_at')
    .eq('connection_id', connectionId)
    .order('created_at', { ascending: true })
    .limit(100);
  if (error) throw error;
  return (data ?? []) as ConnectionEvent[];
}

export function subscribeToConnectionEvents(onEvent: (event: ConnectionEvent) => void) {
  const supabase = getSupabaseBrowserClient();
  const channel = supabase
    .channel(`aspire-connection-events-${Math.random().toString(36).slice(2)}`)
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'connection_events' }, (payload) => {
      onEvent(payload.new as ConnectionEvent);
    })
    .subscribe();

  return () => {
    void supabase.removeChannel(channel);
  };
}

export async function setConnectionSchedule(
  connectionId: string,
  startAt: string,
  timezone: string,
  meetingLabel?: string,
  endAt?: string
) {
  const supabase = getSupabaseBrowserClient();
  const { error } = await supabase.rpc('set_connection_schedule', {
    p_connection_id: connectionId,
    p_start_at: startAt,
    p_timezone: timezone,
    p_meeting_label: meetingLabel?.trim() || null,
    p_end_at: endAt || null
  });
  if (error) throw error;
}

export async function setConnectionCoordinationStatus(
  connectionId: string,
  status: 'on_the_way' | 'arrived' | 'in_progress'
) {
  const supabase = getSupabaseBrowserClient();
  const { error } = await supabase.rpc('set_connection_coordination_status', {
    p_connection_id: connectionId,
    p_status: status
  });
  if (error) throw error;
}

export async function shareConnectionLocation(
  connectionId: string,
  latitude: number,
  longitude: number,
  accuracyMeters?: number | null,
  minutes = 30
) {
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase.rpc('share_connection_location', {
    p_connection_id: connectionId,
    p_latitude: latitude,
    p_longitude: longitude,
    p_accuracy_meters: accuracyMeters ?? null,
    p_minutes: minutes
  });
  if (error) throw error;
  return data ? String(data) : '';
}

export async function stopConnectionLocationShare(connectionId: string) {
  const supabase = getSupabaseBrowserClient();
  const { error } = await supabase.rpc('stop_connection_location_share', {
    p_connection_id: connectionId
  });
  if (error) throw error;
}