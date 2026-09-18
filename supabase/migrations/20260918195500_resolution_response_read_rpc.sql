-- Narrow resolution-response reads to participant/moderator rows through an explicit RPC.

create or replace function public.get_my_resolution_responses(p_case_ids uuid[])
returns table(
  id uuid,
  case_id uuid,
  connection_id uuid,
  author_id uuid,
  body text,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    r.id,
    r.case_id,
    r.connection_id,
    r.author_id,
    r.body,
    r.created_at
  from public.connection_resolution_responses r
  join public.connections c on c.id = r.connection_id
  where auth.uid() is not null
    and coalesce(array_length(p_case_ids, 1), 0) between 1 and 200
    and r.case_id = any(p_case_ids)
    and (
      auth.uid() = c.requester_id
      or auth.uid() = c.responder_id
      or public.is_moderator()
    )
  order by r.created_at asc;
$$;

revoke all on function public.get_my_resolution_responses(uuid[]) from public, anon;
grant execute on function public.get_my_resolution_responses(uuid[]) to authenticated, service_role;
