drop policy if exists "participants confirm own completion" on public.connection_completion_confirmations;

revoke all on table public.connection_completion_confirmations from authenticated;
grant select on table public.connection_completion_confirmations to authenticated;
