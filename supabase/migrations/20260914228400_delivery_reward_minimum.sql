-- Keep paid Aspirer Delivery rewards aligned with the checkout policy.
-- Free/volunteer rewards remain exactly zero; positive rewards must be at least $5.

alter table public.delivery_jobs
  drop constraint if exists delivery_jobs_reward_minimum_check;

alter table public.delivery_jobs
  add constraint delivery_jobs_reward_minimum_check
  check (
    (reward_mode <> 'fixed' or reward_cents >= 500)
    and (agreed_reward_cents is null or agreed_reward_cents = 0 or agreed_reward_cents >= 500)
  );

alter table public.delivery_offers
  drop constraint if exists delivery_offers_reward_minimum_check;

alter table public.delivery_offers
  add constraint delivery_offers_reward_minimum_check
  check (amount_cents = 0 or amount_cents >= 500);
