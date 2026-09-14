-- Shippo/FedEx fulfillment metadata for protected marketplace orders.
-- Addresses stay in Shippo's shipment object; Aspire stores only opaque IDs and
-- the resulting label/tracking metadata.

alter table public.market_orders
  add column if not exists shipping_provider text,
  add column if not exists shipping_carrier text,
  add column if not exists shipping_service text,
  add column if not exists shipping_shipment_id text,
  add column if not exists shipping_rate_id text,
  add column if not exists shipping_rate_cents integer,
  add column if not exists shipping_currency text,
  add column if not exists shipping_transaction_id text,
  add column if not exists shipping_label_url text,
  add column if not exists shipping_tracking_number text,
  add column if not exists shipping_tracking_url text,
  add column if not exists shipping_status text not null default 'not_started',
  add column if not exists shipping_last_event_at timestamptz;

do $$ begin
  alter table public.market_orders add constraint market_orders_shipping_provider_check
    check (shipping_provider is null or shipping_provider in ('shippo'));
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.market_orders add constraint market_orders_shipping_status_check
    check (shipping_status in ('not_started','rates_ready','label_purchasing','label_failed','label_purchased','in_transit','delivered','exception','cancelled'));
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.market_orders add constraint market_orders_shipping_rate_amount_check
    check (shipping_rate_cents is null or shipping_rate_cents >= 0);
exception when duplicate_object then null; end $$;

create unique index if not exists market_orders_shipping_shipment_idx
  on public.market_orders(shipping_shipment_id)
  where shipping_shipment_id is not null;

create unique index if not exists market_orders_shipping_transaction_idx
  on public.market_orders(shipping_transaction_id)
  where shipping_transaction_id is not null;

comment on column public.market_orders.shipping_shipment_id is 'Opaque Shippo shipment object ID; no shipping address is stored in Aspire.';
comment on column public.market_orders.shipping_status is 'Normalized Shippo/FedEx fulfillment state, independent from payment/order status.';
