-- Keep pending schedule proposal reads participant-scoped behind an RPC so direct table SELECT can be removed later.

create or replace function public.get_pending_schedule_proposals_for_my_connections(p_connection_ids uuid[])
returns table(
  id uuid,
  connection_id uuid,
  proposed_by uuid,
  start_at timestamptz,
  end_at timestamptz,
  timezone text,
  meeting_label text,
  status text,
  responded_by uuid,
  responded_at timestamptz,
  created_at timestamptz,
  updated_at timestamptz
)
language sql
stable
security definer
set search_path = 'public'
as $function$
  select
    s.id,
    s.connection_id,
    s.proposed_by,
    s.start_at,
    s.end_at,
    s.timezone,
    s.meeting_label,
    s.status,
    s.responded_by,
    s.responded_at,
    s.created_at,
    s.updated_at
  from public.connection_schedule_proposals s
  join public.connections c on c.id = s.connection_id
  where auth.uid() is not null
    and coalesce(array_length(p_connection_ids,1),0) between 1 and 200
    and s.connection_id = any(p_connection_ids)
    and (auth.uid() = c.requester_id or auth.uid() = c.responder_id)
    and s.status = 'pending'
  order by s.created_at desc;
$function$;

revoke execute on function public.get_pending_schedule_proposals_for_my_connections(uuid[]) from public, anon;
grant execute on function public.get_pending_schedule_proposals_for_my_connections(uuid[]) to authenticated;
