-- Keep Trust & Safety enforcement continuously active at the database boundary.
-- Normalize Unicode confusables, serialize anti-spam checks, and rate-limit new checkout sessions.

create or replace function public.aspire_content_flags(p_text text)
returns text[]
language plpgsql
stable
set search_path = public
as $$
declare
  t text := lower(normalize(coalesce(p_text,''), NFKC));
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
revoke all on function public.aspire_content_flags(text) from public, anon, authenticated;

create or replace function public.guard_request_content()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare flags text[];
begin
  flags := public.aspire_content_flags(concat_ws(' ', new.title, new.details, new.category));
  new.moderation_flags := flags;
  new.moderation_version := 'rules_v2';

  if flags && array['profanity','hate_slur','threat_or_abuse']::text[] then
    raise exception 'CONTENT_POLICY_BLOCKED';
  end if;

  new.moderation_status := 'pending';
  new.moderated_by := null;
  new.moderated_at := null;
  new.moderation_reason := null;
  new.ai_moderation_status := 'not_scanned';
  new.ai_risk_level := 'unknown';
  new.ai_risk_score := null;
  new.ai_recommended_action := 'review';
  new.ai_policy_flags := '{}'::text[];
  new.ai_summary := null;
  new.ai_last_scanned_at := null;
  return new;
end;
$$;
revoke all on function public.guard_request_content() from public, anon, authenticated;

create or replace function public.guard_request_velocity()
returns trigger
language plpgsql
security definer
set search_path=public
as $$
declare
  v_hour integer;
  v_day integer;
  v_duplicate integer;
  v_title text := lower(regexp_replace(normalize(btrim(new.title), NFKC),'[^[:alnum:]]+','','g'));
begin
  perform pg_advisory_xact_lock(hashtextextended('aspire-request:' || new.poster_id::text, 0));

  select count(*)::integer into v_hour from public.requests
    where poster_id=new.poster_id and created_at >= now() - interval '1 hour';
  select count(*)::integer into v_day from public.requests
    where poster_id=new.poster_id and created_at >= now() - interval '24 hours';
  select count(*)::integer into v_duplicate from public.requests
    where poster_id=new.poster_id
      and lower(regexp_replace(normalize(btrim(title), NFKC),'[^[:alnum:]]+','','g')) = v_title
      and created_at >= now() - interval '15 minutes';

  if v_hour >= 8 or v_day >= 30 or v_duplicate >= 3 then
    raise exception 'POST_RATE_LIMIT';
  end if;
  return new;
end;
$$;
revoke all on function public.guard_request_velocity() from public, anon, authenticated;

create or replace function public.guard_response_velocity()
returns trigger
language plpgsql
security definer
set search_path=public
as $$
declare
  v_five_min integer;
  v_hour integer;
begin
  perform pg_advisory_xact_lock(hashtextextended('aspire-response:' || new.responder_id::text, 0));

  select count(*)::integer into v_five_min from public.request_responses
    where responder_id=new.responder_id and created_at >= now() - interval '5 minutes';
  select count(*)::integer into v_hour from public.request_responses
    where responder_id=new.responder_id and created_at >= now() - interval '1 hour';

  if v_five_min >= 8 or v_hour >= 30 then raise exception 'RESPONSE_RATE_LIMIT'; end if;
  return new;
end;
$$;
revoke all on function public.guard_response_velocity() from public, anon, authenticated;

create or replace function public.guard_message_velocity()
returns trigger
language plpgsql
security definer
set search_path=public
as $$
declare
  v_ten_seconds integer;
  v_five_min integer;
  v_duplicate integer;
  v_body text := lower(regexp_replace(normalize(btrim(new.body), NFKC),'[^[:alnum:]]+','','g'));
begin
  perform pg_advisory_xact_lock(hashtextextended('aspire-message:' || new.sender_id::text, 0));

  select count(*)::integer into v_ten_seconds from public.connection_messages
    where sender_id=new.sender_id and created_at >= now() - interval '10 seconds';
  select count(*)::integer into v_five_min from public.connection_messages
    where sender_id=new.sender_id and created_at >= now() - interval '5 minutes';
  select count(*)::integer into v_duplicate from public.connection_messages
    where sender_id=new.sender_id
      and lower(regexp_replace(normalize(btrim(body), NFKC),'[^[:alnum:]]+','','g')) = v_body
      and created_at >= now() - interval '2 minutes';

  if v_ten_seconds >= 8 or v_five_min >= 45 or v_duplicate >= 4 then
    raise exception 'MESSAGE_RATE_LIMIT';
  end if;
  return new;
end;
$$;
revoke all on function public.guard_message_velocity() from public, anon, authenticated;

create index if not exists connection_messages_sender_created_idx
  on public.connection_messages(sender_id, created_at desc);
create index if not exists request_responses_responder_created_idx
  on public.request_responses(responder_id, created_at desc);

create schema if not exists private;
create table if not exists private.payment_checkout_attempts (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  connection_id uuid not null references public.connections(id) on delete cascade,
  created_at timestamptz not null default now()
);
create index if not exists payment_checkout_attempts_user_created_idx
  on private.payment_checkout_attempts(user_id, created_at desc);
alter table private.payment_checkout_attempts enable row level security;
revoke all on table private.payment_checkout_attempts from public, anon, authenticated;
grant select, insert, delete on table private.payment_checkout_attempts to service_role;
grant usage, select on sequence private.payment_checkout_attempts_id_seq to service_role;

create or replace function public.claim_payment_checkout_attempt(p_user_id uuid, p_connection_id uuid)
returns void
language plpgsql
security definer
set search_path=public,private,pg_temp
as $$
declare
  v_ten_min integer;
  v_hour integer;
begin
  if p_user_id is null or p_connection_id is null then raise exception 'INVALID_CHECKOUT_ATTEMPT'; end if;
  if not exists (
    select 1 from public.connections c
    where c.id=p_connection_id and p_user_id in (c.requester_id,c.responder_id)
  ) then raise exception 'CHECKOUT_NOT_AUTHORIZED'; end if;

  perform pg_advisory_xact_lock(hashtextextended('aspire-checkout:' || p_user_id::text, 0));
  select count(*)::integer into v_ten_min from private.payment_checkout_attempts
    where user_id=p_user_id and created_at >= now()-interval '10 minutes';
  select count(*)::integer into v_hour from private.payment_checkout_attempts
    where user_id=p_user_id and created_at >= now()-interval '1 hour';

  if v_ten_min >= 6 or v_hour >= 20 then raise exception 'CHECKOUT_RATE_LIMIT'; end if;

  insert into private.payment_checkout_attempts(user_id,connection_id)
  values(p_user_id,p_connection_id);

  delete from private.payment_checkout_attempts where created_at < now()-interval '7 days';
end;
$$;
revoke all on function public.claim_payment_checkout_attempt(uuid,uuid) from public,anon,authenticated;
grant execute on function public.claim_payment_checkout_attempt(uuid,uuid) to service_role;

