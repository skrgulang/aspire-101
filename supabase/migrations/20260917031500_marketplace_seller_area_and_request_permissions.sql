alter table public.requests add column if not exists seller_area text;
alter table public.marketplace_listing_drafts add column if not exists seller_area text;

grant insert, update on table public.requests to authenticated;

comment on column public.requests.seller_area is 'Approximate public seller location for marketplace listings, such as campus area or neighborhood. Never an exact private address.';
comment on column public.marketplace_listing_drafts.seller_area is 'Approximate public seller location saved with a marketplace draft.';
