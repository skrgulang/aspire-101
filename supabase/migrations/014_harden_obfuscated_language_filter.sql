-- Harden the database boundary against common leetspeak / punctuation / spacing bypasses.
-- Uses the existing make_obf_regex + banned_patterns primitives so filtering cannot be bypassed by client changes.

do $$ begin
  perform public.add_banned_patterns(array[
    'fuck','fucking','fucked','motherfucker','motherfucking','shit','shitty','bullshit','bitch','cunt'
  ], 'profanity seed');
  perform public.add_banned_patterns(array[
    'nigger','niggers','nigga','niggas','faggot','faggots','kike','kikes','chink','chinks','spic','spics'
  ], 'hate slur seed');
end $$;

create or replace function public.aspire_content_flags(p_text text)
returns text[]
language plpgsql
stable
set search_path = public
as $$
declare
  t text := lower(coalesce(p_text,''));
  n text;
  flags text[] := '{}'::text[];
  has_profanity boolean := false;
  has_hate boolean := false;
begin
  n := translate(t, '01345@$!', 'oieasasi');

  select exists(
    select 1 from public.banned_patterns b
    where coalesce(b.note,'') !~* 'hate[ _-]?slur'
      and t ~ b.pattern
  ) into has_profanity;

  select exists(
    select 1 from public.banned_patterns b
    where coalesce(b.note,'') ~* 'hate[ _-]?slur'
      and t ~ b.pattern
  ) into has_hate;

  if has_profanity or n ~ '(^|[^a-z])(fuck|fucking|fucked|motherfucker|motherfucking|shit|shitty|bullshit|bitch|cunt)([^a-z]|$)' then
    flags := array_append(flags, 'profanity');
  end if;

  if has_hate or n ~ '(^|[^a-z])(nigg(er|ers|a|as)|fagg(ot|ots)|kike|kikes|chink|chinks|spic|spics)([^a-z]|$)' then
    flags := array_append(flags, 'hate_slur');
  end if;

  if n ~ '(kill|shoot|stab|rape)[[:space:][:punct:]]+(you|him|her|them)' then
    flags := array_append(flags, 'threat_or_abuse');
  end if;

  if n ~ '(^|[^a-z])(gun|firearm|ammo|ammunition|weed|marijuana|cocaine|vape|nicotine|gift[ -]?card|account[ -]?(login|credentials?)|password)([^a-z]|$)' then
    flags := array_append(flags, 'restricted_market_term');
  end if;

  return flags;
end;
$$;

revoke all on function public.aspire_content_flags(text) from public;
