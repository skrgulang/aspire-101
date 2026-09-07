-- Temporary rollout compatibility.
-- The production UI may still use the legacy direct avatar path while the AI-gated client is in preview.
-- Normal feature-branch UI already uses avatar-review. Final enforcement is in 027 and must be applied with production promotion.

create policy avatar_insert_own on storage.objects for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
create policy avatar_update_own on storage.objects for update to authenticated
  using (bucket_id = 'avatars' and owner_id = auth.uid()::text)
  with check (bucket_id = 'avatars' and owner_id = auth.uid()::text);
create policy avatar_delete_own on storage.objects for delete to authenticated
  using (bucket_id = 'avatars' and owner_id = auth.uid()::text);

drop trigger if exists profile_avatar_moderation_guard_tg on public.profiles;
