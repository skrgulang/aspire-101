-- Aspire 101 AI-gated profile photo moderation.
-- New photos are staged privately, scanned, and only copied into the public avatar bucket after approval.

alter table public.profiles add column if not exists avatar_moderation_status text not null default 'none';
alter table public.profiles add column if not exists avatar_pending_path text;
alter table public.profiles add column if not exists avatar_moderation_review_id uuid;
alter table public.profiles add column if not exists avatar_moderation_summary text;
alter table public.profiles add column if not exists avatar_moderation_updated_at timestamptz;

do $$ begin
  alter table public.profiles add constraint profiles_avatar_moderation_status_check
    check (avatar_moderation_status in ('none','scanning','approved','review','rejected'));
exception when duplicate_object then null; end $$;

-- Existing profile photos pre-date this moderation flow. Preserve them rather than breaking user profiles.
update public.profiles
set avatar_moderation_status = 'approved',
    avatar_moderation_summary = coalesce(avatar_moderation_summary, 'Existing profile photo retained during moderation rollout.'),
    avatar_moderation_updated_at = coalesce(avatar_moderation_updated_at, now())
where avatar_url is not null and avatar_url <> '' and avatar_moderation_status = 'none';

create table if not exists public.avatar_moderation_reviews (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  storage_path text not null,
  mime_type text not null,
  status text not null default 'scanning' check (status in ('scanning','approved','review','rejected','superseded')),
  provider text not null default 'openai',
  model text,
  model_flagged boolean,
  risk_level text not null default 'unknown' check (risk_level in ('unknown','low','medium','high','critical')),
  risk_score integer check (risk_score is null or (risk_score between 0 and 100)),
  categories jsonb not null default '{}'::jsonb,
  category_scores jsonb not null default '{}'::jsonb,
  ai_summary text,
  moderator_note text,
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  approved_avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists avatar_moderation_reviews_user_created_idx
  on public.avatar_moderation_reviews(user_id, created_at desc);
create index if not exists avatar_moderation_reviews_status_created_idx
  on public.avatar_moderation_reviews(status, created_at asc);

alter table public.avatar_moderation_reviews enable row level security;
drop policy if exists "users read own avatar reviews" on public.avatar_moderation_reviews;
create policy "users read own avatar reviews"
  on public.avatar_moderation_reviews for select to authenticated
  using (user_id = auth.uid());
drop policy if exists "moderators read avatar reviews" on public.avatar_moderation_reviews;
create policy "moderators read avatar reviews"
  on public.avatar_moderation_reviews for select to authenticated
  using (public.is_moderator());

revoke all on table public.avatar_moderation_reviews from anon;
grant select on table public.avatar_moderation_reviews to authenticated;

-- Private staging bucket. AI/human review happens here; staged files are not public profile assets.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatar-review', 'avatar-review', false, 5242880, array['image/jpeg','image/png','image/webp'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Users may only stage/read/delete files inside their own folder.
drop policy if exists avatar_review_insert_own on storage.objects;
create policy avatar_review_insert_own on storage.objects for insert to authenticated
  with check (bucket_id = 'avatar-review' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists avatar_review_select_own on storage.objects;
create policy avatar_review_select_own on storage.objects for select to authenticated
  using (bucket_id = 'avatar-review' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists avatar_review_delete_own on storage.objects;
create policy avatar_review_delete_own on storage.objects for delete to authenticated
  using (bucket_id = 'avatar-review' and (storage.foldername(name))[1] = auth.uid()::text);

-- Approved avatars are service-published only. This prevents bypassing moderation by writing directly to the public bucket.
drop policy if exists avatar_insert_own on storage.objects;
drop policy if exists avatar_update_own on storage.objects;
drop policy if exists avatar_delete_own on storage.objects;

-- Authenticated browser clients cannot point profiles at arbitrary avatar URLs. The service-role moderation routes publish approved URLs.
create or replace function public.guard_profile_avatar_moderation()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if auth.role() = 'authenticated'
     and (new.avatar_url is distinct from old.avatar_url or new.image_url is distinct from old.image_url) then
    raise exception 'AVATAR_MODERATION_REQUIRED';
  end if;
  return new;
end;
$$;

revoke all on function public.guard_profile_avatar_moderation() from public;
revoke all on function public.guard_profile_avatar_moderation() from anon;
revoke all on function public.guard_profile_avatar_moderation() from authenticated;
grant execute on function public.guard_profile_avatar_moderation() to service_role;

drop trigger if exists profile_avatar_moderation_guard_tg on public.profiles;
create trigger profile_avatar_moderation_guard_tg
before update of avatar_url, image_url on public.profiles
for each row execute function public.guard_profile_avatar_moderation();
