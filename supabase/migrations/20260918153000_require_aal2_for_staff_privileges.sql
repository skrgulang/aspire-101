-- Require AAL2 for staff privileges when invoked from an end-user session.
-- Service-role callers retain trusted server behavior.

create or replace function public.is_admin(uid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.user_roles r
    where r.user_id = uid
      and r.role = 'admin'
  )
  and (
    coalesce(auth.jwt()->>'role', '') = 'service_role'
    or (
      uid = auth.uid()
      and coalesce(auth.jwt()->>'aal', 'aal1') = 'aal2'
    )
  );
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_admin(auth.uid());
$$;

create or replace function public.is_moderator(uid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.user_roles r
    where r.user_id = uid
      and r.role in ('moderator','admin')
  )
  and (
    coalesce(auth.jwt()->>'role', '') = 'service_role'
    or (
      uid = auth.uid()
      and coalesce(auth.jwt()->>'aal', 'aal1') = 'aal2'
    )
  );
$$;

create or replace function public.is_moderator()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_moderator(auth.uid());
$$;

create or replace function public.get_my_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select case
    when coalesce(r.role, 'member') in ('moderator','admin')
      and coalesce(auth.jwt()->>'aal', 'aal1') <> 'aal2'
      then 'member'
    else coalesce(r.role, 'member')
  end
  from (select auth.uid() as user_id) me
  left join public.user_roles r on r.user_id = me.user_id;
$$;
