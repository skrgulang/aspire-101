-- Limit authenticated notification reads to fields required by NotificationCenter and realtime filtering.

revoke select on table public.notifications from authenticated;

grant select (
  id,
  user_id,
  kind,
  connection_id,
  title,
  body,
  read_at,
  created_at
) on table public.notifications to authenticated;

revoke all on table public.notifications from anon;
