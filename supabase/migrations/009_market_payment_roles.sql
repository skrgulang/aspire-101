-- Marketplace payment-method roles differ from service requests:
-- the buyer controls payment and the seller receives the payout.

create or replace function public.set_connection_payment_method(p_connection_id uuid, p_method text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_connection public.connections;
  v_order public.market_orders;
  v_existing_status text;
  v_allowed_user uuid;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if p_method not in ('none','in_person','aspire') then raise exception 'Invalid payment method'; end if;

  select * into v_connection from public.connections where id = p_connection_id for update;
  if not found then raise exception 'Connection not found'; end if;

  select * into v_order from public.market_orders where connection_id = p_connection_id for update;
  if found then
    v_allowed_user := v_order.buyer_id;
  else
    v_allowed_user := v_connection.requester_id;
  end if;

  if auth.uid() <> v_allowed_user then
    if v_order.id is not null then raise exception 'Only the buyer can choose the marketplace payment method'; end if;
    raise exception 'Only the requester can choose the payment method';
  end if;

  if v_connection.status not in ('pending','confirmed','active') then raise exception 'Connection payment method can no longer change'; end if;
  if p_method = 'aspire' and coalesce(v_connection.agreed_amount_cents, 0) <= 0 then
    raise exception 'Set a positive agreed amount before choosing Aspire payment';
  end if;

  select status into v_existing_status from public.connection_payments where connection_id = p_connection_id;
  if v_existing_status in ('checkout_created','processing','secured','released','disputed') then
    raise exception 'Payment has already started and the method cannot be changed';
  end if;

  update public.connections
  set payment_method = p_method, updated_at = now()
  where id = p_connection_id;

  if v_order.id is not null and v_order.status not in ('paid','handoff_confirmed','release_ready','released','disputed','refunded','cancelled') then
    update public.market_orders
    set status = case when p_method = 'aspire' then 'awaiting_payment' else 'off_platform' end,
        updated_at = now()
    where id = v_order.id;
  end if;

  return p_method;
end;
$$;

revoke all on function public.set_connection_payment_method(uuid, text) from public;
grant execute on function public.set_connection_payment_method(uuid, text) to authenticated;
grant execute on function public.set_connection_payment_method(uuid, text) to service_role;
