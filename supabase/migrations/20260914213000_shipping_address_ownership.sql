-- Keep exact carrier addresses outside Aspire. Each participant creates their own
-- Shippo address; Aspire stores only opaque provider ids needed to quote labels.

alter table public.market_orders
  add column if not exists shipping_from_address_id text,
  add column if not exists shipping_to_address_id text,
  add column if not exists shipping_from_address_ready_at timestamptz,
  add column if not exists shipping_to_address_ready_at timestamptz,
  add column if not exists shipping_rate_options jsonb not null default '[]'::jsonb;

comment on column public.market_orders.shipping_from_address_id is 'Opaque Shippo address id created by the seller. Exact sender address remains in Shippo.';
comment on column public.market_orders.shipping_to_address_id is 'Opaque Shippo address id created by the buyer. Exact destination address remains in Shippo.';
comment on column public.market_orders.shipping_rate_options is 'Non-sensitive Shippo rate summary shown to the buyer for carrier selection.';
