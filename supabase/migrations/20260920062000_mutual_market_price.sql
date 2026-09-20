-- Mutual marketplace price proposals with a hard checkout price lock.
-- A price changes only after the other participant accepts it, and never after checkout begins.

alter table public.market_orders
  add column if not exists price_locked_at timestamptz;

create table if not exists public.market_price_proposals (
  id uuid primary key default gen_random_uuid(),
  market_order_id uuid not null references public.market_orders(id) on delete cascade,
  connection_id uuid not null references public.connections(id) on delete cascade,
  proposed_by uuid not null references auth.users(id) on delete cascade,
  amount_cents integer not null check (amount_cents between 1 and 100000000),
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  status text not null default 'pending' check (status in ('pending','accepted','declined','superseded')),
  responded_by uuid references auth.users(id) on delete set null,
  responded_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists market_price_one_pending_idx
  on public.market_price_proposals(market_order_id)
  where status = 'pending';
create index if not exists market_price_connection_idx
  on public.market_price_proposals(connection_id, created_at desc);

alter table public.market_price_proposals enable row level security;
revoke all on table public.market_price_proposals from public, anon, authenticated;
grant select on table public.market_price_proposals to authenticated;

drop policy if exists "participants read market price proposals" on public.market_price_proposals;
create policy "participants read market price proposals"
on public.market_price_proposals
for select
to authenticated
using (
  exists (
    select 1
    from public.market_orders mo
    where mo.id = market_price_proposals.market_order_id
      and (select auth.uid()) in (mo.buyer_id, mo.seller_id)
  )
);

create or replace function public.propose_market_price(
  p_market_order_id uuid,
  p_amount_cents integer
)
returns uuid
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_order public.market_orders;
  v_connection public.connections;
  v_payment_status text;
  v_other uuid;
  v_proposal_id uuid;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if p_amount_cents is null or p_amount_cents < 1 or p_amount_cents > 100000000 then
    raise exception 'Enter a valid price';
  end if;

  select * into v_order
  from public.market_orders
  where id = p_market_order_id
  for update;

  if not found then raise exception 'Marketplace order not found'; end if;
  if auth.uid() <> v_order.buyer_id and auth.uid() <> v_order.seller_id then raise exception 'Not authorized'; end if;
  if v_order.status not in ('awaiting_payment','off_platform') then raise exception 'PRICE_LOCKED_ORDER_STARTED'; end if;
  if v_order.price_locked_at is not null then raise exception 'PRICE_LOCKED_CHECKOUT_STARTED'; end if;
  if p_amount_cents = v_order.agreed_amount_cents then raise exception 'Choose a different price'; end if;

  select * into v_connection
  from public.connections
  where id = v_order.connection_id
  for update;

  if not found then raise exception 'Connection not found'; end if;
  if v_connection.status not in ('confirmed','active') then raise exception 'Connection is not active'; end if;

  select cp.status into v_payment_status
  from public.connection_payments cp
  where cp.connection_id = v_order.connection_id
  for update;

  if v_payment_status is not null and v_payment_status <> 'not_started' then
    raise exception 'PRICE_LOCKED_PAYMENT_STARTED';
  end if;

  v_other := case when auth.uid() = v_order.buyer_id then v_order.seller_id else v_order.buyer_id end;

  update public.market_price_proposals
  set status = 'superseded', responded_at = now(), updated_at = now()
  where market_order_id = v_order.id and status = 'pending';

  insert into public.market_price_proposals(
    market_order_id, connection_id, proposed_by, amount_cents, currency
  ) values (
    v_order.id, v_order.connection_id, auth.uid(), p_amount_cents, upper(v_order.currency)
  )
  returning id into v_proposal_id;

  perform public.push_notification(
    v_other,
    'connection_coordination',
    'market-price-proposal:' || v_proposal_id::text,
    'New price proposed for your marketplace order',
    'Review the proposed price. The current agreed price stays in place until you accept.',
    auth.uid(),
    v_order.request_id,
    null,
    v_order.connection_id,
    null
  );

  return v_proposal_id;
end;
$$;

revoke all on function public.propose_market_price(uuid,integer) from public, anon, authenticated;
grant execute on function public.propose_market_price(uuid,integer) to authenticated;

create or replace function public.respond_market_price(
  p_proposal_id uuid,
  p_accept boolean
)
returns text
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_proposal public.market_price_proposals;
  v_order public.market_orders;
  v_connection public.connections;
  v_payment_status text;
  v_quote record;
  v_shipping_cost integer;
  v_status text;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;

  select * into v_proposal
  from public.market_price_proposals
  where id = p_proposal_id
  for update;

  if not found then raise exception 'Price proposal not found'; end if;
  if v_proposal.status <> 'pending' then raise exception 'This price proposal is no longer pending'; end if;

  select * into v_order
  from public.market_orders
  where id = v_proposal.market_order_id
  for update;

  if not found then raise exception 'Marketplace order not found'; end if;
  if auth.uid() <> v_order.buyer_id and auth.uid() <> v_order.seller_id then raise exception 'Not authorized'; end if;
  if auth.uid() = v_proposal.proposed_by then raise exception 'The other participant must respond to this proposal'; end if;
  if v_order.status not in ('awaiting_payment','off_platform') then raise exception 'PRICE_LOCKED_ORDER_STARTED'; end if;
  if v_order.price_locked_at is not null then raise exception 'PRICE_LOCKED_CHECKOUT_STARTED'; end if;

  select * into v_connection
  from public.connections
  where id = v_order.connection_id
  for update;

  if not found then raise exception 'Connection not found'; end if;
  if v_connection.status not in ('confirmed','active') then raise exception 'Connection is not active'; end if;

  select cp.status into v_payment_status
  from public.connection_payments cp
  where cp.connection_id = v_order.connection_id
  for update;

  if v_payment_status is not null and v_payment_status <> 'not_started' then
    raise exception 'PRICE_LOCKED_PAYMENT_STARTED';
  end if;

  v_status := case when p_accept then 'accepted' else 'declined' end;

  update public.market_price_proposals
  set status = v_status,
      responded_by = auth.uid(),
      responded_at = now(),
      updated_at = now()
  where id = v_proposal.id;

  if p_accept then
    if v_connection.payment_method = 'aspire' then
      select * into v_quote
      from public.quote_aspire_fees(
        v_proposal.amount_cents,
        (select r.campus_id from public.requests r where r.id = v_order.request_id),
        0
      );

      if v_proposal.amount_cents < v_quote.minimum_paid_order_cents then
        raise exception 'PRICE_BELOW_ASPIRE_MINIMUM';
      end if;

      v_shipping_cost := case
        when v_order.fulfillment_method = 'shipping' and v_order.shipping_paid_by = 'seller'
          then coalesce(v_order.shipping_rate_cents, 0)
        else 0
      end;

      if v_quote.provider_net_cents - v_shipping_cost <= 0 then
        raise exception 'PRICE_LEAVES_NO_SELLER_PROCEEDS';
      end if;
    end if;

    update public.connections
    set agreed_amount_cents = v_proposal.amount_cents,
        updated_at = now()
    where id = v_order.connection_id;

    update public.market_orders
    set agreed_amount_cents = v_proposal.amount_cents,
        updated_at = now()
    where id = v_order.id;
  end if;

  perform public.push_notification(
    v_proposal.proposed_by,
    'connection_coordination',
    'market-price-response:' || v_proposal.id::text || ':' || v_status,
    case when p_accept then 'Your proposed price was accepted' else 'Your proposed price was declined' end,
    case when p_accept then 'The accepted price is now the order price.' else 'The current order price did not change.' end,
    auth.uid(),
    v_order.request_id,
    null,
    v_order.connection_id,
    null
  );

  return v_status;
end;
$$;

revoke all on function public.respond_market_price(uuid,boolean) from public, anon, authenticated;
grant execute on function public.respond_market_price(uuid,boolean) to authenticated;

create or replace function public.supersede_market_price_proposals_on_order_lock()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.price_locked_at is not null
     or new.status not in ('awaiting_payment','off_platform') then
    update public.market_price_proposals
    set status = 'superseded', responded_at = now(), updated_at = now()
    where market_order_id = new.id and status = 'pending';
  end if;
  return new;
end;
$$;

revoke all on function public.supersede_market_price_proposals_on_order_lock() from public, anon, authenticated;

drop trigger if exists supersede_market_price_proposals_on_order_lock on public.market_orders;
create trigger supersede_market_price_proposals_on_order_lock
after update of price_locked_at, status on public.market_orders
for each row
execute function public.supersede_market_price_proposals_on_order_lock();
