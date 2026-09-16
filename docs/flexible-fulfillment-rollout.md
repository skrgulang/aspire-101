# Flexible Fulfillment rollout checklist

This checklist is for PR #91 (`feat/flexible-fulfillment-system`). It is intentionally fail-closed. Do not merge to `main`, apply production migrations, or enable real customer traffic until the preview checks below pass.

## 1. Preview database migration validation

Apply the PR migrations to a disposable/preview database in repository order and confirm there are no duplicate migration versions or function-order regressions.

Critical Flexible Fulfillment sequence:

1. `20260914210000_flexible_fulfillment_delivery.sql`
2. `20260914211000_delivery_payment_guard.sql`
3. `20260914212000_marketplace_fulfillment_preferences.sql`
4. `20260914213000_shipping_address_ownership.sql`
5. `20260914214000_delivery_closeout_bridge.sql`
6. `20260914215000_delivery_lifecycle_complete.sql`
7. `20260914216000_delivery_notifications_cancellation.sql`
8. `20260914217000_delivery_confirmation_payment_guard.sql`
9. `20260914218000_shipping_terms_lock.sql`
10. `20260914219000_shipping_handoff_guards.sql`
11. `20260914220000_delivery_match_terms_guard.sql`
12. `20260914220500_delivery_offer_lock_order.sql`
13. `20260914221000_delivery_code_entropy.sql`
14. `20260914223000_delivery_notification_dedupe.sql`
15. `20260914224000_shipping_notifications.sql`
16. `20260914225000_shipping_notification_transition_keys.sql`
17. `20260914225200_shipping_state_transition_guard.sql`
18. `20260914225500_delivery_open_cancel_integrity.sql`
19. `20260914226000_delivery_closeout_integrity.sql`
20. `20260914227000_delivery_status_transition_guard.sql`
21. `20260914228000_serialize_shipping_label_and_refund.sql`
22. `20260914228100_guard_label_claim_against_refund.sql`
23. `20260914228200_delivery_helper_privilege_hardening.sql`
24. `20260914228300_delivery_interaction_guard.sql`
25. `20260914228400_delivery_reward_minimum.sql`
26. `20260914228500_delivery_code_single_use.sql`
27. `20260914228600_serialize_payout_holds.sql`
28. `20260914228700_restore_notification_kind_compatibility.sql`
29. `20260914228800_serialize_protected_cancellation_with_payout.sql`
30. `20260914228900_freeze_shipping_after_financial_close.sql`

Verify migration version uniqueness before running anything. Shipping/refund serialization is finalized by `14228000` + `14228100`, direct access to the helper-verification probe is removed by `14228200`, the missing interaction helper required by Delivery RPCs is supplied by `14228300`, paid Aspirer rewards are kept at either $0 volunteer or at least $5 by `14228400`, replay of an already-used pickup/delivery code is rejected by `14228500`, payout-opening holds are serialized against provider release by `14228600`, production notification kinds accidentally narrowed by the Delivery migrations are restored by `14228700`, protected cancellation joins the same payment-first release serialization in `14228800`, and carrier state is frozen after disputed/refunded/cancelled/released financial closure by `14228900`.

Verify the final definitions, not just each intermediate migration: paid pickup confirmation must require a secured reward; delivery completion must require the Aspirer proof-backed confirmation plus the receiver/requester confirmation and must not release money; shipping terms must lock after checkout starts; shipping lifecycle must not move backward or mutate after financial close; delivery lifecycle must not skip or regress protected states; pre-match cancellation must not race through a newly matched request; refund and Shippo label claims must serialize on the protected payment; dispute/refund/resolution/cancellation holds must not open after provider release has already claimed the protected payment; authenticated clients must not have direct execute permission on sensitive helper probes; positive Aspirer reward terms must never fall below the supported $5 checkout minimum; and confirmation codes must be single-use.

### Preview validation record · 2026-09-15

A disposable Supabase Development Branch was repaired from the current `main` schema baseline and all PR #91 Flexible Fulfillment migrations through `20260914228900` were applied successfully. The exercise found migration/runtime issues that a frontend build would not detect: Supabase pgcrypto schema qualification for cryptographic delivery codes, nullable shipping-state handling, the missing `can_user_interact(uuid)` helper, direct helper-verification exposure, refund/label lock ordering, a mismatch between the $5 Delivery preset and the general $10 payment minimum, confirmation-code replay being reported as success, payout-hold races against provider release, a notification-kind compatibility regression that would have blocked existing Resolution Center notifications, and a late-carrier-update gap after dispute/release financial closure.

Database guard checks performed in preview include: shipping state cannot regress; disputed/refunded/cancelled/released orders reject later shipping-state mutations with `SHIPPING_ORDER_FINANCIALLY_CLOSED`; a surviving refund claim blocks label purchase; a started label purchase blocks instant refund; delivery status cannot jump protected stages; delivery completion requires Aspirer proof; paid delivery cannot start pickup or complete while its reward is unsecured; positive delivery offers below $5 are rejected by the database; eight wrong confirmation-code attempts exhaust the retry budget; a later correct code returns `CODE_LOCKED`; and a successfully used code now returns `CODE_ALREADY_USED` on replay.

Preview end-to-end Delivery checks include free, negotiable, fixed-paid, cancellation-ordering, competing-offer, and genuine multi-session concurrency flows. A negotiable $7 Aspirer offer was countered by the requester to $6; stale requester acceptance was rejected with `WAITING_FOR_ASPIRER`; the Aspirer accepted the $6 counter; and resulting request/connection terms were exactly 600 cents. A separate free delivery completed the full pickup/delivery/receiver-closeout lifecycle with zero `connection_payments` rows. A fixed $5 delivery was then run with a simulated preview `secured` payment using the current fee quote ($5.00 base, $0.99 requester fee, $5.99 customer total, $4.60 provider net): pickup, delivery proof, and receiver completion succeeded, while the payment deliberately remained `secured` with no transfer after lifecycle completion. This confirms lifecycle completion does not silently release money.

True multi-session Delivery races were then executed in separate PostgreSQL sessions using a preview-only pg_cron harness. In cancel-vs-accept, both transactions started at `04:07:00 UTC`; cancellation acquired the shared job-row lock and committed, while the concurrent acceptance waited and then failed with `OFFER_NOT_ACTIVE`. The final job/request state was `cancelled`, with no match or connection. In a separate competing-accept race, both accept transactions started within milliseconds of each other; exactly one offer committed, the job became `matched` to that Aspirer, the losing offer became `declined`, and the losing transaction failed with `OFFER_NOT_ACTIVE`. The scheduled test jobs were unscheduled after the run and synthetic users/requests were removed.

A separate synthetic shipping order validated the database-facing handoff/receipt boundary: with a secured protected payment, changing a locked destination failed with `SHIPPING_TERMS_LOCKED_AFTER_CHECKOUT`; seller handoff before label evidence failed with `SHIPPING_LABEL_REQUIRED`; handoff succeeded after label transaction/URL/tracking evidence was present; buyer receipt before carrier delivery failed with `CARRIER_DELIVERY_NOT_CONFIRMED`; and after `shipping_status = delivered`, buyer receipt moved the order to `release_ready`. Another synthetic disputed shipping order confirmed that a later direct/service-role attempt to move `shipping_status` from `in_transit` to `delivered` is rejected by the database with `SHIPPING_ORDER_FINANCIALLY_CLOSED`. Test users were removed after both runs.

Financial serialization now has both committed-order and genuine multi-session validation. Refund-vs-label committed ordering shows refund-first fails label with `REFUND_IN_PROGRESS` and label-first fails refund with `SHIPPING_REFUND_REQUIRES_RESOLUTION`; a true simultaneous refund-vs-label external-service run remains outstanding. For payout-vs-hold, two real concurrent PostgreSQL-session races were executed. In the release-first run, the release transaction and Resolution Center transaction started within milliseconds; release claimed and held the protected payment row while the Resolution Center transaction blocked, then failed with `PAYOUT_RELEASE_IN_PROGRESS` after release committed. In the reverse run, the Resolution Center hold acquired the same payment-row boundary first; the delayed concurrent release then failed with `PAYOUT_HOLD_OPEN`. Protected cancellation also remains serialized: release-first blocks cancellation with `PAYOUT_RELEASE_IN_PROGRESS`, while cancellation-first creates the required review and prevents a later release claim with `CONNECTION_CANCELLED`.

The preview-only `pg_cron`/`dblink` test extensions were used only to create independent database sessions for concurrency validation; no such test-only extension migration was added to PR #91 or production.

## 2. Aspirer Delivery test matrix

- [x] Free delivery: create → offer at $0 → accept → pickup code → delivery code → complete. Confirm no Stripe payment is created.
- [x] Fixed paid delivery DB lifecycle: create with $5 fixed reward → accept exact amount → confirm pickup is blocked before secured payment → simulate preview secured payment → pickup/deliver/complete. Confirm payment remains secured and no transfer is created by delivery completion. Real Stripe checkout/release remains a separate external-service gate.
- [x] Negotiable delivery: Aspirer offer → requester counter → Aspirer accepts requester counter. Confirm agreed reward equals request/connection terms exactly.
- [x] Counter ownership: only the opposite side from `last_actor_id` may accept current negotiated terms.
- [x] Competing offers committed-order validation: accepting one offer commits one match only, automatically declines the losing active offer, and a later loser acceptance fails with `OFFER_NOT_ACTIVE`.
- [x] Pre-match cancellation ordering: requester cancels an open job; active offers close and the affected Aspirer receives one stable cancellation notification.
- [x] True cancel-vs-accept and competing-offer simultaneous concurrency: separate DB sessions contended on the same job row; exactly one outcome committed and each loser failed closed with `OFFER_NOT_ACTIVE` after waiting for the winner transaction.
- [x] Post-match cancellation: direct Delivery cancellation fails/reroutes to protected connection/Resolution Center (`MATCHED_DELIVERY_USE_RESOLUTION`).
- [x] Confirmation-code abuse: wrong codes count down to zero, the next attempt returns `CODE_LOCKED`, and a successfully used code cannot be replayed (`CODE_ALREADY_USED`).
- [x] Closeout proof integrity: a delivered job without Aspirer confirmation is rejected.
- [x] Paid closeout integrity: an unsecured paid reward cannot complete.
- [x] Paid pickup guard: a matched paid delivery cannot move to `heading_to_pickup` before reward is secured.
- [x] Delivery status regression: direct/service-role protected-state jumps or terminal reopen attempts fail.
- [x] Privacy: pre-match private details are locked and a non-participant cannot read matched private handoff instructions.
- [x] Delivery Activity: overdue/time-sensitive ordering is present, payment lookup fails closed, requester sees secure-payment actions, and Aspirers no longer receive a Start pickup action while a positive protected reward is unsecured or unknown.
- [x] Delivery Board payment UI uses conservative copy when payment lookup is unknown, shows payment details for secured rewards, avoids a second release action after release, and now lets an Aspirer accept a requester counter inline.
- [x] Reward minimum: fixed/custom/negotiated positive rewards are at least $5; $0 remains explicit Free / Volunteer help.

## 3. Carrier Shipping test matrix

Use Shippo test mode in preview.

- [ ] Seller saves only origin; buyer saves only destination. Confirm Aspire stores opaque Shippo IDs rather than exact counterparty addresses.
- [ ] Seller creates rates only after both addresses are ready; buyer selects a rate; changing an address invalidates stale rate selection before payment.
- [ ] Checkout total = item + Aspire fee + selected carrier shipping. Seller payout excludes shipping and Aspire fee revenue excludes shipping.
- [x] After checkout/payment is secured, locked address/shipment/rate/carrier/service/fulfillment terms are guarded by `SHIPPING_TERMS_LOCKED_AFTER_CHECKOUT`; destination mutation was exercised directly in preview.
- [x] Seller cannot claim a label when protected payment is not secured at the database claim boundary.
- [ ] Label purchase is idempotent once transaction/label evidence exists.
- [ ] Paid selected rate expired/changed: fail closed and require reconciliation.
- [ ] Label purchase stuck >=10 minutes: persist exception/reconciliation state and never auto-buy a second label.
- [ ] Webhook unknown status: acknowledge/ignore without changing state.
- [x] Webhook/database out-of-order state guard: delivered never regresses; exception may recover forward.
- [ ] Webhook tracking-number mismatch: ignore without advancing lifecycle.
- [x] Carrier movement cannot mutate disputed/refunded/cancelled/released decisions: the webhook now acknowledges/records these updates without applying carrier state, and the database independently rejects shipping-status changes once the old order status is financially closed.
- [x] Carrier exception/return and later recovery notification behavior is transition-aware and deduped for unchanged retries.
- [x] Seller handoff requires attached label transaction/URL evidence and an allowed shipping status; seller handoff without label evidence returns `SHIPPING_LABEL_REQUIRED`.
- [x] Buyer receipt for shipping cannot be confirmed before carrier delivery (`CARRIER_DELIVERY_NOT_CONFIRMED`); after `delivered`, receipt advances the order to `release_ready`.
- [x] Reconciliation UI: `label_purchasing` explicitly warns against retrying; uncertain `exception` without attached carrier evidence routes to Resolution Center; normal carrier exceptions keep tracking/recovery guidance; `label_failed` displays fail-closed retry guidance.

## 4. Refund / dispute / payout integrity

- [x] Before label purchase/handoff, an eligible secured marketplace payment can acquire an instant-refund claim while shipping remains at `rates_ready` and no carrier evidence exists.
- [x] Once label purchase begins or carrier transaction/label/tracking evidence exists, instant refund is blocked and routes to reconciliation.
- [x] Refund API maps shipping-label serialization conflicts to controlled `409 SHIPPING_REFUND_REQUIRES_RESOLUTION`.
- [x] Shipping label route calls `claim_market_shipping_label_purchase()` immediately before external Shippo purchase, using payment-first lock ordering.
- [ ] True concurrent refund-vs-label external test. Both committed orders have been exercised and both claims share the payment-first boundary, but genuine simultaneous sessions remain outstanding.
- [x] A surviving `refund_claimed_at` remains fail-closed for label purchase.
- [x] Full marketplace refund code uses shipping-inclusive protected customer total.
- [x] Seller payout code transfers provider net only; carrier shipping is not added to seller payout.
- [x] Committed-order payout-vs-hold validation: release-first blocks new dispute/refund/Resolution Center/cancellation holds with `PAYOUT_RELEASE_IN_PROGRESS`; hold/cancellation-first prevents a later payout claim (`PAYOUT_HOLD_OPEN` or `CONNECTION_CANCELLED`).
- [x] True simultaneous multi-session payout-vs-hold: release-first caused the concurrent Resolution Center transaction to block and then fail with `PAYOUT_RELEASE_IN_PROGRESS`; the reverse hold-first run caused the concurrent release to fail with `PAYOUT_HOLD_OPEN`.
- [x] Delivery completion and marketplace receipt are lifecycle facts; neither silently releases protected money.

## 5. Privilege / privacy validation

- [x] Authenticated clients have SELECT-only access to `delivery_jobs` and `delivery_offers`; direct mutation remains service-role-only.
- [x] `delivery_private_locations` and `delivery_confirmation_secrets` are service-role-only tables.
- [x] Authenticated clients cannot directly execute `delivery_helper_is_verified(uuid)`.
- [x] Authenticated clients cannot directly execute `can_user_interact(uuid)`.
- [x] Private-handoff RPC rejects access before match and rejects non-participants after match.

## 6. Notifications and audit behavior

- [x] Delivery offer/counter/match/cancellation alerts persist with the relevant `delivery_job_id` and deep-link context.
- [x] Accepted offer and matched transitions keep Delivery and normal Connection notifications semantically separate rather than duplicating the same alert.
- [x] Shipping alerts carry the protected `connection_id` needed for transaction deep-linking.
- [x] Duplicate notification retries using the same `(user_id,event_key)` create one stored row only; unchanged shipping state creates no extra alert.
- [x] Meaningful recurring shipping incidents/recovery can create a new transition-keyed alert.
- [x] Notification trigger helpers are not browser-executable; trigger/helper execution remains on the database-owner path.
- [x] Existing production notification kinds (`connection_reminder`, `connection_coordination`, `resolution_case`) remain compatible with Delivery/Shipping kinds after `14228700`; Resolution Center case creation and its `resolution_case` notification were exercised in preview.
- [ ] Event/audit rows for every ignored webhook regression, tracking mismatch, and reconciliation-required external condition still need final Shippo test-mode E2E verification.

## 7. Deployment gates

Before PR #91 can leave Draft:

- [x] A recent audited PR head has a successful Vercel preview build; re-check after every new code commit.
- [x] Every Flexible Fulfillment migration version currently present is unique and ordered as documented above.
- [x] All current PR migrations through `20260914228900` have applied cleanly to the Development Branch.
- [ ] Remaining test matrices above pass in preview/test mode.
- [ ] Required preview environment variables are configured with test credentials (`SHIPPO_API_KEY`, webhook token, Stripe test configuration as applicable) for external-service E2E checks.
- [x] No production migration has been applied from the feature branch.
- [ ] A real-money Stripe intake test for the already-merged protected-payment core is completed separately before enabling real customer traffic.
- [ ] Production Shippo carrier accounts/allowlist are verified before enabling Carrier Shipping.

## 8. Rollback / fail-closed rules

- Never silently change a protected total after payment.
- Never retry an uncertain Shippo label purchase automatically.
- Never start a label purchase while a refund claim remains unresolved.
- Never instant-refund shipping once label purchase/evidence exists.
- Never let late carrier events mutate a disputed/refunded/cancelled/released order.
- Never open a new dispute/refund/Resolution Center/cancellation hold after provider payout release has already claimed the protected payment.
- Never auto-release a paid Aspirer reward solely because delivery proof succeeded.
- Never mark delivery completed unless both proof-backed participant confirmations exist.
- Never skip or regress delivery lifecycle states through direct table/service-role writes.
- Never unwind a matched/secured delivery through direct client cancellation.
- Never expose arbitrary users' email/phone verification state through helper RPCs.
- Never accept a positive paid Aspirer reward below $5 while checkout requires $5 or more.
- Never treat a used one-time confirmation code as a successful fresh confirmation.
- Never treat missing client-side payment status as proof the reward is unpaid.
- If financial, carrier, or lifecycle state is ambiguous, preserve holds and route to Resolution Center rather than guessing.