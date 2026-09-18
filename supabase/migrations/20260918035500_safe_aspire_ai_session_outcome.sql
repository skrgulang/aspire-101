-- Add a narrow outcome-feedback RPC before retiring direct browser access to aspire_ai_sessions.

create or replace function public.mark_my_aspire_ai_session_outcome(
  p_session_id uuid,
  p_outcome text
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'AUTH_REQUIRED';
  end if;

  if p_outcome not in ('planned','opened_match','drafted_post','posted','connected','completed','dismissed') then
    raise exception 'INVALID_OUTCOME';
  end if;

  update public.aspire_ai_sessions
  set outcome = p_outcome,
      updated_at = now()
  where id = p_session_id
    and user_id = auth.uid();

  return found;
end;
$$;

revoke all on function public.mark_my_aspire_ai_session_outcome(uuid,text) from public, anon;
grant execute on function public.mark_my_aspire_ai_session_outcome(uuid,text) to authenticated, service_role;
