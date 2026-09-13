alter table public.ambassador_email_events
  drop constraint if exists ambassador_email_events_status_check;

alter table public.ambassador_email_events
  add constraint ambassador_email_events_status_check
  check (status in ('queued','sent','failed','skipped','bounced'));

alter table public.ambassador_email_events
  add column if not exists bounced_at timestamptz;
