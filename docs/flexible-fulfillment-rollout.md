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

Verify migration version uniqueness before running anything. The shipping notification transition and shipping state guard deliberately use different versions (`14225000` and `14225200`), delivery cancellation integrity comes after them at `14225500`, the final closeout/lifecycle guards are `14226000` and `14227000`, shipping refund/label serialization is finalized by `14228000` + `14228100`, and direct access to the helper-verification probe is removed by `14228200`.

Verify the final definitions, not just each intermediate migration: paid pickup confirmation must require a secured reward; delivery completion must require the Aspirer proof-backed confirmation plus the receiver/requester confirmation and must not release money; shipping terms must lock after checkout starts; shipping lifecycle must not move backward; delivery lifecycle must not skip or regress protected states; pre-match cancellation must not race through a newly matched request; refund and Shippo label claims must serialize on the protected payment; the final negotiation functions must use delivery-job-first locking; and authenticated clients must not have direct execute permission on `delivery_helper_is_verified(uuid)`.

### Preview validation record · 2026-09-15

A disposable Supabase Development Branch was repaired from the current `main` schema baseline and all PR #91 Flexible Fulfillment migrations through `20260914228200` were applied successfully. The exercise found and fixed two migration-only issues that a frontend build would not detect: `delivery_new_code()` now calls `extensions.gen_random_bytes(2)` for Supabase's pgcrypto schema, and the shipping state guard now handles nullable fulfillment methods safely while blocking `exception -> label_failed` regression.

Database guard checks performed in preview include: in-transit cannot regress to label-purchased, exception cannot regress to label-failed, exception can recover to in-transit/delivered, delivered is terminal, a surviving refund claim blocks label purchase, a started label purchase blocks instant refund, delivery status cannot jump matched -> delivered, delivery completion requires the Aspirer proof confirmation, and a paid delivery cannot complete after the reward stops being secured/released. Temporary test records were removed after validation.

## 2. Aspirer Delivery test matrix

Run each case with two distinct test users unless the case explicitly checks self-delivery rejection.

- Free delivery: create → offer at $0 → accept → pickup code → delivery code → complete. Confirm no Stripe payment is created.
- Fixed paid delivery: create with fixed reward → accept exact amount → confirm helper cannot head to pickup before payment is secured → secure payment → pickup/deliver/complete → explicit payout release only after completion requirements.
- Negotiable delivery: Aspirer offer → requester counter → Aspirer accepts the requester counter from Delivery Manage. Also test requester accepting an Aspirer offer/update. Confirm agreed reward equals request/connection/payment terms exactly.
- Counter ownership: only the opposite side from `last_actor_id` may accept the current negotiated amount; stale requester/Aspirer acceptance must fail.
- Competing offers: accept one while another offer is withdrawn/countered concurrently. Confirm one match only, no deadlock, losing offers declined.
- Pre-match cancellation: requester cancels an open job; active offers close and notifications are emitted once.
- Cancel-vs-accept race: run requester cancellation while an offer is being accepted. Exactly one outcome may commit; if the match wins, cancellation must route to Resolution Center instead of unwinding it.
- Post-match cancellation: direct Delivery cancellation must fail/reroute to the protected connection/Resolution Center path. A secured reward must not be automatically refunded or released.
- Confirmation-code abuse: wrong codes increment attempts and stop at the configured limit; used codes cannot be reused.
- Closeout proof integrity: force/test a `delivered` job without a responder/Aspirer completion confirmation and confirm `delivery_complete` rejects it with `ASPIRER_DELIVERY_CONFIRMATION_REQUIRED`.
- Paid closeout integrity: a paid delivery with a reward that is no longer `secured`/`released` must not be completed through the delivery RPC.
- Delivery status regression: direct/service-role attempts to jump `matched → delivered`, regress `picked_up → matched`, or reopen `completed/cancelled` must fail at the database trigger.
- Privacy: unmatched/public users never receive exact pickup/drop-off instructions.
- Delivery Activity: overdue jobs show `OVERDUE`, jobs due within two hours show `TIME-SENSITIVE`, and already secured/released rewards do not continue to show a stale “Secure reward” action.
- Delivery Board payment UI: secured rewards show payment details, released rewards do not offer a second release action, and payment-status lookup failure uses conservative review copy rather than claiming the reward is unpaid.

## 3. Carrier Shipping test matrix

Use Shippo test mode in preview.

- Seller saves only origin; buyer saves only destination. Confirm Aspire stores opaque Shippo IDs rather than exact counterparty addresses.
- Seller creates rates only after both addresses are ready; buyer selects a rate; changing an address invalidates stale rate selection before payment.
- Checkout total = item + Aspire fee + selected carrier shipping. Seller payout excludes shipping and Aspire fee revenue excludes shipping.
- After checkout starts, direct/API attempts to alter address, shipment, selected rate, carrier/service, or fulfillment method must fail.
- Seller cannot buy a label before protected payment is secured.
- Label purchase is idempotent once a transaction/label exists, even after tracking progresses to transit/delivered/exception.
- Paid selected rate expired or changed: fail closed and require reconciliation; do not silently requote/recharge.
- Label purchase stuck for >=10 minutes: persist `exception`, create `shipping_label_reconciliation_required`, return `LABEL_RECONCILIATION_REQUIRED`, and never auto-buy a second label.
- Webhook unknown status: acknowledge/ignore without changing shipping state.
- Webhook out of order: delivered never regresses; in-transit/exception never regress to label-purchased; exception may recover to in-transit/delivered.
- Database direct-write regression: attempt to move a shipment backward outside the webhook route and confirm the shipping state trigger blocks it.
- Webhook tracking-number mismatch: ignore the event and do not advance order lifecycle.
- Carrier movement can bridge a still-paid order to seller handoff, but must never overwrite disputed/refunded/cancelled/released lifecycle decisions.
- Carrier exception/return creates an attention alert; a later recovery and a genuinely new later exception may each create a meaningful transition alert without retry spam.
- Buyer receipt for shipping cannot be confirmed before carrier delivery.

## 4. Refund / dispute / payout integrity

- Before label purchase and before handoff, an eligible secured marketplace payment may use the instant-refund path.
- Once label purchase begins, or any shipping transaction/label/tracking evidence exists, do not use instant refund; route to Resolution Center reconciliation.
- Refund API must return a controlled `409 SHIPPING_REFUND_REQUIRES_RESOLUTION` response for `label_purchasing` and database serialization conflicts rather than surfacing an internal error.
- Refund-vs-label race: start instant refund and seller label purchase concurrently. Exactly one claim may win. If refund wins, `label_purchasing` must be rejected before Shippo is called; if label purchase wins, refund claim must fail with shipping reconciliation required. Never allow a Stripe refund and a new Shippo label charge for the same secured state.
- A surviving `refund_claimed_at` is fail-closed for label purchase even after five minutes; it must be reconciled rather than aged out by the shipping flow.
- Full marketplace refund uses the shipping-inclusive protected customer total.
- Seller payout transfers provider net only; carrier shipping is not added to seller payout.
- Open dispute/resolution/refund claims must serialize against payout release.
- Delivery completion and marketplace receipt are lifecycle facts; neither may silently bypass the existing protected-money release endpoint.
- A completed paid Aspirer delivery may remain `secured` while payout setup or a Resolution Center hold blocks transfer; do not move it back into the active delivery lifecycle solely because money has not released.

## 5. Notifications and audit behavior

- Delivery offer/counter/match/status/cancellation alerts deep-link to the relevant delivery.
- Accepted offer and matched-state transitions do not generate redundant duplicate notifications for the same user action.
- Shipping alerts deep-link to the protected order/transaction.
- Duplicate webhook retries or unchanged delivery state must not create duplicate user alerts.
- Meaningful recurring shipping incidents (for example exception → recovered → exception) may create a new alert.
- Event/audit rows should capture ignored regressions, tracking mismatches, and reconciliation-required conditions without changing financial state.

## 6. Deployment gates

Before PR #91 can leave Draft:

- Latest PR head has a successful Vercel preview build.
- Every Flexible Fulfillment migration version is unique and ordered as documented above.
- All new migrations apply cleanly to a preview database from the current `main` schema state.
- The test matrices above pass in preview/test mode.
- Required preview environment variables are configured with test credentials (`SHIPPO_API_KEY`, webhook token, Stripe test configuration as applicable).
- No production migration has been applied from the feature branch.
- A real-money Stripe intake test for the already-merged protected-payment core is completed separately before enabling real customer traffic.
- Production Shippo carrier accounts/allowlist are verified before enabling Carrier Shipping.

## 7. Rollback / fail-closed rules

- Never compensate for a post-payment rate change by silently changing the protected total.
- Never retry an uncertain Shippo label purchase automatically.
- Never start a new Shippo label purchase while any refund claim remains unresolved.
- Never instant-refund a shipping order once label purchase has started or any carrier transaction/label/tracking evidence exists.
- Never auto-release a paid Aspirer reward solely because a delivery confirmation code succeeded.
- Never mark a delivery completed unless both proof-backed participant confirmations exist.
- Never skip or regress Aspirer Delivery lifecycle states through a direct table/service-role write.
- Never unwind a matched/secured delivery through a direct client-side cancellation.
- Never expose arbitrary users' email/phone verification status through a directly executable helper RPC.
- Never treat a missing client-side payment status lookup as proof that a reward is unpaid.
- If financial, carrier, or lifecycle state is ambiguous, preserve payment/payout holds and route the case to Resolution Center rather than guessing.
