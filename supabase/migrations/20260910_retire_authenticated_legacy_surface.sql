-- Retire the pre-V2 browser/Data API surface without deleting legacy data.
-- Modern V2 uses requests/connections/connection_messages/market_* instead.
-- service_role/admin database access is intentionally unchanged for rollback and audit.

revoke select, insert, update, delete on table
  public.tasks,
  public.task_claims,
  public.task_messages,
  public.task_rooms,
  public.task_swipes,
  public.chat_rooms,
  public.chat_messages,
  public.posts,
  public.listings,
  public.orders,
  public.transactions,
  public.wallets,
  public.user_balances
from authenticated;

-- Retire pre-V2 task RPC entry points from ordinary signed-in clients.
-- The functions remain present in the database; only direct authenticated execution is removed.
revoke execute on function public.claim_task(uuid) from authenticated;
revoke execute on function public.get_or_create_room(uuid) from authenticated;
revoke execute on function public.list_pending_tasks() from authenticated;
revoke execute on function public.list_pending_tasks(integer, integer) from authenticated;
revoke execute on function public.moderate_task(uuid, boolean, text) from authenticated;
