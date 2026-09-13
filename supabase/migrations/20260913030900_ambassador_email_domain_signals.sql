alter table public.campus_ambassador_applications
  add column if not exists school_email_domain text,
  add column if not exists school_email_status text not null default 'unreviewed' check (school_email_status in ('matched','unmatched','unreviewed')),
  add column if not exists school_email_suggestion text,
  add column if not exists matched_university_id uuid references public.universities(id) on delete set null;

create index if not exists campus_ambassador_applications_email_status_idx
  on public.campus_ambassador_applications (school_email_status, created_at desc);
