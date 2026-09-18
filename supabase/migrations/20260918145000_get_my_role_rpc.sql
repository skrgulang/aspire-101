-- Expose only the current user's effective Aspire role to the browser.
-- Server/service-role code can continue reading user_roles directly.

create or replace function public.get_my_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((
    select r.role
    from public.user_roles r
    where r.user_id = auth.uid()
  ), 'member'::text);
$$;

revoke all on function public.get_my_role() from public, anon;
grant execute on function public.get_my_role() to authenticated, service_role;
