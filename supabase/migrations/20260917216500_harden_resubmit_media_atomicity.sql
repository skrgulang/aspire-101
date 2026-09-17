-- Harden blocked/rejected post resubmission and request-media mutation paths.
--
-- 1) Resubmission v2 deletes selected request_media rows in the same database
--    transaction as the content resubmit. If validation or the content update
--    fails, those media-row deletions roll back as well.
-- 2) Browser clients cannot mutate request_media rows in place.
-- 3) request-media storage objects cannot be overwritten, and a referenced
--    object cannot be deleted/re-created behind an already reviewed media row.

create or replace function public.resubmit_request_for_review_v2(
  p_request_id uuid,
  p_title text,
  p_details text,
  p_language_code text,
  p_amount_cents integer,
  p_item_condition text,
  p_price_negotiable boolean,
  p_fulfillment_methods text[],
  p_seller_area text,
  p_shipping_paid_by text,
  p_seller_delivery_mode text,
  p_seller_delivery_price_cents integer,
  p_remove_media_ids uuid[] default '{}'::uuid[]
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_remove_ids uuid[] := coalesce(p_remove_media_ids, '{}'::uuid[]);
begin
  if v_user is null then raise exception 'AUTHENTICATION_REQUIRED'; end if;

  -- Validate the requested removals before touching any media row. The call to
  -- the original resubmit function below performs the authoritative post,
  -- connection, content, marketplace, and moderation-state validation.
  if cardinality(v_remove_ids) > 0 then
    if exists (
      select 1
      from unnest(v_remove_ids) as selected(id)
      left join public.request_media rm on rm.id = selected.id
      where rm.id is null
         or rm.request_id <> p_request_id
         or rm.uploader_id <> v_user
    ) then
      raise exception 'INVALID_MEDIA_SELECTION';
    end if;

    delete from public.request_media rm
    where rm.id = any(v_remove_ids)
      and rm.request_id = p_request_id
      and rm.uploader_id = v_user;
  end if;

  -- Keep the existing, already-hardened validation/update logic as the single
  -- source of truth. PERFORM deliberately discards its full-row return value so
  -- internal moderation fields are not exposed by this v2 API.
  perform public.resubmit_request_for_review(
    p_request_id,
    p_title,
    p_details,
    p_language_code,
    p_amount_cents,
    p_item_condition,
    p_price_negotiable,
    p_fulfillment_methods,
    p_seller_area,
    p_shipping_paid_by,
    p_seller_delivery_mode,
    p_seller_delivery_price_cents
  );

  return p_request_id;
end;
$$;

revoke all on function public.resubmit_request_for_review_v2(uuid,text,text,text,integer,text,boolean,text[],text,text,text,integer,uuid[]) from public;
revoke all on function public.resubmit_request_for_review_v2(uuid,text,text,text,integer,text,boolean,text[],text,text,text,integer,uuid[]) from anon;
grant execute on function public.resubmit_request_for_review_v2(uuid,text,text,text,integer,text,boolean,text[],text,text,text,integer,uuid[]) to authenticated;

-- request_media rows are immutable from the browser. New images use INSERT and
-- removals use DELETE; no product flow needs an in-place storage_path/request_id
-- rewrite, which could otherwise bypass moderation invalidation.
drop policy if exists request_media_update_own on public.request_media;
revoke update on public.request_media from authenticated;

-- Existing request-media objects must also be immutable. Normal uploads use a
-- fresh random path with upsert=false, so UPDATE is unnecessary.
drop policy if exists request_media_storage_update on storage.objects;

-- A storage object may only be inserted when its path is not already referenced
-- by a request_media row. This prevents delete-and-recreate replacement of a
-- reviewed image at the same path.
drop policy if exists request_media_storage_insert on storage.objects;
create policy request_media_storage_insert
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'request-media'
  and (storage.foldername(name))[1] = (auth.uid())::text
  and not exists (
    select 1 from public.request_media rm
    where rm.storage_path = storage.objects.name
  )
);

-- Delete the request_media row first. While a row still references an object,
-- direct storage deletion is denied, so an approved media record cannot silently
-- point at replaced bytes.
drop policy if exists request_media_storage_delete on storage.objects;
create policy request_media_storage_delete
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'request-media'
  and owner_id = (auth.uid())::text
  and not exists (
    select 1 from public.request_media rm
    where rm.storage_path = storage.objects.name
  )
);
