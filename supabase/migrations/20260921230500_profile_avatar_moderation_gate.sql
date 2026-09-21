-- Private staging for profile-photo moderation.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatar-pending','avatar-pending',false,5242880,array['image/jpeg','image/png','image/webp'])
on conflict (id) do update set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "avatar pending insert own" on storage.objects;
create policy "avatar pending insert own"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'avatar-pending'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

drop policy if exists "avatar pending read own" on storage.objects;
create policy "avatar pending read own"
on storage.objects for select to authenticated
using (
  bucket_id = 'avatar-pending'
  and owner_id = (select auth.uid())::text
);

drop policy if exists "avatar pending delete own" on storage.objects;
create policy "avatar pending delete own"
on storage.objects for delete to authenticated
using (
  bucket_id = 'avatar-pending'
  and owner_id = (select auth.uid())::text
);

-- Keep users from bypassing the moderation route by directly setting avatar fields.
create or replace function public.protect_profile_avatar_fields()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if auth.uid() is not null and auth.role() = 'authenticated' then
    new.avatar_url := old.avatar_url;
    new.image_url := old.image_url;
    new.avatar_moderation_status := old.avatar_moderation_status;
    new.avatar_pending_path := old.avatar_pending_path;
    new.avatar_moderation_review_id := old.avatar_moderation_review_id;
    new.avatar_moderation_summary := old.avatar_moderation_summary;
  end if;
  return new;
end;
$$;

drop trigger if exists protect_profile_avatar_fields_trigger on public.profiles;
create trigger protect_profile_avatar_fields_trigger
before update on public.profiles
for each row execute function public.protect_profile_avatar_fields();

-- Retire the old direct-publication RPC. Profile photos must pass the server review gate.
revoke execute on function public.set_my_avatar_url(text,text) from public, anon, authenticated;
