create table if not exists public.marketplace_listing_drafts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  campus_id uuid references public.universities(id) on delete set null,
  title text not null default '' check (char_length(title) <= 180),
  price_cents integer check (price_cents is null or price_cents >= 0),
  item_condition text not null default 'good' check (item_condition in ('new','like_new','good','fair','for_parts')),
  details text not null default '',
  fulfillment_methods text[] not null default array['campus_pickup']::text[] check (
    cardinality(fulfillment_methods) between 1 and 4
    and fulfillment_methods <@ array['campus_pickup','shipping','seller_delivery','aspirer_delivery']::text[]
  ),
  shipping_paid_by text check (shipping_paid_by is null or shipping_paid_by in ('buyer','seller','either')),
  seller_delivery_mode text check (seller_delivery_mode is null or seller_delivery_mode in ('free','fixed','negotiable')),
  seller_delivery_price_cents integer check (seller_delivery_price_cents is null or seller_delivery_price_cents >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.marketplace_listing_drafts enable row level security;

drop policy if exists "users read own marketplace drafts" on public.marketplace_listing_drafts;
create policy "users read own marketplace drafts"
  on public.marketplace_listing_drafts for select
  using ((select auth.uid()) = user_id);

drop policy if exists "users create own marketplace drafts" on public.marketplace_listing_drafts;
create policy "users create own marketplace drafts"
  on public.marketplace_listing_drafts for insert
  with check ((select auth.uid()) = user_id);

drop policy if exists "users update own marketplace drafts" on public.marketplace_listing_drafts;
create policy "users update own marketplace drafts"
  on public.marketplace_listing_drafts for update
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "users delete own marketplace drafts" on public.marketplace_listing_drafts;
create policy "users delete own marketplace drafts"
  on public.marketplace_listing_drafts for delete
  using ((select auth.uid()) = user_id);

create index if not exists marketplace_listing_drafts_user_updated_idx
  on public.marketplace_listing_drafts(user_id, updated_at desc);
