-- Keep anti-abuse trust scoring internal to moderation and server workflows.
-- Ordinary authenticated users should not be able to read or mutate the raw
-- trust profile, score bands, enforcement counters, or factors.

alter table public.user_trust_profiles enable row level security;

drop policy if exists "users read own trust profile" on public.user_trust_profiles;
drop policy if exists "moderators read trust profiles" on public.user_trust_profiles;
drop policy if exists "trust profile owner or moderator read" on public.user_trust_profiles;
drop policy if exists "trust profile moderator read" on public.user_trust_profiles;

create policy "trust profile moderator read"
on public.user_trust_profiles
for select
to authenticated
using (public.is_moderator());

-- Browser roles never need to write trust profiles. Moderator reads continue to
-- flow through RLS; server/service workflows retain full access.
revoke all privileges on table public.user_trust_profiles from anon;
revoke insert, update, delete, truncate, references, trigger on table public.user_trust_profiles from authenticated;
grant select on table public.user_trust_profiles to authenticated;

-- Reassert that trust refreshes can only be initiated by trusted server code or
-- by database triggers. Normal browser sessions must not be able to refresh or
-- probe scoring behavior directly.
revoke execute on function public.refresh_user_trust_profile(uuid) from public, anon, authenticated;
grant execute on function public.refresh_user_trust_profile(uuid) to service_role;

revoke execute on function public.refresh_trust_from_school_verification() from public, anon, authenticated;
revoke execute on function public.refresh_trust_from_identity_verification() from public, anon, authenticated;
revoke execute on function public.refresh_trust_from_review() from public, anon, authenticated;
revoke execute on function public.refresh_trust_from_market_order() from public, anon, authenticated;
revoke execute on function public.refresh_trust_from_moderation_action() from public, anon, authenticated;
