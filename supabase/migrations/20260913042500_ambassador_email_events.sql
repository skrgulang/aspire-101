create table if not exists public.ambassador_email_events (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references public.campus_ambassador_applications(id) on delete cascade,
  email_type text not null check (email_type in ('application_received','admin_new_application','interview_invite','accepted','declined','follow_up')),
  recipient text not null,
  status text not null default 'queued' check (status in ('queued','sent','failed','skipped')),
  provider text,
  provider_message_id text,
  error_message text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  sent_at timestamptz
);

create index if not exists ambassador_email_events_application_idx
  on public.ambassador_email_events (application_id, created_at desc);

create index if not exists ambassador_email_events_status_idx
  on public.ambassador_email_events (status, created_at desc);

alter table public.ambassador_email_events enable row level security;

revoke all on table public.ambassador_email_events from anon, authenticated;
grant all on table public.ambassador_email_events to service_role;
