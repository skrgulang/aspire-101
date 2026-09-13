alter table public.campus_ambassador_applications
  add column if not exists school_email_domain text,
  add column if not exists school_email_status text not null default 'unreviewed' check (school_email_status in ('matched','unmatched','unreviewed')),
  add column if not exists school_email_suggestion text,
  add column if not exists matched_university_id uuid references public.universities(id) on delete set null;

create index if not exists campus_ambassador_applications_email_status_idx
  on public.campus_ambassador_applications (school_email_status, created_at desc);

update public.campus_ambassador_applications a
set school_email_domain = lower(split_part(a.school_email, '@', 2)),
    school_email_status = case
      when exists (
        select 1
        from public.universities u,
             unnest(u.email_domains) as d(domain)
        where u.active = true
          and (
            lower(split_part(a.school_email, '@', 2)) = lower(d.domain)
            or lower(split_part(a.school_email, '@', 2)) like '%.' || lower(d.domain)
          )
      ) then 'matched'
      else 'unmatched'
    end,
    matched_university_id = (
      select u.id
      from public.universities u,
           unnest(u.email_domains) as d(domain)
      where u.active = true
        and (
          lower(split_part(a.school_email, '@', 2)) = lower(d.domain)
          or lower(split_part(a.school_email, '@', 2)) like '%.' || lower(d.domain)
        )
      order by char_length(d.domain) desc
      limit 1
    )
where a.school_email_domain is null or a.school_email_status = 'unreviewed';
