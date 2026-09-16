-- Flexible Fulfillment extends notifications; it must not remove notification kinds
-- that already exist on main. The earlier Delivery migration rebuilt the CHECK
-- constraint with only the legacy core + Delivery kinds and accidentally omitted
-- connection reminders/coordination and Resolution Center alerts.

alter table public.notifications
  drop constraint if exists notifications_kind_check;

alter table public.notifications
  add constraint notifications_kind_check
  check (kind in (
    'request_response',
    'connection_chosen',
    'connection_confirmed',
    'connection_completed',
    'connection_cancelled',
    'message',
    'circle_mutual',
    'connection_reminder',
    'connection_coordination',
    'resolution_case',
    'delivery_offer',
    'delivery_counter',
    'delivery_matched',
    'delivery_status',
    'delivery_cancelled',
    'shipping_status'
  ));
