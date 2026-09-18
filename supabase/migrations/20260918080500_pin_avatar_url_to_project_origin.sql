-- Avatar URLs must point to the verified object in this project's public avatar bucket.
-- Do not accept arbitrary external origins that merely contain the expected storage path.

create or replace function public.set_my_avatar_url(p_storage_path text, p_avatar_url text)
returns void
language plpgsql
security definer
set search_path = public, storage
as $$
declare
  v_path text := btrim(coalesce(p_storage_path, ''));
  v_url text := btrim(coalesce(p_avatar_url, ''));
  v_expected_url text;
begin
  if auth.uid() is null then
    raise exception 'AUTH_REQUIRED';
  end if;

  if v_path = '' or char_length(v_path) > 500 then
    raise exception 'INVALID_AVATAR_PATH';
  end if;

  if (storage.foldername(v_path))[1] is distinct from auth.uid()::text then
    raise exception 'INVALID_AVATAR_PATH';
  end if;

  if not exists (
    select 1
    from storage.objects o
    where o.bucket_id = 'avatars'
      and o.name = v_path
      and o.owner_id = auth.uid()::text
  ) then
    raise exception 'AVATAR_OBJECT_NOT_FOUND';
  end if;

  v_expected_url := 'https://ikxjemnugoodfuxjaqoe.supabase.co/storage/v1/object/public/avatars/' || v_path;
  if v_url is distinct from v_expected_url then
    raise exception 'AVATAR_URL_MISMATCH';
  end if;

  update public.profiles
  set avatar_url = v_expected_url,
      image_url = v_expected_url,
      updated_at = now()
  where id = auth.uid();

  if not found then
    raise exception 'PROFILE_NOT_FOUND';
  end if;
end;
$$;

revoke all on function public.set_my_avatar_url(text,text) from public, anon;
grant execute on function public.set_my_avatar_url(text,text) to authenticated, service_role;
