-- FINAL ROLLOUT STEP.
-- Apply this migration when the AI-gated ProfileAvatar client/API is promoted to production.
-- It closes the legacy direct-public upload path so every new avatar must pass the moderation pipeline.

drop policy if exists avatar_insert_own on storage.objects;
drop policy if exists avatar_update_own on storage.objects;
drop policy if exists avatar_delete_own on storage.objects;

drop trigger if exists profile_avatar_moderation_guard_tg on public.profiles;
create trigger profile_avatar_moderation_guard_tg
before update of avatar_url, image_url on public.profiles
for each row execute function public.guard_profile_avatar_moderation();
