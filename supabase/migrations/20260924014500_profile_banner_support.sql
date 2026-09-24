alter table public.profiles
  add column if not exists banner_url text;

create or replace function public.get_my_profile_banner()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select p.banner_url
  from public.profiles p
  where p.id = auth.uid();
$$;

revoke all on function public.get_my_profile_banner() from public;
grant execute on function public.get_my_profile_banner() to authenticated;
