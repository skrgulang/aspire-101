-- Keep cancellation state synchronized for both participants and complete the safety-report review loop.
-- The protected cancellation RPC owns its payment-aware notification; generic status updates remain covered.

create or replace function public.notify_connection_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare v_title text; v_actor uuid; v_other uuid;
begin
  select title into v_title from public.requests where id=new.request_id;
  v_actor := auth.uid();
  if tg_op='INSERT' then
    perform public.push_notification(new.responder_id,'connection_chosen','connection-chosen:'||new.id::text,'You were chosen for a request',
      coalesce('Confirm “'||v_title||'” to open private chat.','Confirm the connection to open private chat.'),
      new.requester_id,new.request_id,null,new.id,null);
    return new;
  end if;
  if old.status is distinct from new.status then
    if new.status in ('confirmed','active') and old.status not in ('confirmed','active') then
      perform public.push_notification(new.requester_id,'connection_confirmed','connection-confirmed:'||new.id::text,'Your connection is confirmed',
        coalesce('Private chat is open for “'||v_title||'”.','Private chat is now open.'),new.responder_id,new.request_id,null,new.id,null);
    elsif new.status='completed' and old.status<>'completed' then
      perform public.push_notification(new.requester_id,'connection_completed','connection-completed:'||new.id::text||':'||new.requester_id::text,'Connection completed',
        'You can now leave a trust review and choose whether to keep in touch.',v_actor,new.request_id,null,new.id,null);
      perform public.push_notification(new.responder_id,'connection_completed','connection-completed:'||new.id::text||':'||new.responder_id::text,'Connection completed',
        'You can now leave a trust review and choose whether to keep in touch.',v_actor,new.request_id,null,new.id,null);
    elsif new.status='cancelled' and old.status<>'cancelled' then
      if exists (select 1 from public.connection_cancellations cc where cc.connection_id=new.id) then
        return new;
      end if;
      if v_actor=new.requester_id then v_other:=new.responder_id;
      elsif v_actor=new.responder_id then v_other:=new.requester_id;
      else v_other:=new.requester_id; end if;
      perform public.push_notification(v_other,'connection_cancelled','connection-cancelled:'||new.id::text||':'||v_other::text,'A connection was cancelled',
        coalesce('The connection for “'||v_title||'” is no longer active.','This connection is no longer active.'),v_actor,new.request_id,null,new.id,null);
    end if;
  end if;
  return new;
end;
$$;

create or replace function public.moderator_review_safety_report(
  p_report_id uuid,
  p_status text,
  p_note text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_report public.safety_reports;
  v_title text;
  v_body text;
begin
  if not public.is_moderator() then raise exception 'Moderator access required.'; end if;
  if p_status not in ('reviewing','resolved','dismissed') then raise exception 'Invalid report status.'; end if;

  select * into v_report
  from public.safety_reports
  where id=p_report_id
  for update;
  if not found then raise exception 'Report not found.'; end if;

  if v_report.status in ('resolved','dismissed') and v_report.status <> p_status then
    raise exception 'This report is already closed.';
  end if;
  if v_report.status = p_status then return; end if;

  update public.safety_reports
  set status=p_status,
      reviewed_at=case when p_status in ('resolved','dismissed') then now() else reviewed_at end,
      reviewed_by=auth.uid()
  where id=p_report_id;

  if p_status in ('resolved','dismissed') then
    insert into public.moderation_actions(moderator_id, action, target_user_id, report_id, note)
    values (
      auth.uid(),
      case when p_status='resolved' then 'resolve_report' else 'dismiss_report' end,
      v_report.target_user_id,
      p_report_id,
      nullif(left(btrim(coalesce(p_note,'')),2000),'')
    );
  end if;

  v_title := case p_status
    when 'reviewing' then 'Aspire is reviewing your safety report'
    when 'resolved' then 'Your safety report was reviewed'
    else 'Your safety report was closed'
  end;
  v_body := case p_status
    when 'reviewing' then 'Trust & Safety has started reviewing the platform records and context connected to your report.'
    when 'resolved' then 'Trust & Safety completed its review and handled the report under Aspire policies. Account-specific actions remain private.'
    else 'Trust & Safety reviewed the available information and closed this report. You may submit a new report if you have important new information.'
  end;

  perform public.push_notification(
    v_report.reporter_id,
    'post_review',
    'safety-report-status:'||p_report_id::text||':'||p_status,
    v_title,
    v_body,
    auth.uid(),
    v_report.request_id,
    null,
    v_report.connection_id,
    null
  );
end;
$$;

revoke all on function public.moderator_review_safety_report(uuid,text,text) from public, anon;
grant execute on function public.moderator_review_safety_report(uuid,text,text) to authenticated;
