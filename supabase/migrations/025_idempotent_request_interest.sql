-- Make the user-facing "I'm interested" action safe to retry.
-- The unique (request_id, responder_id) constraint remains the source of truth,
-- while this RPC converts repeated clicks/races into the same existing response.

create or replace function public.respond_to_request_idempotent(p_request_id uuid, p_message text default null)
returns public.request_responses
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_response public.request_responses;
begin
  if auth.uid() is null then
    raise exception 'AUTH_REQUIRED';
  end if;

  select * into v_response
  from public.request_responses
  where request_id = p_request_id
    and responder_id = auth.uid()
  limit 1;

  if found then
    return v_response;
  end if;

  insert into public.request_responses(request_id, responder_id, message)
  values (p_request_id, auth.uid(), nullif(btrim(coalesce(p_message, '')), ''))
  on conflict (request_id, responder_id) do nothing
  returning * into v_response;

  if v_response.id is null then
    select * into v_response
    from public.request_responses
    where request_id = p_request_id
      and responder_id = auth.uid()
    limit 1;
  end if;

  return v_response;
end;
$$;

revoke all on function public.respond_to_request_idempotent(uuid,text) from public;
revoke all on function public.respond_to_request_idempotent(uuid,text) from anon;
grant execute on function public.respond_to_request_idempotent(uuid,text) to authenticated;
