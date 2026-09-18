-- Close direct support-feedback reads and correct safe RPC execute grants.

revoke all on function public.get_public_support_feedback(integer) from public, anon, authenticated;
revoke all on function public.get_my_support_feedback(integer) from public, anon, authenticated;
revoke all on function public.moderator_fetch_support_feedback(integer) from public, anon, authenticated;

grant execute on function public.get_public_support_feedback(integer) to anon, authenticated, service_role;
grant execute on function public.get_my_support_feedback(integer) to authenticated, service_role;
grant execute on function public.moderator_fetch_support_feedback(integer) to authenticated, service_role;

revoke select on table public.support_feedback from anon, authenticated;
