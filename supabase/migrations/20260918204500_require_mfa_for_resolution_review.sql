create or replace function public.review_connection_resolution_case(
  p_case_id uuid,
  p_status text,
  p_note text default null
)
returns void
language plpgsql
security definer
set search_path to 'public', 'auth'
as $function$
declare
  v_case public.connection_resolution_cases;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if not public.is_moderator() then
    raise exception 'Moderator access required';
  end if;
  if p_status not in ('under_review','dismissed') then raise exception 'Invalid review action'; end if;

  select * into v_case from public.connection_resolution_cases where id = p_case_id for update;
  if not found then raise exception 'Case not found'; end if;
  if v_case.status not in ('submitted','under_review') then raise exception 'Case is already resolved'; end if;

  update public.connection_resolution_cases set
    status=p_status,
    resolution_note=nullif(left(btrim(coalesce(p_note,'')),2000),''),
    reviewed_by=auth.uid(),
    reviewed_at=case when p_status='dismissed' then now() else reviewed_at end,
    updated_at=now()
  where id=p_case_id;

  insert into public.connection_events(connection_id,actor_id,event_type,body,metadata)
  values (
    v_case.connection_id,auth.uid(),
    case when p_status='under_review' then 'issue_reviewing' else 'issue_resolved' end,
    case when p_status='under_review' then 'Aspire is reviewing the reported issue. Payment release remains paused.' else 'Aspire reviewed the issue and closed the case.' end,
    jsonb_build_object('case_id',p_case_id,'status',p_status)
  );
end;
$function$;
