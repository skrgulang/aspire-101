alter table public.marketplace_listing_drafts
  add column if not exists photo_storage_path text,
  add column if not exists photo_mime_type text;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'marketplace-drafts',
  'marketplace-drafts',
  false,
  8388608,
  array['image/jpeg','image/png','image/webp','image/heic','image/heif']::text[]
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists marketplace_draft_media_select_own on storage.objects;
drop policy if exists marketplace_draft_media_insert_own on storage.objects;
drop policy if exists marketplace_draft_media_update_own on storage.objects;
drop policy if exists marketplace_draft_media_delete_own on storage.objects;

create policy marketplace_draft_media_select_own
on storage.objects for select to authenticated
using (
  bucket_id = 'marketplace-drafts'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

create policy marketplace_draft_media_insert_own
on storage.objects for insert to authenticated
with check (
  bucket_id = 'marketplace-drafts'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

create policy marketplace_draft_media_update_own
on storage.objects for update to authenticated
using (
  bucket_id = 'marketplace-drafts'
  and (storage.foldername(name))[1] = (select auth.uid())::text
)
with check (
  bucket_id = 'marketplace-drafts'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

create policy marketplace_draft_media_delete_own
on storage.objects for delete to authenticated
using (
  bucket_id = 'marketplace-drafts'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);
