import { getSupabaseBrowserClient } from './client';

export type LiveConnection = {
  id: string;
  request_id: string;
  requester_id: string;
  responder_id: string;
  status: 'pending' | 'confirmed' | 'active' | 'completed' | 'cancelled';
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

export type ConnectionScheduleProposal = {
  id: string;
  connection_id: string;
  proposed_by: string;
  start_at: string;
  end_at: string | null;
  timezone: string | null;
  meeting_label: string | null;
  status: 'pending' | 'accepted' | 'declined' | 'superseded';
  responded_by: string | null;
  responded_at: string | null;
  created_at: string;
  updated_at: string;
};

export type ConnectionCancellationResult = {
  status: 'cancelled';
  resolution_case_id: string | null;
  review_required: boolean;
  payment_status: string | null;
};

export type ConnectionEvent = {
  id: number;
  connection_id: string;
  actor_id: string | null;
  event_type:
    | 'schedule_set'
    | 'schedule_proposed'
    | 'schedule_declined'
    | 'on_the_way'
    | 'arrived'
    | 'in_progress'
    | 'location_shared'
    | 'location_stopped'
    | 'reminder'
    | 'running_late'
    | 'cannot_make_it'
    | 'connection_cancelled'
    | 'issue_opened'
    | 'issue_reviewing'
    | 'issue_response'
    | 'issue_resolved';
  body: string;
  metadata: Record<string, unknown>;
  created_at: string;
};

function missingPreviewRelation(error: { code?: string; message?: string } | null) {
  if (!error) return false;
  return error.code === '42P01'
    || error.code === 'PGRST205'
    || /could not find the table|relation .* does not exist/i.test(error.message || '');
}

function missingPreviewFunction(error: { code?: string; message?: string } | null) {
  if (!error) return false;
  return error.code === 'PGRST202'
    || /could not find the function|function .* does not exist/i.test(error.message || '');
}

export async function fetchLiveConnections() {
  const supabase = getSupabaseBrowserClient();
  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError) throw authError;
  if (!authData.user) throw new Error('You must be signed in.');

  const { data: connectionRows, error: connectionError } = await supabase
    .from('connections')
    .select('id,request_id,requester_id,responder_id,status,scheduled_start_at,scheduled_end_at,timezone,meeting_label,coordination_status,last_coordination_actor_id,last_coordination_at')
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
  let scheduleProposals: ConnectionScheduleProposal[] = [];

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
    const [{ data: locationRows }, { data: proposalRows, error: proposalError }] = await Promise.all([
      supabase
        .from('connection_live_locations')
        .select('connection_id,user_id,latitude,longitude,accuracy_meters,expires_at,updated_at')
        .in('connection_id', connectionIds)
        .gt('expires_at', new Date().toISOString()),
      supabase
        .from('connection_schedule_proposals')
        .select('id,connection_id,proposed_by,start_at,end_at,timezone,meeting_label,status,responded_by,responded_at,created_at,updated_at')
        .in('connection_id', connectionIds)
        .eq('status', 'pending')
        .order('created_at', { ascending: false })
    ]);
    locations = (locationRows ?? []) as ConnectionLocationShare[];
    if (proposalError && !missingPreviewRelation(proposalError)) throw proposalError;
    if (!proposalError) scheduleProposals = (proposalRows ?? []) as ConnectionScheduleProposal[];
  }

  return { userId: authData.user.id, connections, requests, profiles, locations, scheduleProposals };
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

export async function proposeConnectionSchedule(
  connectionId: string,
  startAt: string,
  timezone: string,
  meetingLabel?: string,
  endAt?: string
) {
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase.rpc('propose_connection_schedule', {
    p_connection_id: connectionId,
    p_start_at: startAt,
    p_timezone: timezone,
    p_meeting_label: meetingLabel?.trim() || null,
    p_end_at: endAt || null
  });
  if (error) {
    if (missingPreviewFunction(error)) throw new Error('Mutual time proposals are not enabled in this preview database yet.');
    throw error;
  }
  return String(data || '');
}

export async function respondConnectionSchedule(proposalId: string, accept: boolean) {
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase.rpc('respond_connection_schedule', {
    p_proposal_id: proposalId,
    p_accept: accept
  });
  if (error) throw error;
  return String(data || '');
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

export async function recordConnectionAttendanceUpdate(
  connectionId: string,
  update: 'running_late' | 'cannot_make_it'
) {
  const supabase = getSupabaseBrowserClient();
  const { error } = await supabase.rpc('record_connection_attendance_update', {
    p_connection_id: connectionId,
    p_update: update
  });
  if (error) {
    if (missingPreviewFunction(error)) throw new Error('Attendance updates are not enabled in this preview database yet.');
    throw error;
  }
}

export async function cancelConnectionWithProtection(connectionId: string, note?: string) {
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase.rpc('cancel_connection_with_protection', {
    p_connection_id: connectionId,
    p_note: note?.trim() || null
  });
  if (error) {
    const text = `${error.message || ''} ${error.details || ''}`;
    if (missingPreviewFunction(error)) throw new Error('Participant cancellation is not enabled in this preview database yet.');
    if (/PAYMENT_STILL_PROCESSING/i.test(text)) throw new Error('This payment is still processing. Wait for Stripe to finish before cancelling so Aspire does not create a conflicting money state.');
    if (/PAYMENT_NEEDS_RESOLUTION_CENTER/i.test(text)) throw new Error('This payment is already released or disputed. Use Get help / Resolution Center instead of cancelling the connection directly.');
    throw error;
  }
  return (data || { status: 'cancelled', resolution_case_id: null, review_required: false, payment_status: null }) as ConnectionCancellationResult;
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
