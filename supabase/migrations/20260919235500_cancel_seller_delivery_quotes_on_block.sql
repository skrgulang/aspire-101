-- Blocking must also close stale Seller Delivery quote handshakes.
-- A buyer/seller pair that blocks each other must not be able to continue a
-- requested/quoted delivery negotiation or accept it into a new connection.

create or replace function public.guard_market_seller_delivery_quote_block()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status in ('requested','quoted','accepted')
     and public.connection_pair_is_blocked(new.buyer_id, new.seller_id)
  then
    raise exception 'SELLER_DELIVERY_BLOCKED';
  end if;
  return new;
end;
$$;

revoke all on function public.guard_market_seller_delivery_quote_block()
  from public, anon, authenticated;

drop trigger if exists guard_market_seller_delivery_quote_block_tg
  on public.market_seller_delivery_quotes;

create trigger guard_market_seller_delivery_quote_block_tg
before insert or update of status, buyer_id, seller_id
on public.market_seller_delivery_quotes
for each row execute function public.guard_market_seller_delivery_quote_block();

create or replace function public.clear_circle_choices_after_block()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.connection_circle_choices cc
  using public.connections c
  where cc.connection_id = c.id
    and (
      (c.requester_id = new.blocker_id and c.responder_id = new.blocked_id)
      or (c.requester_id = new.blocked_id and c.responder_id = new.blocker_id)
    );

  delete from public.connection_live_locations l
  using public.connections c
  where l.connection_id = c.id
    and (
      (c.requester_id = new.blocker_id and c.responder_id = new.blocked_id)
      or (c.requester_id = new.blocked_id and c.responder_id = new.blocker_id)
    );

  update public.market_seller_delivery_quotes q
  set status = 'cancelled',
      updated_at = now()
  where q.status in ('requested','quoted','declined')
    and (
      (q.buyer_id = new.blocker_id and q.seller_id = new.blocked_id)
      or (q.buyer_id = new.blocked_id and q.seller_id = new.blocker_id)
    );

  return new;
end;
$$;

revoke all on function public.clear_circle_choices_after_block()
  from public, anon, authenticated;
