-- Pending request photos should not be public before the post is approved.
update storage.buckets set public=false where id='request-media';

drop policy if exists request_media_read on public.request_media;
create policy request_media_read_moderated
on public.request_media for select to authenticated
using (
  uploader_id = auth.uid()
  or public.is_moderator()
  or exists (
    select 1 from public.requests r
    where r.id = request_id and r.moderation_status = 'approved'
  )
);

drop policy if exists request_media_storage_select_moderated on storage.objects;
create policy request_media_storage_select_moderated
on storage.objects for select to authenticated
using (
  bucket_id = 'request-media'
  and exists (
    select 1
    from public.request_media rm
    join public.requests r on r.id = rm.request_id
    where rm.storage_path = storage.objects.name
      and (
        rm.uploader_id = auth.uid()
        or public.is_moderator()
        or r.moderation_status = 'approved'
      )
  )
);