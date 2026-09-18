-- The production client now submits safety reports through submit_safety_report(...).
-- Retire direct table INSERT so validation/context checks/rate limits cannot be bypassed.

revoke insert on table public.safety_reports from authenticated;

drop policy if exists "users submit their own reports" on public.safety_reports;
