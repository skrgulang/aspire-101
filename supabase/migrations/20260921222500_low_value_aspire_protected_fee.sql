-- Low-value Aspire Protected pricing.
-- Orders below $10 use a flat $0.50 buyer protection fee and remain eligible
-- for Pay with Aspire. Orders at/above $10 retain the existing percentage
-- pricing. Seller/provider fee remains unchanged.

update public.fee_policies
set active = false,
    updated_at = now()
where active = true;

insert into public.fee_policies (
  version,
  campus_id,
  active,
  requester_fee_bps,
  requester_fee_fixed_cents,
  requester_fee_min_cents,
  requester_fee_max_cents,
  provider_fee_bps,
  tip_fee_bps,
  minimum_paid_order_cents,
  standard_payout_cadence
) values (
  'purdue_beta_v2_low_value',
  null,
  true,
  600,
  49,
  99,
  999,
  800,
  0,
  1,
  'weekly'
);

create or replace function public.quote_aspire_fees(
  p_base_amount_cents integer,
  p_campus_id uuid default null,
  p_tip_amount_cents integer default 0
)
returns table(
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

  if p_base_amount_cents < 1000 then
    requester_fee := 50;
  else
    requester_fee := round((p_base_amount_cents::numeric * policy.requester_fee_bps) / 10000)::integer
                     + policy.requester_fee_fixed_cents;
    requester_fee := greatest(policy.requester_fee_min_cents, requester_fee);
    if policy.requester_fee_max_cents > 0 then
      requester_fee := least(policy.requester_fee_max_cents, requester_fee);
    end if;
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

revoke all on function public.quote_aspire_fees(integer,uuid,integer) from public, anon;
grant execute on function public.quote_aspire_fees(integer,uuid,integer) to authenticated;
grant execute on function public.quote_aspire_fees(integer,uuid,integer) to service_role;
