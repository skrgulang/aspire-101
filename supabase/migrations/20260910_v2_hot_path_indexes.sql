-- Aspire 101 V2 hot-path indexes — 2026-09-10
-- Cover the foreign keys most frequently used by campus feed, inbox, messaging,
-- payment, and notification queries.

create index if not exists requests_poster_created_idx
  on public.requests (poster_id, created_at desc);

create index if not exists request_media_request_sort_idx
  on public.request_media (request_id, sort_order);

create index if not exists request_media_uploader_created_idx
  on public.request_media (uploader_id, created_at desc);

create index if not exists request_responses_responder_created_idx
  on public.request_responses (responder_id, created_at desc);

create index if not exists connections_requester_created_idx
  on public.connections (requester_id, created_at desc);

create index if not exists connections_responder_created_idx
  on public.connections (responder_id, created_at desc);

create index if not exists connection_messages_sender_created_idx
  on public.connection_messages (sender_id, created_at desc);

create index if not exists connection_payments_request_idx
  on public.connection_payments (request_id);

create index if not exists notifications_actor_idx
  on public.notifications (actor_id)
  where actor_id is not null;

create index if not exists notifications_connection_idx
  on public.notifications (connection_id)
  where connection_id is not null;

create index if not exists notifications_request_idx
  on public.notifications (request_id)
  where request_id is not null;

create index if not exists notifications_response_idx
  on public.notifications (response_id)
  where response_id is not null;

create index if not exists notifications_message_idx
  on public.notifications (message_id)
  where message_id is not null;
