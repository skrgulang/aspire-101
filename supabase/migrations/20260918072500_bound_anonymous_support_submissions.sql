-- Add bounded anonymous abuse protection to the public support submission RPC.
-- Authenticated users keep the existing per-user limit; anonymous submissions get
-- conservative global caps so a public RPC cannot grow the table without bound.

create or replace function public.submit_support_feedback(
  p_type text,
  p_subject text,
  p_details text default null,
  p_email text default null,
  p_page_url text default null,
  p_company text default null,
  p_contact text default null,
  p_website text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_type text := lower(btrim(coalesce(p_type, '')));
  v_subject text := btrim(coalesce(p_subject, ''));
  v_details text := nullif(btrim(coalesce(p_details, '')), '');
  v_email text := nullif(btrim(coalesce(p_email, '')), '');
  v_page_url text := nullif(btrim(coalesce(p_page_url, '')), '');
  v_company text := nullif(btrim(coalesce(p_company, '')), '');
  v_contact text := nullif(btrim(coalesce(p_contact, '')), '');
  v_website text := nullif(btrim(coalesce(p_website, '')), '');
begin
  if v_type not in ('feature','bug','feedback','abuse','collaboration') then
    raise exception 'INVALID_SUPPORT_TYPE';
  end if;
  if char_length(v_subject) < 3 or char_length(v_subject) > 160 then
    raise exception 'INVALID_SUPPORT_SUBJECT';
  end if;
  if v_details is not null and char_length(v_details) > 10000 then
    raise exception 'SUPPORT_DETAILS_TOO_LONG';
  end if;
  if v_email is not null and char_length(v_email) > 320 then
    raise exception 'SUPPORT_EMAIL_TOO_LONG';
  end if;
  if v_page_url is not null and char_length(v_page_url) > 2000 then
    raise exception 'SUPPORT_PAGE_URL_TOO_LONG';
  end if;
  if v_company is not null and char_length(v_company) > 300 then
    raise exception 'SUPPORT_COMPANY_TOO_LONG';
  end if;
  if v_contact is not null and char_length(v_contact) > 300 then
    raise exception 'SUPPORT_CONTACT_TOO_LONG';
  end if;
  if v_website is not null and char_length(v_website) > 2000 then
    raise exception 'SUPPORT_WEBSITE_TOO_LONG';
  end if;

  if auth.uid() is not null then
    if (
      select count(*) >= 8
      from public.support_feedback s
      where s.created_by = auth.uid()
        and s.created_at > now() - interval '10 minutes'
    ) then
      raise exception 'SUPPORT_RATE_LIMIT';
    end if;
  else
    if (
      select count(*) >= 20
      from public.support_feedback s
      where s.created_by is null
        and s.created_at > now() - interval '10 minutes'
    ) then
      raise exception 'SUPPORT_RATE_LIMIT';
    end if;

    if (
      select count(*) >= 200
      from public.support_feedback s
      where s.created_by is null
        and s.created_at > now() - interval '24 hours'
    ) then
      raise exception 'SUPPORT_RATE_LIMIT';
    end if;
  end if;

  insert into public.support_feedback(
    type, subject, details, email, page_url, company, contact, website,
    approved, archived, reason, moderated_at, moderated_by, created_by
  )
  values(
    v_type, v_subject, v_details, v_email, v_page_url, v_company, v_contact, v_website,
    false, false, null, null, null, auth.uid()
  )
  returning id into v_id;

  return v_id;
end;
$$;

revoke all on function public.submit_support_feedback(text,text,text,text,text,text,text,text) from PUBLIC;
grant execute on function public.submit_support_feedback(text,text,text,text,text,text,text,text) to anon, authenticated, service_role;
