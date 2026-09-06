import { getSupabaseBrowserClient } from './client';

export type AspireNotification = {
  id: number;
  user_id: string;
  kind: 'request_response' | 'connection_chosen' | 'connection_confirmed' | 'connection_completed' | 'connection_cancelled' | 'message' | 'circle_mutual';
  actor_id: string | null;
  request_id: string | null;
  response_id: string | null;
  connection_id: string | null;
  message_id: number | null;
  event_key: string;
  title: string;
  body: string | null;
  read_at: string | null;
  created_at: string;
};

export async function fetchNotifications(limit = 40) {
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase
    .from('notifications')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []) as AspireNotification[];
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

export function subscribeToNotifications(userId: string, onNotification: (notification: AspireNotification) => void) {
  const supabase = getSupabaseBrowserClient();
  const channel = supabase
    .channel(`aspire-notifications-${userId}`)
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${userId}` },
      (payload) => onNotification(payload.new as AspireNotification)
    )
    .subscribe();

  return () => {
    void supabase.removeChannel(channel);
  };
}
