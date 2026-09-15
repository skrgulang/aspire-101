-- Database-level lifecycle guard for Aspirer Delivery.
-- RPCs already validate transitions, but service-role writes and future routes must not
-- be able to skip proof/payment gates or move an active delivery backwards.

create or replace function public.guard_delivery_job_status_transition()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.status is not distinct from new.status then
    return new;
  end if;

  if old.status in ('completed','cancelled') then
    raise exception 'DELIVERY_STATUS_IS_TERMINAL';
  end if;

  if not (
    (old.status = 'looking_for_aspirer' and new.status in ('offer_received','cancelled'))
    or (old.status = 'offer_received' and new.status in ('looking_for_aspirer','matched','cancelled'))
    or (old.status = 'matched' and new.status in ('heading_to_pickup','picked_up'))
    or (old.status = 'heading_to_pickup' and new.status = 'picked_up')
    or (old.status = 'picked_up' and new.status in ('on_the_way','delivered'))
    or (old.status = 'on_the_way' and new.status = 'delivered')
    or (old.status = 'delivered' and new.status = 'completed')
  ) then
    raise exception 'INVALID_DELIVERY_STATUS_TRANSITION: % -> %', old.status, new.status;
  end if;

  return new;
end;
$$;

revoke all on function public.guard_delivery_job_status_transition() from public, anon, authenticated;

drop trigger if exists trg_guard_delivery_job_status_transition on public.delivery_jobs;
create trigger trg_guard_delivery_job_status_transition
before update of status on public.delivery_jobs
for each row execute function public.guard_delivery_job_status_transition();
