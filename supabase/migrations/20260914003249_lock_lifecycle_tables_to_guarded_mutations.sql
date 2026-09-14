revoke insert, update, delete, truncate, references, trigger
on table
  public.connection_cancellations,
  public.connection_circle_choices,
  public.connection_message_reads,
  public.connection_no_show_incidents,
  public.connection_resolution_cases,
  public.connection_resolution_responses,
  public.connection_reviews,
  public.market_disputes,
  public.market_order_events,
  public.market_orders
from authenticated;

revoke insert, update, delete, truncate, references, trigger
on table
  public.connection_circle_choices,
  public.connection_message_reads,
  public.connection_reviews
from anon;
