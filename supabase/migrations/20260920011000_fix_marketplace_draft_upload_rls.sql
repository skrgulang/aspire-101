-- Fix marketplace draft photo uploads.
-- storage.foldername('user_id/draft_id/file.jpg') returns only the directory
-- segments [user_id, draft_id], so the old helper incorrectly rejected every
-- valid upload by requiring three folder segments.

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

  -- Expected object path:
  --   <user_uuid>/<draft_uuid>/<filename>
  -- foldername() excludes the filename, so there are exactly two folders.
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
