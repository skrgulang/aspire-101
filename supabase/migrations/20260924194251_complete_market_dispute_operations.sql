-- Operational workflow for marketplace reports and Stripe disputes.
-- The browser never receives direct table grants: all access is mediated by
-- authenticated Next.js routes using the service role after participant/staff checks.

alter table public.market_disputes
  add column if not exists assigned_to uuid,
  add column if not exists reviewed_by uuid,
  add column if not exists review_started_at timestamptz,
  add column if not exists evidence_due_by timestamptz,
  add column if not exists last_participant_response_at timestamptz,
  add column if not exists last_staff_response_at timestamptz;

create index if not exists market_disputes_open_queue_idx
  on public.market_disputes(status, created_at desc)
  where status in ('open','under_review');

create index if not exists market_disputes_assigned_queue_idx
  on public.market_disputes(assigned_to, status, updated_at desc)
  where assigned_to is not null;

create table if not exists public.market_dispute_messages (
  id uuid primary key default gen_random_uuid(),
  dispute_id uuid not null references public.market_disputes(id) on delete cascade,
  author_id uuid not null,
  audience text not null default 'participants'
    check (audience in ('participants','staff')),
  message_type text not null
    check (message_type in ('participant_reply','staff_reply','internal_note')),
  body text not null check (char_length(btrim(body)) between 2 and 2000),
  created_at timestamptz not null default now()
);

create index if not exists market_dispute_messages_thread_idx
  on public.market_dispute_messages(dispute_id, created_at);

alter table public.market_dispute_messages enable row level security;
revoke all on table public.market_dispute_messages from public, anon, authenticated;
grant select, insert, update, delete on table public.market_dispute_messages to service_role;

-- Keep queue timestamps correct even if a future server path inserts a message.
create or replace function public.touch_market_dispute_from_message()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  update public.market_disputes
  set
    status = case when status='open' then 'under_review' else status end,
    last_participant_response_at = case
      when new.message_type='participant_reply' then new.created_at
      else last_participant_response_at
    end,
    last_staff_response_at = case
      when new.message_type='staff_reply' then new.created_at
      else last_staff_response_at
    end,
    updated_at = greatest(updated_at, new.created_at)
  where id=new.dispute_id;
  return new;
end;
$$;

drop trigger if exists touch_market_dispute_from_message on public.market_dispute_messages;
create trigger touch_market_dispute_from_message
after insert on public.market_dispute_messages
for each row execute function public.touch_market_dispute_from_message();

revoke all on function public.touch_market_dispute_from_message() from public, anon, authenticated;
grant execute on function public.touch_market_dispute_from_message() to service_role;

-- The existing participant RPC intentionally omits assignment and staff workflow
-- fields. Staff uses the protected server route instead.
