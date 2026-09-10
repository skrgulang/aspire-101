-- Aspire 101 profile-index cleanup — 2026-09-10
-- Keep profiles_username_key and profiles_username_norm_key as the canonical
-- uniqueness enforcement. The removed pair was identical.

alter table public.profiles drop constraint if exists profiles_username_unique;
drop index if exists public.profiles_username_norm_unique;
