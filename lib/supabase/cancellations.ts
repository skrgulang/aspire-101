import { getSupabaseBrowserClient } from './client';

export type ConnectionCancellationEvent = {
  id: number;
  connection_id: string;
  actor_id: string | null;
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

export async function fetchCancellationEvents(connectionIds: string[]) {
  if (!connectionIds.length) return [] as ConnectionCancellationEvent[];
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase
    .from('connection_events')
    .select('id,connection_id,actor_id,body,metadata,created_at')
    .in('connection_id', connectionIds)
    .eq('event_type', 'connection_cancelled')
    .order('created_at', { ascending: false });

  if (error) {
    if (missingPreviewRelation(error)) return [] as ConnectionCancellationEvent[];
    throw error;
  }

  return (data ?? []) as ConnectionCancellationEvent[];
}
