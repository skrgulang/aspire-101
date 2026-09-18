-- Trigger functions are invoked by PostgreSQL triggers, not by browser RPC clients.
-- Remove direct browser EXECUTE without changing trigger behavior. PostGIS-owned trigger
-- functions are intentionally excluded.

revoke all on function public.allow_claim_only_if_approved() from PUBLIC, anon, authenticated;
revoke all on function public.enforce_username() from PUBLIC, anon, authenticated;
revoke all on function public.guard_agreement_payment_terms() from PUBLIC, anon, authenticated;
revoke all on function public.guard_authenticated_request_moderation_fields() from PUBLIC, anon, authenticated;
revoke all on function public.guard_authenticated_request_status_transition() from PUBLIC, anon, authenticated;
revoke all on function public.guard_connection_payment_terms() from PUBLIC, anon, authenticated;
revoke all on function public.guard_request_fulfillment_methods() from PUBLIC, anon, authenticated;
revoke all on function public.guard_request_payment_terms() from PUBLIC, anon, authenticated;
revoke all on function public.normalize_username() from PUBLIC, anon, authenticated;
revoke all on function public.profiles_username_guard_tg() from PUBLIC, anon, authenticated;
revoke all on function public.profiles_username_norm_tg() from PUBLIC, anon, authenticated;
revoke all on function public.reject_public_request_coordinates() from PUBLIC, anon, authenticated;
revoke all on function public.set_task_created_by() from PUBLIC, anon, authenticated;
revoke all on function public.set_updated_at() from PUBLIC, anon, authenticated;
revoke all on function public.set_updated_at_tasks() from PUBLIC, anon, authenticated;
revoke all on function public.tasks_force_pending() from PUBLIC, anon, authenticated;
revoke all on function public.touch_updated_at() from PUBLIC, anon, authenticated;
