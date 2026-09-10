-- Aspire 101 profile policy cleanup — 2026-09-10
-- Profiles are created from auth.users; the browser only needs controlled UPDATE
-- plus the safe-column SELECT grants established in production_hardening.

drop policy if exists "Users can insert their own profile" on public.profiles;
drop policy if exists "profiles_insert_own" on public.profiles;

drop policy if exists "profiles_select_all" on public.profiles;
drop policy if exists "profiles_select_authenticated" on public.profiles;
create policy "profiles_select_authenticated"
on public.profiles
for select
to authenticated
using (true);

drop policy if exists "Users can update their own profile" on public.profiles;
drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own"
on public.profiles
for update
to authenticated
using ((select auth.uid()) = id)
with check ((select auth.uid()) = id);

-- Keep set_profiles_updated_at and remove equivalent duplicate triggers.
drop trigger if exists profiles_touch_updated on public.profiles;
drop trigger if exists trg_profiles_touch on public.profiles;
drop trigger if exists trg_profiles_updated_at on public.profiles;
