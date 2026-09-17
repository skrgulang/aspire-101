-- The moderation API reviews at most five request images and only sends image
-- formats supported by the request moderation pipeline. Enforce that same
-- boundary at the database so a custom client cannot attach extra or unscanned
-- media to a post after the UI's client-side validation.

create or replace function public.guard_request_media_insert()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_poster_id uuid;
begin
  select r.poster_id
  into v_poster_id
  from public.requests r
  where r.id = new.request_id
    and r.status = 'open';

  if v_poster_id is null then
    raise exception 'REQUEST_MEDIA_REQUIRES_OPEN_REQUEST';
  end if;

  if new.uploader_id is distinct from v_poster_id then
    raise exception 'REQUEST_MEDIA_UPLOADER_MISMATCH';
  end if;

  if lower(coalesce(new.mime_type, '')) not in ('image/jpeg', 'image/png', 'image/webp') then
    raise exception 'REQUEST_MEDIA_UNSUPPORTED_FORMAT';
  end if;

  if new.storage_path !~ ('^' || new.uploader_id::text || '/' || new.request_id::text || '/[^/]+$') then
    raise exception 'REQUEST_MEDIA_INVALID_PATH';
  end if;

  -- Serialize inserts for one request so parallel custom-client inserts cannot
  -- race past the five-image cap.
  perform pg_advisory_xact_lock(hashtextextended(new.request_id::text, 0));

  if (select count(*) from public.request_media rm where rm.request_id = new.request_id) >= 5 then
    raise exception 'REQUEST_MEDIA_LIMIT';
  end if;

  return new;
end;
$$;

revoke all on function public.guard_request_media_insert() from public;
revoke all on function public.guard_request_media_insert() from anon;
revoke all on function public.guard_request_media_insert() from authenticated;

drop trigger if exists request_media_guard_insert_tg on public.request_media;
create trigger request_media_guard_insert_tg
before insert on public.request_media
for each row execute function public.guard_request_media_insert();

-- Stable ordering also prevents a custom client from creating ambiguous cover
-- order among the maximum five reviewed images.
create unique index if not exists request_media_request_sort_order_uidx
on public.request_media(request_id, sort_order);

-- Owners may remove media only while the parent post is still editable/open.
-- Cascades and server-side account deletion continue to work outside this RLS
-- policy, while completed transaction history remains immutable to the browser.
drop policy if exists request_media_delete_own on public.request_media;
create policy request_media_delete_own
on public.request_media
for delete
to authenticated
using (
  uploader_id = (select auth.uid())
  and exists (
    select 1 from public.requests r
    where r.id = request_media.request_id
      and r.poster_id = (select auth.uid())
      and r.status = 'open'
  )
);
