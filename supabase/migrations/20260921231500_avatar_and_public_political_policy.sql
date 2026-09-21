-- Profile-photo moderation + viewpoint-neutral public political-content audit fields.
-- Public avatars are now written only after server-side safety review.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'avatar-review',
  'avatar-review',
  false,
  5242880,
  array['image/jpeg','image/png','image/webp']
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

alter table public.avatar_moderation_reviews
  add column if not exists storage_bucket text not null default 'avatar-review',
  add column if not exists public_policy_decision text,
  add column if not exists public_policy_reason_code text,
  add column if not exists public_policy_summary text,
  add column if not exists public_policy_model text;

do $$ begin
  alter table public.avatar_moderation_reviews
    add constraint avatar_moderation_reviews_storage_bucket_check
    check (storage_bucket in ('avatar-review','avatars'));
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.avatar_moderation_reviews
    add constraint avatar_moderation_reviews_public_policy_decision_check
    check (public_policy_decision is null or public_policy_decision in ('allow','review','block'));
exception when duplicate_object then null; end $$;

create index if not exists avatar_moderation_reviews_status_created_idx
  on public.avatar_moderation_reviews(status, created_at desc);

alter table public.request_ai_assessments
  add column if not exists public_policy_decision text,
  add column if not exists public_policy_reason_code text,
  add column if not exists public_policy_summary text,
  add column if not exists public_policy_model text;

do $$ begin
  alter table public.request_ai_assessments
    add constraint request_ai_assessments_public_policy_decision_check
    check (public_policy_decision is null or public_policy_decision in ('allow','review','block'));
exception when duplicate_object then null; end $$;

-- Close the old direct-public-avatar bypass. The browser now posts the image to
-- /api/profile/avatar and the service role publishes only approved images.
drop policy if exists avatar_insert_own on storage.objects;
drop policy if exists avatar_update_own on storage.objects;
revoke execute on function public.set_my_avatar_url(text,text) from public, anon, authenticated;
revoke execute on function public.can_upload_avatar_object(text) from public, anon, authenticated;
