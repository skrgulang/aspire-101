# Aspire 101 seller / provider launch readiness audit

Date: 2026-09-21

## Scope

Read-only launch audit of the seller/provider payout and protected-payment path. No Stripe live configuration, payout schedule, bank information, connected accounts, webhook subscriptions, or money movement was changed.

## Current architecture

The application uses Stripe Connect for seller/provider payout accounts and separate charges/transfers for protected Aspire payments.

Seller/provider prerequisites enforced by the application:

1. Signed-in Aspire account.
2. Confirmed phone number for payment onboarding and payment creation.
3. Verified school identity.
4. Stripe Connect recipient onboarding completed.
5. Stripe transfer capability active and payouts enabled.
6. Seller listings pass Aspire moderation before becoming public.
7. Buyer payment is created only after the receiving account is rechecked against Stripe.
8. Provider release waits for the required completion state and fails closed when a refund, dispute, cancellation, or Resolution Center hold exists.

Bank and routing details are entered with Stripe and are not stored by Aspire.

## Live-mode status

- Stripe live account: charges enabled.
- Stripe live account: payouts enabled.
- Stripe live transfers capability: active.
- Production Stripe webhook: enabled at `/api/stripe/webhook`.
- Live connected seller/provider accounts visible in Stripe: 0.
- Live payout-account rows in Aspire: 0.
- Live protected-payment rows in Aspire: 0.
- Live payouts: 0.
- Live disputes: 0.

This is consistent with a production system that has not yet run a real marketplace seller transaction.

## Controlled live pilot gate

The server intentionally blocks Live Mode onboarding and checkout for users outside the server-side `STRIPE_LIVE_PILOT_USER_IDS` allowlist.

The code comment explicitly states that the guard should remain until controlled end-to-end live transaction, refund, and dispute drills have passed.

Do not remove this guard merely to make public launch appear open. A deliberate live pilot should be completed first.

## Sandbox evidence

Stripe sandbox currently contains 3 connected accounts with transfer capability active.

Aspire currently stores 2 sandbox `payment_accounts` rows, both marked READY and transfers-enabled. One of the two still reports future requirements due even though current transfer capability is active.

There is therefore one additional sandbox Stripe connected account that is not represented in Aspire's current `payment_accounts` table. Treat it as a likely old test artifact until its history is reviewed; do not delete it automatically.

Sandbox also contains prior payment/payout activity, confirming that the Connect path has been exercised before.

## Phone verification

Payments require `phone_confirmed_at`.

Current aggregate account state:

- 39 total auth users.
- 28 email-confirmed users.
- 9 school-verified users.
- 2 phone-confirmed users.

The current application has a phone verification UI using Supabase Auth phone-change OTP. Two confirmed phone accounts provide evidence that phone confirmation has worked previously, but provider configuration cannot be independently read through the current Supabase connector.

Before opening live payments broadly, perform a fresh production phone verification smoke test with a controlled account.

## Seller listing flow

The current seller composer:

- allows private drafts before payout onboarding is complete;
- requires Stripe payout status READY before submission for review;
- requires a real item photo;
- requires public city/state selling area rather than precise address;
- requires at least one fulfillment method;
- redirects Stripe onboarding back to the seller composer;
- refreshes payout state while Stripe review is pending.

The listing creation API independently rechecks school verification, account enforcement, active campus, and the live/test-matched Stripe payout account before inserting the listing.

## Buyer payment safety checks

Before creating Checkout, the server re-fetches the receiving Stripe account state rather than trusting the cached Aspire flag.

The payment route also checks:

- confirmed phone;
- verified school identity;
- confirmed/active connection;
- correct payer;
- marketplace order state;
- live/test mode isolation;
- locked mutually agreed price;
- fee quote and minimum order amount;
- shipping-rate and shipping-liability consistency;
- company fee invariant before a Stripe charge is created.

## Release / refund protection

Provider release uses a database claim boundary and rechecks financial holds before creating a Stripe transfer.

Open Resolution Center cases, refunds, disputes, and cancellation states can prevent payout release.

The code uses idempotency keys for Stripe transfer creation and has transfer-recovery logic for refund/dispute reconciliation.

## Current operating queues

At audit time:

- 1 post is pending moderation.
- 1 safety report is open.
- 0 Resolution Center cases are open.
- 0 support items are waiting for review.
- 1 transactional-email attention event exists in the last 24 hours; this is the deliberate Resend bounce test created during webhook validation, not evidence of a user delivery incident.

## Launch decision points

Before removing the live pilot allowlist, complete these controlled checks:

1. Fresh production phone OTP smoke test.
2. One approved pilot seller/provider completes live Stripe onboarding.
3. One small controlled live checkout verifies the exact customer charge, Aspire fee booking, and provider-net calculation.
4. Complete both sides of the connection/order and verify transfer release.
5. Verify bank-payout visibility in the seller's Stripe Express dashboard without changing the platform payout schedule.
6. Run a controlled refund path and verify Aspire + Stripe state reconciliation.
7. Validate the dispute/hold path using test/simulation where possible rather than intentionally creating a real card dispute.
8. Confirm no unexpected runtime errors, Stripe webhook failures, or orphaned live records remain.

## Items that do not require action now

The following are not current payment blockers:

- Stripe live account branding fields are blank.
- Stripe business support email / support URL are blank.
- The platform Stripe account payout schedule is manual.

Those can be reviewed later as business/branding choices. They should not be changed as part of seller-flow debugging.
