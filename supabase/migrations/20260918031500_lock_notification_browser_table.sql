-- Retire direct browser reads of notification rows after the safe feed reached production.

revoke select (
  id,
  user_id,
  kind,
  connection_id,
  title,
  body,
  read_at,
  created_at
) on table public.notifications from authenticated;

revoke all on function public.get_my_notifications(integer) from public, anon;
grant execute on function public.get_my_notifications(integer) to authenticated, service_role;
