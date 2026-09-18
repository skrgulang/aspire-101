-- Read response inbox rows only through an RPC scoped to requests owned by the current user.

create or replace function public.get_responses_for_my_requests(p_request_ids uuid[])
returns table(
  id uuid,
  request_id uuid,
  responder_id uuid,
  message text,
  status text,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    rr.id,
    rr.request_id,
    rr.responder_id,
    rr.message,
    rr.status,
    rr.created_at
  from public.request_responses rr
  join public.requests r on r.id = rr.request_id
  where auth.uid() is not null
    and coalesce(array_length(p_request_ids,1),0) between 1 and 200
    and rr.request_id = any(p_request_ids)
    and r.poster_id = auth.uid()
  order by rr.created_at asc;
$$;

revoke all on function public.get_responses_for_my_requests(uuid[]) from public, anon;
grant execute on function public.get_responses_for_my_requests(uuid[]) to authenticated, service_role;
