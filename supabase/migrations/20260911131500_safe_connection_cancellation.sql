-- Production-safe cancellation without bringing the broader Aspire Live / Resolution Center stack.
-- Keeps the existing cancel_connection(uuid) client contract, but records the cancellation,
-- protects secured money from accidental payout, and blocks cancellation during unsettled checkout.

create table if not exists public.connection_cancellations (
  id bigserial primary key,
  connection_id uuid not null unique references public.connections(id) on delete cascade,
  cancelled_by uuid not null references auth.users(id) on delete cascade,
  note text,
  payment_status_snapshot text,
  created_at timestamptz not null default now()
);

alter table public.connection_cancellations enable row level security;

drop policy if exists "participants can read connection cancellations" on public.connection_cancellations;
create policy "participants can read connection cancellations"
on public.connection_cancellations
for select
to authenticated
using (
  exists (
    select 1
    from public.connections c
    where c.id = connection_cancellations.connection_id
      and auth.uid() in (c.requester_id, c.responder_id)
  )
);

revoke all on table public.connection_cancellations from anon;
grant select on table public.connection_cancellations to authenticated;

create or replace function public.cancel_connection(p_connection_id uuid)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_connection public.connections;
  v_payment public.connection_payments;
  v_has_payment boolean := false;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  select * into v_connection
  from public.connections
  where id = p_connection_id
  for update;

  if not found then
    raise exception 'Connection not found';
  end if;

  if auth.uid() <> v_connection.requester_id and auth.uid() <> v_connection.responder_id then
    raise exception 'Not authorized';
  end if;

  if v_connection.status in ('completed', 'cancelled') then
    raise exception 'This connection is already closed';
  end if;

  select * into v_payment
  from public.connection_payments
  where connection_id = p_connection_id
  limit 1;
  v_has_payment := found;

  -- Never race an unfinished checkout. The user can retry cancellation once Stripe settles.
  if v_has_payment and v_payment.status in ('processing', 'checkout_created') then
    raise exception 'PAYMENT_STILL_PROCESSING';
  end if;

  -- Released/disputed money requires support review rather than mutating the connection state.
  if v_has_payment and v_payment.status in ('released', 'disputed') then
    raise exception 'PAYMENT_NEEDS_SUPPORT_REVIEW';
  end if;

  insert into public.connection_cancellations(
    connection_id,
    cancelled_by,
    payment_status_snapshot
  ) values (
    p_connection_id,
    auth.uid(),
    case when v_has_payment then v_payment.status else null end
  )
  on conflict (connection_id) do nothing;

  update public.connections
  set status = 'cancelled', updated_at = now()
  where id = p_connection_id;

  update public.requests
  set status = 'cancelled', updated_at = now()
  where id = v_connection.request_id;
end;
$$;

revoke all on function public.cancel_connection(uuid) from public, anon;
grant execute on function public.cancel_connection(uuid) to authenticated;
