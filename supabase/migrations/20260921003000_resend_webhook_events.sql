create table if not exists public.resend_webhook_events (
  webhook_message_id text primary key,
  event_type text not null,
  email_id text,
  sender_domain text,
  recipient_domains text[] not null default '{}'::text[],
  event_created_at timestamptz,
  bounce_type text,
  bounce_subtype text,
  received_at timestamptz not null default now()
);

comment on table public.resend_webhook_events is
  'Privacy-minimized operational log for verified Resend email lifecycle webhooks.';

alter table public.resend_webhook_events enable row level security;

revoke all on table public.resend_webhook_events from anon;
revoke all on table public.resend_webhook_events from authenticated;
grant select, insert on table public.resend_webhook_events to service_role;

create index if not exists resend_webhook_events_email_id_idx
  on public.resend_webhook_events (email_id, received_at desc);

create index if not exists resend_webhook_events_type_idx
  on public.resend_webhook_events (event_type, received_at desc);
