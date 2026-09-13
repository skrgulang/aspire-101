alter table public.campus_ambassador_applications
  add column if not exists internal_notes text,
  add column if not exists reviewed_by uuid,
  add column if not exists reviewed_at timestamptz;

alter table public.campus_ambassador_applications
  drop constraint if exists campus_ambassador_applications_internal_notes_length;

alter table public.campus_ambassador_applications
  add constraint campus_ambassador_applications_internal_notes_length
  check (internal_notes is null or char_length(internal_notes) <= 10000);

create index if not exists campus_ambassador_applications_status_created_idx
  on public.campus_ambassador_applications (status, created_at desc);
