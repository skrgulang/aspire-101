-- Move participant payment and resolution reads behind narrow SECURITY DEFINER RPCs.
-- Each RPC authenticates the caller and verifies connection participation.

create or replace function public.get_connection_payments_for_my_connections(p_connection_ids uuid[])
returns table(
  id uuid,
  connection_id uuid,
  request_id uuid,
  payer_id uuid,
  payee_id uuid,
  currency text,
  gross_amount_cents integer,
  platform_fee_cents integer,
  provider_amount_cents integer,
  base_amount_cents integer,
  requester_fee_cents integer,
  provider_fee_cents integer,
  tip_amount_cents integer,
  tip_fee_cents integer,
  customer_total_cents integer,
  provider_net_cents integer,
  fee_policy_version text,
  status text,
  paid_at timestamptz,
  released_at timestamptz,
  refunded_at timestamptz,
  disputed_at timestamptz,
  created_at timestamptz,
  updated_at timestamptz
)
language sql
stable
security definer
set search_path = 'public'
as $function$
  select
    p.id, p.connection_id, p.request_id, p.payer_id, p.payee_id, p.currency,
    p.gross_amount_cents, p.platform_fee_cents, p.provider_amount_cents,
    p.base_amount_cents, p.requester_fee_cents, p.provider_fee_cents,
    p.tip_amount_cents, p.tip_fee_cents, p.customer_total_cents,
    p.provider_net_cents, p.fee_policy_version, p.status, p.paid_at,
    p.released_at, p.refunded_at, p.disputed_at, p.created_at, p.updated_at
  from public.connection_payments p
  join public.connections c on c.id = p.connection_id
  where auth.uid() is not null
    and coalesce(array_length(p_connection_ids,1),0) between 1 and 200
    and p.connection_id = any(p_connection_ids)
    and (auth.uid() = c.requester_id or auth.uid() = c.responder_id);
$function$;

revoke all on function public.get_connection_payments_for_my_connections(uuid[]) from public, anon;
grant execute on function public.get_connection_payments_for_my_connections(uuid[]) to authenticated;

create or replace function public.get_resolution_cases_for_my_connections(p_connection_ids uuid[])
returns table(
  id uuid,
  connection_id uuid,
  request_id uuid,
  opened_by uuid,
  against_user_id uuid,
  reason text,
  requested_resolution text,
  details text,
  status text,
  payment_status_snapshot text,
  payment_total_cents_snapshot integer,
  currency_snapshot text,
  scheduled_start_snapshot timestamptz,
  meeting_label_snapshot text,
  coordination_status_snapshot text,
  resolution_note text,
  refund_cents integer,
  provider_release_cents integer,
  reviewed_at timestamptz,
  created_at timestamptz,
  updated_at timestamptz
)
language sql
stable
security definer
set search_path = 'public'
as $function$
  select
    r.id, r.connection_id, r.request_id, r.opened_by, r.against_user_id,
    r.reason, r.requested_resolution, r.details, r.status,
    r.payment_status_snapshot, r.payment_total_cents_snapshot, r.currency_snapshot,
    r.scheduled_start_snapshot, r.meeting_label_snapshot, r.coordination_status_snapshot,
    r.resolution_note, r.refund_cents, r.provider_release_cents, r.reviewed_at,
    r.created_at, r.updated_at
  from public.connection_resolution_cases r
  join public.connections c on c.id = r.connection_id
  where auth.uid() is not null
    and coalesce(array_length(p_connection_ids,1),0) between 1 and 200
    and r.connection_id = any(p_connection_ids)
    and (auth.uid() = c.requester_id or auth.uid() = c.responder_id)
  order by r.created_at desc;
$function$;

revoke all on function public.get_resolution_cases_for_my_connections(uuid[]) from public, anon;
grant execute on function public.get_resolution_cases_for_my_connections(uuid[]) to authenticated;

create or replace function public.get_my_resolution_cases(p_limit integer default 100)
returns table(
  id uuid,
  connection_id uuid,
  request_id uuid,
  opened_by uuid,
  against_user_id uuid,
  reason text,
  requested_resolution text,
  details text,
  status text,
  payment_status_snapshot text,
  payment_total_cents_snapshot integer,
  currency_snapshot text,
  scheduled_start_snapshot timestamptz,
  meeting_label_snapshot text,
  coordination_status_snapshot text,
  resolution_note text,
  refund_cents integer,
  provider_release_cents integer,
  reviewed_at timestamptz,
  created_at timestamptz,
  updated_at timestamptz
)
language sql
stable
security definer
set search_path = 'public'
as $function$
  select
    r.id, r.connection_id, r.request_id, r.opened_by, r.against_user_id,
    r.reason, r.requested_resolution, r.details, r.status,
    r.payment_status_snapshot, r.payment_total_cents_snapshot, r.currency_snapshot,
    r.scheduled_start_snapshot, r.meeting_label_snapshot, r.coordination_status_snapshot,
    r.resolution_note, r.refund_cents, r.provider_release_cents, r.reviewed_at,
    r.created_at, r.updated_at
  from public.connection_resolution_cases r
  join public.connections c on c.id = r.connection_id
  where auth.uid() is not null
    and (auth.uid() = c.requester_id or auth.uid() = c.responder_id)
  order by r.created_at desc
  limit greatest(1, least(coalesce(p_limit,100), 200));
$function$;

revoke all on function public.get_my_resolution_cases(integer) from public, anon;
grant execute on function public.get_my_resolution_cases(integer) to authenticated;
