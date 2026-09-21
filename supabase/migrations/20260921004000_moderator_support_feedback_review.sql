create or replace function public.moderator_review_support_feedback(
  p_feedback_id uuid,
  p_action text,
  p_reason text default null
)
returns public.support_feedback
language plpgsql
security definer
set search_path = public
as $$
declare
  v_action text := lower(btrim(coalesce(p_action, '')));
  v_row public.support_feedback;
begin
  if auth.uid() is null or not (public.is_moderator() or public.is_admin()) then
    raise exception 'MODERATOR_REQUIRED';
  end if;

  if v_action not in ('publish','archive','reopen') then
    raise exception 'INVALID_SUPPORT_ACTION';
  end if;

  update public.support_feedback
  set
    approved = case
      when v_action = 'publish' then true
      when v_action in ('archive','reopen') then false
      else approved
    end,
    archived = case
      when v_action = 'archive' then true
      when v_action in ('publish','reopen') then false
      else archived
    end,
    reason = nullif(btrim(coalesce(p_reason, '')), ''),
    moderated_at = now(),
    moderated_by = auth.uid()
  where id = p_feedback_id
  returning * into v_row;

  if v_row.id is null then
    raise exception 'SUPPORT_FEEDBACK_NOT_FOUND';
  end if;

  return v_row;
end;
$$;

revoke all on function public.moderator_review_support_feedback(uuid,text,text) from public, anon;
grant execute on function public.moderator_review_support_feedback(uuid,text,text) to authenticated;
