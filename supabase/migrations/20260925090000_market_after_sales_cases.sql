-- Completed orders retain their financial state while their buyers can request help.
create or replace function public.market_open_after_sales(p_connection_id uuid, p_reason text, p_details text)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  o public.market_orders;
  d public.market_disputes;
begin
  select * into o from public.market_orders where connection_id=p_connection_id for update;
  if not found then raise exception 'MARKET_ORDER_NOT_FOUND'; end if;
  if auth.uid() is null or auth.uid() <> o.buyer_id then raise exception 'BUYER_REQUIRED'; end if;
  if o.status <> 'released' then raise exception 'AFTER_SALES_NOT_AVAILABLE'; end if;
  if o.released_at is null or o.released_at < now()-interval '14 days' then raise exception 'AFTER_SALES_WINDOW_CLOSED'; end if;
  if p_reason not in ('item_not_as_described','item_not_received','counterfeit_or_prohibited','payment_issue','unsafe_handoff','other') then raise exception 'INVALID_DISPUTE_REASON'; end if;
  if char_length(btrim(coalesce(p_details,''))) not between 10 and 2000 then raise exception 'DISPUTE_DETAILS_REQUIRED'; end if;
  if exists (select 1 from public.market_disputes where market_order_id=o.id and status in ('open','under_review')) then raise exception 'DISPUTE_ALREADY_OPEN'; end if;
  insert into public.market_disputes(market_order_id,opened_by,reason,details)
  values (o.id,auth.uid(),p_reason,btrim(p_details)) returning * into d;
  insert into public.market_order_events(market_order_id,actor_id,event_type,payload)
  values (o.id,auth.uid(),'after_sales_opened',jsonb_build_object('dispute_id',d.id,'reason',p_reason,'payout_already_released',true));
  perform public.push_notification(o.seller_id,'market_order','after-sales:'||d.id::text||':'||o.seller_id::text,
    'Buyer reported an item problem','Reply to the buyer and share evidence in the Resolution Center.',o.buyer_id,o.request_id,null,o.connection_id,null);
  perform public.push_notification(o.buyer_id,'market_order','after-sales:'||d.id::text||':'||o.buyer_id::text,
    'Your after-sales case is open','Add photos or documents in the Resolution Center. Aspire will review the case.',o.buyer_id,o.request_id,null,o.connection_id,null);
  return d.id;
end;
$$;

revoke all on function public.market_open_after_sales(uuid,text,text) from public,anon;
grant execute on function public.market_open_after_sales(uuid,text,text) to authenticated,service_role;

create or replace function public.market_close_after_sales(p_dispute_id uuid,p_actor_id uuid,p_note text)
returns uuid language plpgsql security definer set search_path=public
as $$
declare d public.market_disputes; o public.market_orders; v_note text;
begin
  if p_actor_id is null or not exists(select 1 from public.user_roles where user_id=p_actor_id and role='admin') then raise exception 'ADMIN_REQUIRED'; end if;
  v_note:=btrim(coalesce(p_note,''));
  if char_length(v_note) not between 10 and 2000 then raise exception 'REVIEW_NOTE_REQUIRED'; end if;
  select * into d from public.market_disputes where id=p_dispute_id for update;
  if not found or d.status not in ('open','under_review') then raise exception 'CASE_NOT_OPEN'; end if;
  select * into o from public.market_orders where id=d.market_order_id for update;
  if o.status <> 'released' then raise exception 'NOT_AFTER_SALES_CASE'; end if;
  update public.market_disputes set status='closed',resolution_note=v_note,reviewed_by=p_actor_id,resolved_at=now(),next_action_due_at=null,updated_at=now() where id=d.id;
  insert into public.market_order_events(market_order_id,actor_id,event_type,payload)
  values(o.id,p_actor_id,'after_sales_closed',jsonb_build_object('dispute_id',d.id,'no_financial_action',true));
  perform public.push_notification(o.buyer_id,'market_order','after-sales-closed:'||d.id::text||':'||o.buyer_id::text,'After-sales case reviewed','Read the decision in the Resolution Center.',p_actor_id,o.request_id,null,o.connection_id,null);
  perform public.push_notification(o.seller_id,'market_order','after-sales-closed:'||d.id::text||':'||o.seller_id::text,'After-sales case reviewed','Read the decision in the Resolution Center.',p_actor_id,o.request_id,null,o.connection_id,null);
  return d.id;
end;
$$;
revoke all on function public.market_close_after_sales(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.market_close_after_sales(uuid,uuid,text) to service_role;
