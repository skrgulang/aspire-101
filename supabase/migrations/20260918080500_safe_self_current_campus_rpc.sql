-- Preserve campus-context persistence without reopening generic browser UPDATE on profiles.
-- NULL means "use my verified home campus"; non-NULL values must be active Aspire campuses.

create or replace function public.set_my_current_campus(p_campus_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
  if p_campus_id is not null and not exists (
    select 1 from public.universities u where u.id=p_campus_id and u.active=true
  ) then raise exception 'UNSUPPORTED_CAMPUS'; end if;

  update public.profiles
  set current_campus_id=p_campus_id,
      campus_last_selected_at=now(),
      updated_at=now()
  where id=auth.uid();

  if not found then raise exception 'PROFILE_NOT_FOUND'; end if;
end;
$$;

revoke all on function public.set_my_current_campus(uuid) from PUBLIC, anon;
grant execute on function public.set_my_current_campus(uuid) to authenticated, service_role;
