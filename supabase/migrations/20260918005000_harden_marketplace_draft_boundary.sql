-- Harden private marketplace drafts and draft-photo storage boundaries.

revoke all on table public.marketplace_listing_drafts from anon;
grant select, insert, update, delete on table public.marketplace_listing_drafts to authenticated;

drop policy if exists "users create own marketplace drafts" on public.marketplace_listing_drafts;
drop policy if exists "users delete own marketplace drafts" on public.marketplace_listing_drafts;
drop policy if exists "users read own marketplace drafts" on public.marketplace_listing_drafts;
drop policy if exists "users update own marketplace drafts" on public.marketplace_listing_drafts;

create policy "authenticated users create own marketplace drafts"
on public.marketplace_listing_drafts
for insert
to authenticated
with check ((select auth.uid()) = user_id);

create policy "authenticated users read own marketplace drafts"
on public.marketplace_listing_drafts
for select
to authenticated
using ((select auth.uid()) = user_id);

create policy "authenticated users update own marketplace drafts"
on public.marketplace_listing_drafts
for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy "authenticated users delete own marketplace drafts"
on public.marketplace_listing_drafts
for delete
to authenticated
using ((select auth.uid()) = user_id);

alter table public.marketplace_listing_drafts
  drop constraint if exists marketplace_listing_drafts_photo_path_owner_ck;
alter table public.marketplace_listing_drafts
  add constraint marketplace_listing_drafts_photo_path_owner_ck
  check (
    photo_storage_path is null
    or photo_storage_path like user_id::text || '/' || id::text || '/%'
  );

alter table public.marketplace_listing_drafts
  drop constraint if exists marketplace_listing_drafts_photo_state_ck;
alter table public.marketplace_listing_drafts
  add constraint marketplace_listing_drafts_photo_state_ck
  check (
    (photo_storage_path is null and photo_mime_type is null)
    or (
      photo_storage_path is not null
      and photo_mime_type in ('image/jpeg', 'image/png', 'image/webp')
    )
  );

drop policy if exists "marketplace_draft_media_insert_own" on storage.objects;
drop policy if exists "marketplace_draft_media_select_own" on storage.objects;
drop policy if exists "marketplace_draft_media_update_own" on storage.objects;
drop policy if exists "marketplace_draft_media_delete_own" on storage.objects;

create policy "marketplace_draft_media_insert_own"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'marketplace-drafts'
  and (storage.foldername(name))[1] = (select auth.uid())::text
  and exists (
    select 1
    from public.marketplace_listing_drafts d
    where d.user_id = (select auth.uid())
      and d.id::text = (storage.foldername(name))[2]
  )
);

create policy "marketplace_draft_media_select_own"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'marketplace-drafts'
  and (storage.foldername(name))[1] = (select auth.uid())::text
  and exists (
    select 1
    from public.marketplace_listing_drafts d
    where d.user_id = (select auth.uid())
      and d.id::text = (storage.foldername(name))[2]
  )
);

create policy "marketplace_draft_media_delete_own"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'marketplace-drafts'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);
