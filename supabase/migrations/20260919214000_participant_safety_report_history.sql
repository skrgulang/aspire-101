-- Participant-safe safety report history for Resolution Center.
-- Reporters can see only reports they personally submitted; reports made by
-- somebody else remain private unless/until the product exposes a reviewed outcome.

create or replace function public.get_my_safety_reports(p_limit integer default 100)
returns table(
  id uuid,
  target_user_id uuid,
  request_id uuid,
  connection_id uuid,
  reason text,
  details text,
  status text,
  created_at timestamptz,
  reviewed_at timestamptz
)
language sql
stable
security definer
set search_path = 'public'
as $function$
  select
    s.id,
    s.target_user_id,
    s.request_id,
    s.connection_id,
    s.reason,
    s.details,
    s.status,
    s.created_at,
    s.reviewed_at
  from public.safety_reports s
  where auth.uid() is not null
    and s.reporter_id = auth.uid()
  order by s.created_at desc
  limit greatest(1, least(coalesce(p_limit,100), 200));
$function$;

revoke all on function public.get_my_safety_reports(integer) from public, anon;
grant execute on function public.get_my_safety_reports(integer) to authenticated;
