create or replace function public.admin_activity_metrics(p_days integer default 30)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_days integer := greatest(7, least(coalesce(p_days, 30), 90));
  v_today date := (now() at time zone 'utc')::date;
  v_result jsonb;
begin
  if not public.is_admin() then
    raise exception 'ADMIN_REQUIRED';
  end if;

  select jsonb_build_object(
    'generatedAt', now(),
    'timezone', 'UTC',
    'todayDau', (select count(*) from public.user_daily_activity a where a.activity_date = v_today),
    'yesterdayDau', (select count(*) from public.user_daily_activity a where a.activity_date = v_today - 1),
    'wau', (select count(distinct a.user_id) from public.user_daily_activity a where a.activity_date between v_today - 6 and v_today),
    'mau', (select count(distinct a.user_id) from public.user_daily_activity a where a.activity_date between v_today - 29 and v_today),
    'newUsersToday', (select count(*) from auth.users u where (u.created_at at time zone 'utc')::date = v_today),
    'totalUsers', (select count(*) from auth.users),
    'verifiedStudents', (select count(*) from public.school_verifications sv where sv.status = 'verified'),
    'postsToday', (select count(*) from public.requests r where (r.created_at at time zone 'utc')::date = v_today),
    'responsesToday', (select count(*) from public.request_responses rr where (rr.created_at at time zone 'utc')::date = v_today),
    'connectionsToday', (select count(*) from public.connections c where (c.created_at at time zone 'utc')::date = v_today),
    'paymentsToday', (select count(*) from public.connection_payments cp where cp.paid_at is not null and (cp.paid_at at time zone 'utc')::date = v_today),
    'successfulTransactionsToday', (
      select count(*) from public.connection_payments cp
      where cp.paid_at is not null
        and (cp.paid_at at time zone 'utc')::date = v_today
        and cp.status in ('secured','released')
    ),
    'processedVolumeCentsToday', coalesce((
      select sum(cp.customer_total_cents) from public.connection_payments cp
      where cp.paid_at is not null and (cp.paid_at at time zone 'utc')::date = v_today
    ), 0),
    'gmvCentsToday', coalesce((
      select sum(cp.base_amount_cents) from public.connection_payments cp
      where cp.paid_at is not null
        and (cp.paid_at at time zone 'utc')::date = v_today
        and cp.status in ('secured','released')
    ), 0),
    'platformFeeRevenueCentsToday', coalesce((
      select sum(cp.platform_fee_cents) from public.connection_payments cp
      where cp.paid_at is not null
        and (cp.paid_at at time zone 'utc')::date = v_today
        and cp.status in ('secured','released')
    ), 0),
    'takeRateBpsToday', coalesce((
      select case
        when sum(cp.base_amount_cents) > 0
          then round((sum(cp.platform_fee_cents)::numeric / sum(cp.base_amount_cents)::numeric) * 10000)::integer
        else 0
      end
      from public.connection_payments cp
      where cp.paid_at is not null
        and (cp.paid_at at time zone 'utc')::date = v_today
        and cp.status in ('secured','released')
    ), 0),
    'payoutsReleasedToday', (select count(*) from public.connection_payments cp where cp.released_at is not null and (cp.released_at at time zone 'utc')::date = v_today),
    'daily', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'date', d.day,
        'dau', (select count(*) from public.user_daily_activity a where a.activity_date = d.day),
        'signups', (select count(*) from auth.users u where (u.created_at at time zone 'utc')::date = d.day),
        'posts', (select count(*) from public.requests r where (r.created_at at time zone 'utc')::date = d.day),
        'responses', (select count(*) from public.request_responses rr where (rr.created_at at time zone 'utc')::date = d.day),
        'connections', (select count(*) from public.connections c where (c.created_at at time zone 'utc')::date = d.day),
        'payments', (select count(*) from public.connection_payments cp where cp.paid_at is not null and (cp.paid_at at time zone 'utc')::date = d.day),
        'processedVolumeCents', coalesce((select sum(cp.customer_total_cents) from public.connection_payments cp where cp.paid_at is not null and (cp.paid_at at time zone 'utc')::date = d.day), 0)
      ) order by d.day), '[]'::jsonb)
      from generate_series(v_today - (v_days - 1), v_today, interval '1 day') as d(day)
    ),
    'campusesToday', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'campusId', ranked.campus_id,
        'campus', ranked.campus_name,
        'shortName', ranked.short_name,
        'dau', ranked.dau
      ) order by ranked.dau desc, ranked.campus_name), '[]'::jsonb)
      from (
        select p.home_campus_id as campus_id,
               coalesce(u.name, p.school, 'Unknown campus') as campus_name,
               coalesce(u.short_name, p.school, 'Unknown') as short_name,
               count(*) as dau
        from public.user_daily_activity a
        join public.profiles p on p.id = a.user_id
        left join public.universities u on u.id = p.home_campus_id
        where a.activity_date = v_today
        group by p.home_campus_id, u.name, u.short_name, p.school
        order by count(*) desc
        limit 12
      ) ranked
    )
  ) into v_result;

  return v_result;
end;
$$;

revoke all on function public.admin_activity_metrics(integer) from public;
grant execute on function public.admin_activity_metrics(integer) to authenticated;
grant execute on function public.admin_activity_metrics(integer) to service_role;
