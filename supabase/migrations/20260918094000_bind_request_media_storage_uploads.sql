-- Require request-media uploads to target an existing open request owned by the uploader.
-- This closes the old ability for an authenticated client to upload arbitrary objects
-- under its top-level user folder without a valid Aspire request context.

drop policy if exists "request_media_storage_insert" on storage.objects;
create policy "request_media_storage_insert"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'request-media'
  and (storage.foldername(name))[1] = (select auth.uid())::text
  and array_length(storage.foldername(name), 1) = 3
  and exists (
    select 1
    from public.requests r
    where r.id::text = (storage.foldername(name))[2]
      and r.poster_id = (select auth.uid())
      and r.status = 'open'
  )
  and not exists (
    select 1
    from public.request_media rm
    where rm.storage_path = name
  )
);
