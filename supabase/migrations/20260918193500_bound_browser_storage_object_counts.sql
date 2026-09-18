-- Put server-enforced object-count limits around browser-uploadable buckets.
-- Bucket file-size/MIME limits already exist; these checks prevent authenticated clients
-- from bypassing the UI and accumulating unbounded orphan objects.

create or replace function public.can_upload_avatar_object(p_name text)
returns boolean
language plpgsql
stable
security definer
set search_path = public, storage
as $$
declare
  v_user uuid := auth.uid();
begin
  if v_user is null or p_name is null then return false; end if;
  if array_length(storage.foldername(p_name), 1) <> 2 then return false; end if;
  if (storage.foldername(p_name))[1] is distinct from v_user::text then return false; end if;

  return (
    select count(*) < 10
    from storage.objects o
    where o.bucket_id = 'avatars'
      and o.owner_id = v_user::text
  );
end;
$$;

create or replace function public.can_upload_request_media_object(p_name text)
returns boolean
language plpgsql
stable
security definer
set search_path = public, storage
as $$
declare
  v_user uuid := auth.uid();
  v_request_id uuid;
begin
  if v_user is null or p_name is null then return false; end if;
  if array_length(storage.foldername(p_name), 1) <> 3 then return false; end if;
  if (storage.foldername(p_name))[1] is distinct from v_user::text then return false; end if;

  begin
    v_request_id := ((storage.foldername(p_name))[2])::uuid;
  exception when others then
    return false;
  end;

  if not exists (
    select 1 from public.requests r
    where r.id = v_request_id
      and r.poster_id = v_user
      and r.status = 'open'
  ) then
    return false;
  end if;

  return (
    select count(*) < 10
    from storage.objects o
    where o.bucket_id = 'request-media'
      and o.name like v_user::text || '/' || v_request_id::text || '/%'
  );
end;
$$;

create or replace function public.can_upload_marketplace_draft_object(p_name text)
returns boolean
language plpgsql
stable
security definer
set search_path = public, storage
as $$
declare
  v_user uuid := auth.uid();
  v_draft_id uuid;
begin
  if v_user is null or p_name is null then return false; end if;
  if array_length(storage.foldername(p_name), 1) <> 3 then return false; end if;
  if (storage.foldername(p_name))[1] is distinct from v_user::text then return false; end if;

  begin
    v_draft_id := ((storage.foldername(p_name))[2])::uuid;
  exception when others then
    return false;
  end;

  if not exists (
    select 1
    from public.marketplace_listing_drafts d
    where d.id = v_draft_id
      and d.user_id = v_user
  ) then
    return false;
  end if;

  return (
    select count(*) < 5
    from storage.objects o
    where o.bucket_id = 'marketplace-drafts'
      and o.name like v_user::text || '/' || v_draft_id::text || '/%'
  );
end;
$$;

revoke all on function public.can_upload_avatar_object(text) from PUBLIC, anon;
revoke all on function public.can_upload_request_media_object(text) from PUBLIC, anon;
revoke all on function public.can_upload_marketplace_draft_object(text) from PUBLIC, anon;
grant execute on function public.can_upload_avatar_object(text) to authenticated, service_role;
grant execute on function public.can_upload_request_media_object(text) to authenticated, service_role;
grant execute on function public.can_upload_marketplace_draft_object(text) to authenticated, service_role;

drop policy if exists "avatar_insert_own" on storage.objects;
create policy "avatar_insert_own"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'avatars'
  and public.can_upload_avatar_object(name)
);

drop policy if exists "request_media_storage_insert" on storage.objects;
create policy "request_media_storage_insert"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'request-media'
  and public.can_upload_request_media_object(name)
  and not exists (
    select 1 from public.request_media rm
    where rm.storage_path = name
  )
);

drop policy if exists "marketplace_draft_media_insert_own" on storage.objects;
create policy "marketplace_draft_media_insert_own"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'marketplace-drafts'
  and public.can_upload_marketplace_draft_object(name)
);
