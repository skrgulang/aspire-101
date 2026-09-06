create table if not exists public.fee_policies (
  id uuid primary key default gen_random_uuid(),
  version text not null unique,
  campus_id uuid references public.universities(id) on delete cascade,
  active boolean not null default false,
  requester_fee_bps integer not null default 0 check (requester_fee_bps between 0 and 5000),
  requester_fee_fixed_cents integer not null default 0 check (requester_fee_fixed_cents between 0 and 10000),
  requester_fee_min_cents integer not null default 0 check (requester_fee_min_cents between 0 and 10000),
  requester_fee_max_cents integer not null default 0 check (requester_fee_max_cents between 0 and 100000),
  provider_fee_bps integer not null default 0 check (provider_fee_bps between 0 and 5000),
  tip_fee_bps integer not null default 0 check (tip_fee_bps between 0 and 5000),
  minimum_paid_order_cents integer not null default 0 check (minimum_paid_order_cents between 0 and 100000),
  standard_payout_cadence text not null default 'weekly',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id)
);

alter table public.fee_policies enable row level security;

drop policy if exists fee_policies_read on public.fee_policies;
create policy fee_policies_read on public.fee_policies
  for select to authenticated
  using (active = true or public.is_admin());

drop policy if exists fee_policies_admin_write on public.fee_policies;
create policy fee_policies_admin_write on public.fee_policies
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

insert into public.fee_policies (
  version, active,
  requester_fee_bps, requester_fee_fixed_cents, requester_fee_min_cents, requester_fee_max_cents,
  provider_fee_bps, tip_fee_bps, minimum_paid_order_cents, standard_payout_cadence
)
values ('purdue_beta_v1', true, 600, 49, 99, 999, 800, 0, 1000, 'weekly')
on conflict (version) do update set
  active = excluded.active,
  requester_fee_bps = excluded.requester_fee_bps,
  requester_fee_fixed_cents = excluded.requester_fee_fixed_cents,
  requester_fee_min_cents = excluded.requester_fee_min_cents,
  requester_fee_max_cents = excluded.requester_fee_max_cents,
  provider_fee_bps = excluded.provider_fee_bps,
  tip_fee_bps = excluded.tip_fee_bps,
  minimum_paid_order_cents = excluded.minimum_paid_order_cents,
  standard_payout_cadence = excluded.standard_payout_cadence,
  updated_at = now();

alter table public.connection_payments
  add column if not exists base_amount_cents integer,
  add column if not exists requester_fee_cents integer,
  add column if not exists provider_fee_cents integer,
  add column if not exists tip_amount_cents integer not null default 0,
  add column if not exists tip_fee_cents integer not null default 0,
  add column if not exists customer_total_cents integer,
  add column if not exists provider_net_cents integer,
  add column if not exists fee_policy_version text,
  add column if not exists requester_fee_percent_bps integer,
  add column if not exists requester_fee_fixed_cents integer,
  add column if not exists requester_fee_min_cents integer,
  add column if not exists requester_fee_max_cents integer,
  add column if not exists provider_fee_percent_bps integer,
  add column if not exists tip_fee_percent_bps integer,
  add column if not exists minimum_paid_order_cents integer,
  add column if not exists fee_snapshot jsonb not null default '{}'::jsonb;

update public.connection_payments
set
  base_amount_cents = coalesce(base_amount_cents, gross_amount_cents),
  requester_fee_cents = coalesce(requester_fee_cents, 0),
  provider_fee_cents = coalesce(provider_fee_cents, platform_fee_cents),
  customer_total_cents = coalesce(customer_total_cents, gross_amount_cents),
  provider_net_cents = coalesce(provider_net_cents, provider_amount_cents),
  fee_policy_version = coalesce(fee_policy_version, 'legacy_v0')
where base_amount_cents is null
   or requester_fee_cents is null
   or provider_fee_cents is null
   or customer_total_cents is null
   or provider_net_cents is null
   or fee_policy_version is null;

create or replace function public.quote_aspire_fees(
  p_base_amount_cents integer,
  p_campus_id uuid default null,
  p_tip_amount_cents integer default 0
)
returns table (
  fee_policy_version text,
  base_amount_cents integer,
  requester_fee_cents integer,
  provider_fee_cents integer,
  tip_amount_cents integer,
  tip_fee_cents integer,
  customer_total_cents integer,
  provider_net_cents integer,
  platform_fee_revenue_cents integer,
  requester_fee_percent_bps integer,
  requester_fee_fixed_cents integer,
  requester_fee_min_cents integer,
  requester_fee_max_cents integer,
  provider_fee_percent_bps integer,
  tip_fee_percent_bps integer,
  minimum_paid_order_cents integer,
  standard_payout_cadence text
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  policy public.fee_policies%rowtype;
  requester_fee integer;
  provider_fee integer;
  tip_fee integer;
begin
  if p_base_amount_cents is null or p_base_amount_cents <= 0 then
    raise exception 'INVALID_BASE_AMOUNT';
  end if;
  if p_tip_amount_cents is null or p_tip_amount_cents < 0 then
    raise exception 'INVALID_TIP_AMOUNT';
  end if;

  select fp.* into policy
  from public.fee_policies fp
  where fp.active = true
    and (fp.campus_id = p_campus_id or fp.campus_id is null)
  order by (fp.campus_id is not null) desc, fp.updated_at desc
  limit 1;

  if policy.id is null then
    raise exception 'NO_ACTIVE_FEE_POLICY';
  end if;

  requester_fee := round((p_base_amount_cents::numeric * policy.requester_fee_bps) / 10000)::integer
                   + policy.requester_fee_fixed_cents;
  requester_fee := greatest(policy.requester_fee_min_cents, requester_fee);
  if policy.requester_fee_max_cents > 0 then
    requester_fee := least(policy.requester_fee_max_cents, requester_fee);
  end if;

  provider_fee := round((p_base_amount_cents::numeric * policy.provider_fee_bps) / 10000)::integer;
  tip_fee := round((p_tip_amount_cents::numeric * policy.tip_fee_bps) / 10000)::integer;

  return query select
    policy.version,
    p_base_amount_cents,
    requester_fee,
    provider_fee,
    p_tip_amount_cents,
    tip_fee,
    p_base_amount_cents + requester_fee + p_tip_amount_cents,
    p_base_amount_cents - provider_fee + p_tip_amount_cents - tip_fee,
    requester_fee + provider_fee + tip_fee,
    policy.requester_fee_bps,
    policy.requester_fee_fixed_cents,
    policy.requester_fee_min_cents,
    policy.requester_fee_max_cents,
    policy.provider_fee_bps,
    policy.tip_fee_bps,
    policy.minimum_paid_order_cents,
    policy.standard_payout_cadence;
end;
$$;

revoke all on function public.quote_aspire_fees(integer, uuid, integer) from public;
grant execute on function public.quote_aspire_fees(integer, uuid, integer) to authenticated;
grant execute on function public.quote_aspire_fees(integer, uuid, integer) to service_role;
