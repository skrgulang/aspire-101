-- Fix browser image uploads for both request photos and marketplace draft photos.
-- storage.foldername('<user>/<record>/<file>') returns only [user, record].

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
  v_folders text[] := storage.foldername(p_name);
begin
  if v_user is null or p_name is null then return false; end if;
  if array_length(v_folders, 1) <> 2 then return false; end if;
  if v_folders[1] is distinct from v_user::text then return false; end if;

  begin
    v_request_id := v_folders[2]::uuid;
  exception when others then
    return false;
  end;

  if not exists (
    select 1
    from public.requests r
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

revoke all on function public.can_upload_request_media_object(text) from public, anon, authenticated;

-- Re-state the marketplace helper here too so both upload surfaces share the
-- same folder semantics in one hardening migration.
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
  v_folders text[] := storage.foldername(p_name);
begin
  if v_user is null or p_name is null then return false; end if;
  if array_length(v_folders, 1) <> 2 then return false; end if;
  if v_folders[1] is distinct from v_user::text then return false; end if;

  begin
    v_draft_id := v_folders[2]::uuid;
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

revoke all on function public.can_upload_marketplace_draft_object(text) from public, anon, authenticated;
