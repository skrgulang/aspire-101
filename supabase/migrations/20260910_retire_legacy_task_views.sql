-- Close the remaining pre-V2 task views from browser/Data API roles.
-- Keep the views themselves for database-level rollback/audit.
revoke select on table public.tasks_public from anon, authenticated;
revoke select on table public.task_claim_counts from anon, authenticated;
