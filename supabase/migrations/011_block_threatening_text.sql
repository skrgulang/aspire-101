-- Block high-confidence abusive/threatening text in posts, responses, and private chat.
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

  if flags && array['profanity','hate_slur','threat_or_abuse']::text[] then
    raise exception 'CONTENT_POLICY_BLOCKED';
  end if;

  new.moderation_status := 'pending';
  new.moderated_by := null;
  new.moderated_at := null;
  new.moderation_reason := null;
  return new;
end;
$$;

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
  if flags && array['profanity','hate_slur','threat_or_abuse']::text[] then
    raise exception 'MESSAGE_POLICY_BLOCKED';
  end if;
  return new;
end;
$$;
