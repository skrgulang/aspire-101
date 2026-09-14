create or replace function public.purchase_marketplace_listing(p_request_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_request public.requests;
  v_buyer uuid := auth.uid();
  v_connection_id uuid;
  v_payment_method text;
begin
  if v_buyer is null then raise exception 'AUTH_REQUIRED'; end if;

  select * into v_request from public.requests where id = p_request_id for update;
  if not found then raise exception 'LISTING_NOT_FOUND'; end if;
  if v_request.poster_id = v_buyer then raise exception 'CANNOT_BUY_OWN_LISTING'; end if;
  if v_request.kind <> 'buy_sell' or v_request.market_intent <> 'sell' then raise exception 'NOT_A_LISTING'; end if;
  if v_request.status <> 'open' then raise exception 'LISTING_UNAVAILABLE'; end if;
  if v_request.listing_expires_at is not null and v_request.listing_expires_at <= now() then
    update public.requests set status = 'expired', updated_at = now() where id = v_request.id;
    raise exception 'LISTING_EXPIRED';
  end if;
  if coalesce(v_request.amount_cents, 0) <= 0 then raise exception 'LISTING_HAS_NO_PRICE'; end if;
  if exists (
    select 1 from public.user_blocks ub
    where (ub.blocker_id = v_buyer and ub.blocked_id = v_request.poster_id)
       or (ub.blocker_id = v_request.poster_id and ub.blocked_id = v_buyer)
  ) then raise exception 'LISTING_UNAVAILABLE'; end if;
  if exists (select 1 from public.connections where request_id = v_request.id and status <> 'cancelled') then
    raise exception 'LISTING_UNAVAILABLE';
  end if;

  v_payment_method := case when v_request.payment_method = 'aspire' then 'aspire' else 'in_person' end;

  insert into public.connections (
    request_id, requester_id, responder_id, requester_confirmed, responder_confirmed,
    status, agreed_amount_cents, agreed_terms, payment_method
  ) values (
    v_request.id, v_request.poster_id, v_buyer, true, true,
    'confirmed', v_request.amount_cents,
    jsonb_build_object(
      'category', v_request.category,
      'kind', v_request.kind,
      'source', 'marketplace_buy_now',
      'protection', case when v_payment_method = 'aspire' then 'aspire_protected' else 'none' end
    ),
    v_payment_method
  ) returning id into v_connection_id;

  update public.requests set status = 'matched', updated_at = now() where id = v_request.id;
  return v_connection_id;
end;
$fn$;

revoke all on function public.purchase_marketplace_listing(uuid) from public;
grant execute on function public.purchase_marketplace_listing(uuid) to authenticated;
