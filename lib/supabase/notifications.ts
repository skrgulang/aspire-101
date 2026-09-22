import { getSupabaseBrowserClient } from './client';

export type AspireNotification = {
  id: number;
  kind:
    | 'request_response'
    | 'connection_chosen'
    | 'connection_confirmed'
    | 'connection_completed'
    | 'connection_cancelled'
    | 'message'
    | 'circle_mutual'
    | 'connection_reminder'
    | 'connection_coordination'
    | 'resolution_case'
    | 'post_review'
    | 'market_order';
  connection_id: string | null;
  title: string;
  body: string | null;
  read_at: string | null;
  created_at: string;
};

const notificationPollMs = 12_000;

function toAspireNotification(row: Record<string, unknown>): AspireNotification {
  return {
    id: Number(row.id),
    kind: row.kind as AspireNotification['kind'],
    connection_id: row.connection_id ? String(row.connection_id) : null,
    title: String(row.title || ''),
    body: row.body == null ? null : String(row.body),
    read_at: row.read_at == null ? null : String(row.read_at),
    created_at: String(row.created_at || new Date().toISOString())
  };
}

export async function fetchNotifications(limit = 40) {
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase.rpc('get_my_notifications', {
    p_limit: Math.max(1, Math.min(100, limit))
  });
  if (error) throw error;
  return ((data ?? []) as Array<Record<string, unknown>>).map(toAspireNotification);
}

export async function markNotificationRead(notificationId: number) {
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase.rpc('mark_notification_read', {
    p_notification_id: notificationId
  });
  if (error) throw error;
  return Boolean(data);
}

export async function markAllNotificationsRead() {
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase.rpc('mark_all_notifications_read');
  if (error) throw error;
  return Number(data || 0);
}

export function subscribeToNotifications(
  userId: string,
  onNotifications: (notifications: AspireNotification[]) => void,
  onError?: () => void
) {
  if (!userId) return () => undefined;

  const supabase = getSupabaseBrowserClient();
  let active = true;
  let timer: ReturnType<typeof setInterval> | null = null;

  const refresh = async () => {
    try {
      const next = await fetchNotifications();
      if (active) onNotifications(next);
    } catch {
      if (active) onError?.();
    }
  };

  void refresh();
  timer = setInterval(() => { void refresh(); }, notificationPollMs);

  const channel = supabase
    .channel(`notifications-${userId}-${Math.random().toString(36).slice(2)}`)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'notifications', filter: `user_id=eq.${userId}` },
      () => { void refresh(); }
    )
    .subscribe();

  const onVisibility = () => {
    if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
      void refresh();
    }
  };
  if (typeof document !== 'undefined') document.addEventListener('visibilitychange', onVisibility);

  return () => {
    active = false;
    if (timer) clearInterval(timer);
    void supabase.removeChannel(channel);
    if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', onVisibility);
  };
}
