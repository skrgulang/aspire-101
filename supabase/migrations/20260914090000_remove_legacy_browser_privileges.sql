-- Retire legacy browser tables and remove capabilities that browser roles never need.
revoke truncate, references, trigger on all tables in schema public from anon, authenticated;
alter default privileges in schema public revoke truncate, references, trigger on tables from anon, authenticated;

revoke all on table
  public.tasks,
  public.task_claims,
  public.task_claim_counts,
  public.task_messages,
  public.task_rooms,
  public.task_swipes,
  public.tasks_public,
  public.chat_rooms,
  public.chat_messages,
  public.posts,
  public.listings,
  public.orders
from anon, authenticated;

revoke all on table public.banned_patterns, public.banned_words from anon, authenticated;

revoke all on table public.support_feedback from anon, authenticated;
grant select, insert on table public.support_feedback to authenticated;

revoke execute on function public.claim_task(uuid) from anon, authenticated;
revoke execute on function public.get_or_create_room(uuid) from anon, authenticated;
revoke execute on function public.list_pending_tasks() from anon, authenticated;
revoke execute on function public.list_pending_tasks(integer, integer) from anon, authenticated;
revoke execute on function public.moderate_task(uuid, boolean, text) from anon, authenticated;
