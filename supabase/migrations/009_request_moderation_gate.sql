-- Aspire 101 request moderation gate.
-- New posts stay private/pending until a moderator approves them.
-- Obvious profanity/hate slurs are rejected before they are saved.

alter table public.requests add column if not exists moderation_status text not null default 'pending';
alter table public.requests add column if not exists moderation_flags text[] not null default '{}'::text[];
alter table public.requests add column if not exists moderation_version text not null default 'rules_v1';

do $$ begin
  alter table public.requests add constraint requests_moderation_status_check
    check (moderation_status in ('pending','approved','rejected','blocked'));
exception when duplicate_object then null; end $$;

update public.requests set moderation_status='approved' where moderation_status='pending';

create or replace function public.aspire_content_flags(p_text text)
returns text[]
language plpgsql
immutable
set search_path = public
as $$
declare
  t text := lower(coalesce(p_text,''));
  n text;
  flags text[] := '{}'::text[];
begin
  n := translate(t, '01345@$!', 'oieasasi');

  if n ~ '(^|[^a-z])(fuck|fucking|fucked|motherfucker|motherfucking|shit|shitty|bullshit|bitch|cunt)([^a-z]|$)' then
    flags := array_append(flags, 'profanity');
  end if;

  if n ~ '(^|[^a-z])(nigg(er|ers|a|as)|fagg(ot|ots)|kike|kikes|chink|chinks|spic|spics)([^a-z]|$)' then
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
  new.moderation_version := 'rules_v1';

  if flags && array['profanity','hate_slur']::text[] then
    raise exception 'CONTENT_POLICY_BLOCKED';
  end if;

  new.moderation_status := 'pending';
  new.moderated_by := null;
  new.moderated_at := null;
  new.moderation_reason := null;
  return new;
end;
$$;

revoke all on function public.guard_request_content() from public;

drop trigger if exists requests_content_moderation_tg on public.requests;
create trigger requests_content_moderation_tg
before insert or update of title, details, category, kind on public.requests
for each row execute function public.guard_request_content();

create or replace function public.guard_message_content()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  body_text text;
  flags text[];
begin
  if tg_table_name = 'request_responses' then body_text := coalesce(new.message,'');
  else body_text := coalesce(new.body,'');
  end if;
  flags := public.aspire_content_flags(body_text);
  if flags && array['profanity','hate_slur']::text[] then raise exception 'MESSAGE_POLICY_BLOCKED'; end if;
  return new;
end;
$$;

revoke all on function public.guard_message_content() from public;

drop trigger if exists request_responses_content_guard_tg on public.request_responses;
create trigger request_responses_content_guard_tg
before insert or update of message on public.request_responses
for each row execute function public.guard_message_content();

drop trigger if exists connection_messages_content_guard_tg on public.connection_messages;
create trigger connection_messages_content_guard_tg
before insert or update of body on public.connection_messages
for each row execute function public.guard_message_content();

create or replace function public.moderator_review_request(p_request_id uuid, p_decision text, p_note text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare v_target uuid;
begin
  if not public.is_moderator() then raise exception 'Moderator access required.'; end if;
  if p_decision not in ('approved','rejected') then raise exception 'Invalid moderation decision.'; end if;
  select poster_id into v_target from public.requests where id=p_request_id for update;
  if not found then raise exception 'Request not found.'; end if;

  update public.requests
  set moderation_status=p_decision,
      moderated_by=auth.uid(),
      moderated_at=now(),
      moderation_reason=nullif(trim(coalesce(p_note,'')),''),
      updated_at=now()
  where id=p_request_id;

  insert into public.moderation_actions(moderator_id, action, target_user_id, request_id, note)
  values (auth.uid(), case when p_decision='approved' then 'approve_request' else 'reject_request' end, v_target, p_request_id, p_note);
end;
$$;

revoke all on function public.moderator_review_request(uuid,text,text) from public;
grant execute on function public.moderator_review_request(uuid,text,text) to authenticated;

drop policy if exists "signed in users can read requests" on public.requests;
create policy "approved requests or owner or moderators can read"
on public.requests for select to authenticated
using (auth.uid() = poster_id or moderation_status = 'approved' or public.is_moderator());

create or replace function public.discover_requests(
  p_campus_id uuid,
  p_query text default null,
  p_category text default 'Anything',
  p_limit integer default 40
)
returns table(
  id uuid,
  poster_id uuid,
  kind text,
  category text,
  title text,
  details text,
  campus text,
  campus_id uuid,
  city text,
  amount_cents integer,
  currency text,
  payment_method text,
  market_intent text,
  item_condition text,
  price_negotiable boolean,
  fulfillment_method text,
  quantity integer,
  status text,
  created_at timestamptz,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  clean_query text := nullif(trim(coalesce(p_query, '')), '');
  clean_category text := coalesce(nullif(trim(p_category), ''), 'Anything');
  safe_limit integer := greatest(1, least(coalesce(p_limit, 40), 80));
begin
  if auth.uid() is null then raise exception 'Sign in required'; end if;
  if p_campus_id is null or not exists (
    select 1 from public.universities u0 where u0.id=p_campus_id and u0.active=true
  ) then raise exception 'Unsupported campus'; end if;

  return query
  select r.id,r.poster_id,r.kind,r.category,r.title,r.details,u.name,r.campus_id,u.city,
    r.amount_cents,r.currency,r.payment_method,r.market_intent,r.item_condition,
    r.price_negotiable,r.fulfillment_method,r.quantity,r.status,r.created_at,r.updated_at
  from public.requests r
  join public.universities u on u.id=r.campus_id
  where r.status='open'
    and r.moderation_status='approved'
    and r.campus_id=p_campus_id
    and not exists (select 1 from public.user_blocks b where b.blocker_id=auth.uid() and b.blocked_id=r.poster_id)
    and not exists (select 1 from public.user_blocks b where b.blocker_id=r.poster_id and b.blocked_id=auth.uid())
    and (
      clean_query is null
      or r.search_document @@ websearch_to_tsquery('simple', clean_query)
      or r.title ilike '%' || replace(replace(clean_query,'%','\\%'),'_','\\_') || '%' escape '\\'
      or coalesce(r.details,'') ilike '%' || replace(replace(clean_query,'%','\\%'),'_','\\_') || '%' escape '\\'
    )
    and (
      clean_category='Anything'
      or (clean_category='Get me there' and lower(r.category || ' ' || r.title) ~ '(ride|transport|airport|chicago|indy)')
      or (clean_category='Pick this up' and lower(r.category || ' ' || r.title) ~ '(pickup|errand|target|costco|order|food|package)')
      or (clean_category='Give me a hand' and lower(r.category || ' ' || r.title) ~ '(moving|help|desk|chair|carry|furniture)')
      or (clean_category='Study / class' and lower(r.category || ' ' || r.title) ~ '(study|class|tutor|math|calc|econ|homework|exam)')
      or (clean_category='Gaming / duos' and lower(r.category || ' ' || r.title) ~ '(gaming|game|valorant|league|fortnite|duo|ranked|queue|cs2|overwatch|minecraft)')
      or (clean_category='Build something' and lower(r.category || ' ' || r.title) ~ '(project|collab|designer|hackathon|build|startup|code|developer)')
      or (clean_category='People / community' and lower(r.category || ' ' || r.title) ~ '(community|people|friend|group|club|ski|gym|workout|hang|campus life|meet)')
      or (clean_category='Buy & sell' and (r.kind='buy_sell' or lower(r.category || ' ' || r.title) ~ '(market|sell|buy|fridge|lamp)'))
    )
  order by r.created_at desc
  limit safe_limit;
end;
$$;

revoke all on function public.discover_requests(uuid,text,text,integer) from public;
grant execute on function public.discover_requests(uuid,text,text,integer) to authenticated;

-- Legacy word-list internals must never be exposed to normal clients.
revoke select on public.banned_patterns, public.banned_words from anon, authenticated;
revoke execute on function public.add_banned_pattern(text,text) from anon, authenticated;
revoke execute on function public.add_banned_patterns(text[],text) from anon, authenticated;
