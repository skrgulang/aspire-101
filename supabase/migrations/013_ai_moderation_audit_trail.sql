-- Preserve AI context when a human moderator approves or rejects a post.
-- Also fixes the moderation_actions action constraint so request approval events can be recorded.

alter table public.moderation_actions drop constraint if exists moderation_actions_action_check;
alter table public.moderation_actions add constraint moderation_actions_action_check
  check (action in (
    'verify_school_id','reject_school_id','resolve_report','dismiss_report','remove_request',
    'grant_moderator','revoke_moderator','approve_request','reject_request','approve_request_ai_override'
  ));

create or replace function public.moderator_review_request(p_request_id uuid, p_decision text, p_note text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_target uuid;
  v_status text;
  v_ai_level text;
  v_ai_score integer;
  v_ai_action text;
  v_action text;
  v_audit text;
  v_note text;
begin
  if not public.is_moderator() then raise exception 'Moderator access required.'; end if;
  if p_decision not in ('approved','rejected') then raise exception 'Invalid moderation decision.'; end if;

  select poster_id, moderation_status, ai_risk_level, ai_risk_score, ai_recommended_action
  into v_target, v_status, v_ai_level, v_ai_score, v_ai_action
  from public.requests where id=p_request_id for update;
  if not found then raise exception 'Request not found.'; end if;

  v_audit := format('AI risk=%s; score=%s; recommendation=%s',
    coalesce(v_ai_level,'unknown'), coalesce(v_ai_score::text,'n/a'), coalesce(v_ai_action,'review'));
  v_note := concat_ws(' · ', nullif(trim(coalesce(p_note,'')),''), v_audit);

  if p_decision='approved' and (v_ai_level in ('high','critical') or v_ai_action='block') then
    v_action := 'approve_request_ai_override';
  elsif p_decision='approved' then
    v_action := 'approve_request';
  else
    v_action := 'reject_request';
  end if;

  update public.requests
  set moderation_status=p_decision,
      moderated_by=auth.uid(),
      moderated_at=now(),
      moderation_reason=nullif(trim(coalesce(p_note,'')),''),
      updated_at=now()
  where id=p_request_id;

  insert into public.moderation_actions(moderator_id, action, target_user_id, request_id, note)
  values (auth.uid(), v_action, v_target, p_request_id, v_note);
end;
$$;

revoke all on function public.moderator_review_request(uuid,text,text) from public;
grant execute on function public.moderator_review_request(uuid,text,text) to authenticated;
