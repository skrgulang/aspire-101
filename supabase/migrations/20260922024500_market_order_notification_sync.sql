-- Keep marketplace order state and user-facing activity in sync.
-- Marketplace gets dedicated notifications; generic connection notices are suppressed.

create or replace function public.sync_market_order_payment_state()
returns trigger
language plpgsql
security definer
set search_path = public
as $function$
declare
  next_status text;
begin
  if not exists (select 1 from public.market_orders where connection_id = new.connection_id) then
    return new;
  end if;

  next_status := case
    when new.status = 'checkout_created' then 'awaiting_payment'
    when new.status = 'processing' then 'payment_processing'
    when new.status = 'failed' then 'awaiting_payment'
    when new.status = 'secured' then 'paid'
    when new.status = 'released' then 'released'
    when new.status = 'disputed' then 'disputed'
    when new.status = 'refunded' then 'refunded'
    when new.status = 'cancelled' then 'cancelled'
    else null
  end;

  update public.market_orders
  set payment_id = new.id,
      status = case
        when next_status is null then status
        when next_status = 'awaiting_payment'
          and new.status = 'checkout_created'
          and status in ('awaiting_payment','payment_processing') then 'awaiting_payment'
        when next_status = 'awaiting_payment'
          and new.status = 'failed'
          and status = 'payment_processing' then 'awaiting_payment'
        when next_status = 'payment_processing'
          and status in ('awaiting_payment','payment_processing') then 'payment_processing'
        when next_status = 'paid'
          and status in ('handoff_confirmed','release_ready','disputed') then status
        else next_status
      end,
      released_at = case when new.status = 'released' then coalesce(new.released_at, now()) else released_at end,
      refunded_at = case when new.status = 'refunded' then coalesce(new.refunded_at, now()) else refunded_at end,
      dispute_opened_at = case when new.status = 'disputed' then coalesce(new.disputed_at, now()) else dispute_opened_at end,
      updated_at = now()
  where connection_id = new.connection_id;

  return new;
end;
$function$;

create or replace function public.notify_connection_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_title text;
  v_actor uuid;
  v_other uuid;
begin
  select title into v_title from public.requests where id=new.request_id;
  v_actor := auth.uid();

  -- Marketplace orders have a dedicated order lifecycle notification stream.
  if coalesce(new.agreed_terms->>'source','') = 'marketplace_buy_now' then
    return new;
  end if;

  if tg_op='INSERT' then
    perform public.push_notification(
      new.responder_id,'connection_chosen','connection-chosen:'||new.id::text,
      'You were chosen for a request',
      coalesce('Confirm “'||v_title||'” to open private chat.','Confirm the connection to open private chat.'),
      new.requester_id,new.request_id,null,new.id,null
    );
    return new;
  end if;

  if old.status is distinct from new.status then
    if new.status in ('confirmed','active') and old.status not in ('confirmed','active') then
      perform public.push_notification(
        new.requester_id,'connection_confirmed','connection-confirmed:'||new.id::text,
        'Your connection is confirmed',
        coalesce('Private chat is open for “'||v_title||'”.','Private chat is now open.'),
        new.responder_id,new.request_id,null,new.id,null
      );
    elsif new.status='completed' and old.status<>'completed' then
      perform public.push_notification(
        new.requester_id,'connection_completed','connection-completed:'||new.id::text||':'||new.requester_id::text,
        'Connection completed',
        'You can now leave a trust review and choose whether to keep in touch.',
        v_actor,new.request_id,null,new.id,null
      );
      perform public.push_notification(
        new.responder_id,'connection_completed','connection-completed:'||new.id::text||':'||new.responder_id::text,
        'Connection completed',
        'You can now leave a trust review and choose whether to keep in touch.',
        v_actor,new.request_id,null,new.id,null
      );
    elsif new.status='cancelled' and old.status<>'cancelled' then
      if v_actor=new.requester_id then v_other:=new.responder_id;
      elsif v_actor=new.responder_id then v_other:=new.requester_id;
      else v_other:=new.requester_id; end if;
      perform public.push_notification(
        v_other,'connection_cancelled','connection-cancelled:'||new.id::text||':'||v_other::text,
        'A connection was cancelled',
        coalesce('The connection for “'||v_title||'” is no longer active.','This connection is no longer active.'),
        v_actor,new.request_id,null,new.id,null
      );
    end if;
  end if;
  return new;
end;
$function$;

create or replace function public.notify_market_order_status_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_status text := new.status;
  v_old_status text := case when tg_op='UPDATE' then old.status else null end;
  v_dispute public.market_disputes;
  v_attempt integer := 0;
begin
  if tg_op='UPDATE' and old.status is not distinct from new.status then
    return new;
  end if;

  if v_status in ('paid','handoff_confirmed','release_ready','released','disputed','refunded','cancelled') then
    delete from public.notifications
    where connection_id=new.connection_id
      and event_key in (
        'market-payment-due:'||new.connection_id::text,
        'market-awaiting-payment:'||new.connection_id::text
      );
  end if;

  if tg_op='INSERT' and v_status='awaiting_payment' then
    perform public.push_notification(
      new.buyer_id,'market_order','market-payment-due:'||new.connection_id::text,
      'Item reserved — finish payment',
      'Open Orders and tap the gold Secure payment button to complete Aspire Protected checkout before pickup or delivery.',
      new.seller_id,new.request_id,null,new.connection_id,null
    );
    perform public.push_notification(
      new.seller_id,'market_order','market-awaiting-payment:'||new.connection_id::text,
      'Your item is reserved',
      'The buyer has reserved this item. Wait for Aspire Protected payment to show as secured in Orders before handoff.',
      new.buyer_id,new.request_id,null,new.connection_id,null
    );
    return new;
  end if;

  if tg_op='UPDATE' and v_old_status='payment_processing' and v_status='awaiting_payment' then
    select coalesce(checkout_attempt,0) into v_attempt
    from public.connection_payments
    where connection_id=new.connection_id;

    perform public.push_notification(
      new.buyer_id,'market_order',
      'market-payment-failed:'||new.id::text||':'||v_attempt::text||':'||new.buyer_id::text,
      'Payment did not go through',
      'Your item is still reserved for now. Open Orders and try Secure payment again.',
      new.seller_id,new.request_id,null,new.connection_id,null
    );
    perform public.push_notification(
      new.seller_id,'market_order',
      'market-payment-failed:'||new.id::text||':'||v_attempt::text||':'||new.seller_id::text,
      'Buyer payment did not complete',
      'Do not hand off the item yet. The order is waiting for the buyer to retry Aspire Protected payment.',
      new.buyer_id,new.request_id,null,new.connection_id,null
    );
    return new;
  end if;

  if v_status='paid' then
    perform public.push_notification(
      new.buyer_id,'market_order','market-paid:'||new.id::text||':'||new.buyer_id::text,
      'Payment secured ✓',
      'Aspire confirmed your payment. Coordinate the handoff in Orders and inspect the item before confirming receipt.',
      new.seller_id,new.request_id,null,new.connection_id,null
    );
    perform public.push_notification(
      new.seller_id,'market_order','market-paid:'||new.id::text||':'||new.seller_id::text,
      'Buyer payment secured ✓',
      'Aspire confirmed the buyer payment. You can proceed with the agreed handoff; payout remains protected until receipt is confirmed.',
      new.buyer_id,new.request_id,null,new.connection_id,null
    );

  elsif v_status='handoff_confirmed' then
    perform public.push_notification(
      new.buyer_id,'market_order','market-handoff:'||new.id::text||':'||new.buyer_id::text,
      'Seller marked the item handed off',
      'Inspect the item. If everything is correct, open Orders and confirm receipt to continue the protected payout.',
      new.seller_id,new.request_id,null,new.connection_id,null
    );

  elsif v_status='release_ready' then
    perform public.push_notification(
      new.seller_id,'market_order','market-receipt:'||new.id::text||':'||new.seller_id::text,
      'Buyer confirmed receipt ✓',
      'The protected order is ready for seller payout release.',
      new.buyer_id,new.request_id,null,new.connection_id,null
    );
    perform public.push_notification(
      new.buyer_id,'market_order','market-receipt:'||new.id::text||':'||new.buyer_id::text,
      'Receipt confirmed',
      'Your receipt confirmation was recorded. Aspire is completing the protected order.',
      new.seller_id,new.request_id,null,new.connection_id,null
    );

  elsif v_status='released' then
    perform public.push_notification(
      new.seller_id,'market_order','market-released:'||new.id::text||':'||new.seller_id::text,
      'Seller payout released ✓',
      'Aspire released the protected seller payout through Stripe. Bank arrival timing depends on the payout schedule.',
      new.buyer_id,new.request_id,null,new.connection_id,null
    );
    perform public.push_notification(
      new.buyer_id,'market_order','market-released:'||new.id::text||':'||new.buyer_id::text,
      'Order complete ✓',
      'The seller payout was released and this Aspire Protected order is complete.',
      new.seller_id,new.request_id,null,new.connection_id,null
    );

  elsif v_status='disputed' then
    select * into v_dispute
    from public.market_disputes
    where market_order_id=new.id
      and status in ('open','under_review')
    order by created_at desc
    limit 1;

    -- Stripe-originated cases create their own more specific risk notifications.
    if found and coalesce(v_dispute.source,'user')='user' then
      perform public.push_notification(
        new.buyer_id,'market_order','market-disputed:'||v_dispute.id::text||':'||new.buyer_id::text,
        'Marketplace issue under review',
        'Aspire paused seller payout while this order issue is reviewed.',
        v_dispute.opened_by,new.request_id,null,new.connection_id,null
      );
      perform public.push_notification(
        new.seller_id,'market_order','market-disputed:'||v_dispute.id::text||':'||new.seller_id::text,
        'Marketplace issue under review',
        'Aspire paused seller payout while this order issue is reviewed.',
        v_dispute.opened_by,new.request_id,null,new.connection_id,null
      );
    end if;

  elsif v_status='refunded' then
    select * into v_dispute
    from public.market_disputes
    where market_order_id=new.id
      and status='resolved_buyer'
    order by resolved_at desc nulls last, updated_at desc
    limit 1;

    if found then
      perform public.push_notification(
        new.buyer_id,'market_order','market-dispute-refund:'||v_dispute.id::text,
        'Marketplace dispute resolved — refund issued',
        'Aspire approved a full refund. Bank posting time can vary after Stripe processes it.',
        null,new.request_id,null,new.connection_id,null
      );
      perform public.push_notification(
        new.seller_id,'market_order','market-dispute-refund-seller:'||v_dispute.id::text,
        'Marketplace dispute resolved',
        'Aspire resolved this order with a buyer refund. No seller payout will be released for this payment.',
        null,new.request_id,null,new.connection_id,null
      );
    else
      perform public.push_notification(
        new.buyer_id,'market_order','market-refunded:'||new.id::text||':'||new.buyer_id::text,
        'Refund issued',
        'Aspire refunded the protected payment. Bank posting time can vary after Stripe processes it.',
        null,new.request_id,null,new.connection_id,null
      );
      perform public.push_notification(
        new.seller_id,'market_order','market-refunded:'||new.id::text||':'||new.seller_id::text,
        'Order refunded',
        'The protected payment was refunded to the buyer and no seller payout will be released.',
        null,new.request_id,null,new.connection_id,null
      );
    end if;

  elsif v_status='cancelled' then
    perform public.push_notification(
      new.buyer_id,'market_order','market-cancelled:'||new.id::text||':'||new.buyer_id::text,
      'Marketplace order cancelled',
      'This order is closed. Open Orders to review the final status.',
      null,new.request_id,null,new.connection_id,null
    );
    perform public.push_notification(
      new.seller_id,'market_order','market-cancelled:'||new.id::text||':'||new.seller_id::text,
      'Marketplace order cancelled',
      'This order is closed. Open Orders to review the final status.',
      null,new.request_id,null,new.connection_id,null
    );
  end if;

  return new;
end;
$function$;

drop trigger if exists notify_market_order_status_change_tg on public.market_orders;
create trigger notify_market_order_status_change_tg
after insert or update on public.market_orders
for each row execute function public.notify_market_order_status_change();
