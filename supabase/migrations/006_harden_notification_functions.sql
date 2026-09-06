-- Keep notification trigger helpers internal and notification read RPCs signed-in only.

revoke execute on function public.push_notification(uuid,text,text,text,text,uuid,uuid,uuid,uuid,bigint) from anon, authenticated;
revoke execute on function public.notify_request_response_insert() from anon, authenticated;
revoke execute on function public.notify_connection_change() from anon, authenticated;
revoke execute on function public.notify_connection_message_insert() from anon, authenticated;
revoke execute on function public.notify_mutual_circle_choice() from anon, authenticated;

revoke execute on function public.mark_notification_read(bigint) from anon;
revoke execute on function public.mark_all_notifications_read() from anon;
grant execute on function public.mark_notification_read(bigint) to authenticated;
grant execute on function public.mark_all_notifications_read() to authenticated;

-- This helper is used internally by Realtime room RLS and should not be callable before sign-in.
revoke execute on function public.can_message_connection(uuid) from anon;
