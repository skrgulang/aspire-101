-- Keep obfuscation detection while preventing matches that span ordinary words.
create or replace function public.aspire_content_flags(p_text text)
returns text[]
language plpgsql
stable
set search_path = public
as $$
declare
  t text := lower(normalize(coalesce(p_text,''), NFKC));
  n text;
  compact text;
  flags text[] := '{}'::text[];
begin
  n := translate(t, '01345@$!', 'oieasasi');
  compact := regexp_replace(n, '[._*~`|@$-]+', '', 'g');

  if compact ~ '(^|[^a-z])(fuck|fucking|fucked|motherfucker|motherfucking|shit|shitty|bullshit|bitch|cunt)([^a-z]|$)'
     or n ~ '(^|[^a-z])f[^a-z]+u[^a-z]+c[^a-z]+k([^a-z]|$)'
     or n ~ '(^|[^a-z])b[^a-z]+i[^a-z]+t[^a-z]+c[^a-z]+h([^a-z]|$)'
     or n ~ '(^|[^a-z])s[^a-z]+h[^a-z]+i[^a-z]+t([^a-z]|$)' then
    flags := array_append(flags, 'profanity');
  end if;

  if compact ~ '(^|[^a-z])(nigg(er|ers|a|as)|fagg(ot|ots)|kike|kikes|chink|chinks|spic|spics)([^a-z]|$)'
     or n ~ '(^|[^a-z])n[^a-z]+i[^a-z]+g[^a-z]+g[^a-z]+(e[^a-z]+r|a)([^a-z]|$)'
     or n ~ '(^|[^a-z])f[^a-z]+a[^a-z]+g[^a-z]+g[^a-z]+o[^a-z]+t([^a-z]|$)' then
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
