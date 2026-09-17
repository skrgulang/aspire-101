create or replace function public.moderator_fetch_resolution_cases(p_limit integer default 100)
returns setof public.connection_resolution_cases
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null or not public.is_moderator() then
    raise exception 'MODERATOR_REQUIRED';
  end if;

  return query
  select c.*
  from public.connection_resolution_cases c
  order by c.created_at desc
  limit greatest(1, least(coalesce(p_limit, 100), 200));
end;
$$;

revoke execute on function public.moderator_fetch_resolution_cases(integer) from public, anon;
grant execute on function public.moderator_fetch_resolution_cases(integer) to authenticated, service_role;
