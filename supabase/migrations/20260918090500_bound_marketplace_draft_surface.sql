-- Bound the authenticated marketplace draft surface so a browser client cannot
-- use drafts as an unbounded text/JSON-like storage channel.

alter table public.marketplace_listing_drafts
  drop constraint if exists marketplace_listing_drafts_content_bounds;

alter table public.marketplace_listing_drafts
  add constraint marketplace_listing_drafts_content_bounds check (
    char_length(title) <= 180
    and char_length(details) <= 10000
    and (seller_area is null or char_length(seller_area) <= 120)
    and (photo_storage_path is null or char_length(photo_storage_path) <= 500)
    and (photo_mime_type is null or char_length(photo_mime_type) <= 100)
    and (price_cents is null or price_cents between 0 and 100000000)
    and (seller_delivery_price_cents is null or seller_delivery_price_cents between 0 and 10000000)
    and item_condition in ('new','like_new','good','fair','for_parts')
    and (shipping_paid_by is null or shipping_paid_by in ('buyer','seller','either'))
    and (seller_delivery_mode is null or seller_delivery_mode in ('free','fixed','negotiable'))
    and cardinality(fulfillment_methods) <= 4
    and fulfillment_methods <@ array['campus_pickup','shipping','seller_delivery','aspirer_delivery']::text[]
  );

create or replace function public.guard_marketplace_draft_count()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if current_user = 'authenticated' then
    if new.user_id is distinct from auth.uid() then
      raise exception 'DRAFT_OWNER_MISMATCH';
    end if;

    if (
      select count(*) >= 50
      from public.marketplace_listing_drafts d
      where d.user_id = auth.uid()
    ) then
      raise exception 'MARKETPLACE_DRAFT_LIMIT';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists marketplace_listing_drafts_count_tg on public.marketplace_listing_drafts;
create trigger marketplace_listing_drafts_count_tg
before insert on public.marketplace_listing_drafts
for each row execute function public.guard_marketplace_draft_count();

revoke all on function public.guard_marketplace_draft_count() from public, anon, authenticated;
