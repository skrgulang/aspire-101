-- Restrict authenticated notification reads to the fields used by the notification UI and realtime filter.

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
