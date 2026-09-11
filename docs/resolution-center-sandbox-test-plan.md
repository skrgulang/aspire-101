# Aspire Resolution Center — Sandbox Acceptance Plan

This checklist is intentionally run only against an isolated Supabase development database and Stripe test mode. Do not point these scenarios at production users, production payments, or live Stripe funds.

## Test actors

- **Requester / payer** — verified student account that creates the paid request.
- **Provider / payee** — verified student account with a Stripe test connected account ready for transfers.
- **Aspire admin** — test account with the `admin` role used only for Resolution Center decisions.

Use a fresh paid-help connection for each destructive payment scenario so one case cannot hide another failure.

## A. Mutual schedule agreement

1. Create and mutually confirm a connection with an agreed time.
2. Requester proposes a new time/place.
3. Confirm the original connection schedule does **not** change yet.
4. Confirm Provider receives a coordination notification.
5. Provider declines the proposal.
6. Confirm the original agreed time remains unchanged and a decline event appears in the timeline.
7. Requester proposes another time.
8. Provider accepts it.
9. Confirm the connection schedule changes only after acceptance.
10. Confirm reminders and the no-show clock now reference the newly accepted time.
11. From a normal authenticated client, confirm the legacy `set_connection_schedule` RPC cannot be executed directly.

**Pass condition:** one participant cannot silently move the agreed time used for reminders or no-show review.

## B. Secured payment + provider no-show refund

1. Requester chooses Pay with Aspire and completes Stripe test checkout.
2. Wait for webhook confirmation and confirm `connection_payments.status = secured`.
3. Confirm the UI says the payment is secured and provider payout has not been released.
4. Set an agreed start time that allows the no-show scenario to be tested.
5. Before the 10-minute grace period expires, attempt to open a `no_show` case.
6. Confirm the server rejects the early no-show report.
7. After the grace period, Requester opens a provider `no_show` case.
8. Confirm one open Resolution Center case exists and the payment UI changes to **Payment protected · payout paused**.
9. Attempt provider payout release while the case is open.
10. Confirm release returns `RESOLUTION_CASE_OPEN` and no Stripe transfer exists.
11. Provider adds a factual response to the case.
12. Confirm Requester receives a Resolution Center notification and both statements are visible to review staff.
13. Admin issues a full refund.
14. Confirm Stripe test refund succeeds once and the Aspire payment becomes `refunded`.
15. Retry the same refund action and confirm idempotent behavior rather than a second refund.
16. Confirm the case becomes `resolved_refund`, the connection closes as designed, both users receive the outcome notification, and the history remains visible at `/resolution`.
17. Confirm a no-show incident is recorded only after the reviewed provider no-show refund outcome.

**Pass condition:** payer receives one refund, provider receives no transfer, case history remains auditable, and retries do not duplicate money movement.

## C. Provider-side no-show / cancellation claim

1. Start a separate secured paid connection.
2. Provider opens a requester no-show or cancellation case through **Get help** rather than the explicit self-cancel action.
3. Confirm payout is paused while the case is open.
4. Confirm the provider cannot self-award money from the case.
5. Confirm the automatic full-refund route refuses to treat an ordinary provider-owned compensation case as a customer refund request.
6. Review the case from the moderator/admin console.

**Pass condition:** an ordinary provider-side claim is review-only until Aspire has a pre-disclosed compensation policy and safe partial-transfer/refund implementation.

## D. Explicit participant cancellation — no secured payment

1. Start a confirmed connection with no secured Pay with Aspire payment.
2. Click **Can’t make it** first and confirm only a coordination event is created; the connection remains active and can still be rescheduled.
3. Open **Cancel connection**.
4. Confirm the modal clearly says cancellation is different from no-show and requires an acknowledgement checkbox.
5. Cancel with an optional note.
6. Confirm the connection becomes `cancelled`.
7. Confirm pending schedule proposals are superseded and any active temporary location rows are removed.
8. Confirm a `connection_cancelled` event records the cancelling participant and optional note.
9. Confirm the other participant receives a cancellation notification.
10. Confirm no Resolution Center case is invented when no secured protected payment exists.

**Pass condition:** an explicit cancellation is timestamped, attributable to the cancelling participant, and remains distinct from both “Can’t make it” and a no-show allegation.

## E. Explicit participant cancellation — secured protected payment

1. Start a fresh paid connection and confirm payment status is `secured` with no Stripe transfer.
2. Have either participant choose **Cancel connection**.
3. Confirm the connection becomes `cancelled`, but the payment does **not** automatically refund or release.
4. Confirm a cancellation Resolution Center case is created, or an already-open case is preserved rather than duplicated.
5. Confirm the case evidence contains the cancelling actor and `voluntary_cancellation = true`.
6. Confirm provider payout remains blocked while the case is open.
7. If the Provider/payee was the participant who explicitly cancelled, have an admin review the evidence and issue a full refund to the original payer.
8. Confirm the refund route accepts only this narrow captured provider self-cancellation exception, remains admin-only, and still uses Stripe idempotency.
9. Confirm the Provider receives no automatic compensation merely for cancelling.
10. Repeat with the Requester/payer cancelling and confirm Aspire still requires case review rather than automatically inventing a cancellation fee or provider award.

**Pass condition:** secured money never moves merely because someone clicked Cancel; the record pauses payout and gives Aspire a reviewable, first-party cancellation fact.

## F. Cancellation payment-state guards

1. Create a payment in `checkout_created` or `processing` state and attempt **Cancel connection**.
2. Confirm cancellation is blocked until Stripe settles the payment state, preventing a race between cancellation and checkout/webhook processing.
3. Complete a separate payment through provider release and attempt direct cancellation.
4. Confirm the direct cancellation RPC refuses a `released` payment and routes the user to Resolution Center/manual reconciliation instead.
5. Create or simulate a `disputed` payment and repeat.
6. Confirm direct cancellation is refused while the card/payment dispute is active.

**Pass condition:** direct cancellation cannot create ambiguous money state while checkout is unsettled, after provider transfer, or during a card dispute.

## G. Dismissed claim

1. Start a secured paid connection and open an issue.
2. Confirm payout release is blocked.
3. Moderator/admin dismisses the case with a factual note.
4. Confirm the case becomes `dismissed` and both participants are notified.
5. For a still-active connection, complete both sides of the task.
6. Confirm an otherwise-eligible payout can proceed after the case is closed.
7. For an explicitly cancelled connection, confirm dismissal closes the claim record but does not silently reactivate the cancelled connection.

**Pass condition:** case closure removes the claim hold without rewriting the underlying connection history.

## H. Already-released payment

1. Complete a fresh connection normally and release the provider payout in Stripe test mode.
2. Confirm the payment is `released` and has a Stripe transfer ID.
3. Attempt to use the Resolution Center automatic full-refund path.
4. Confirm the API refuses the automatic refund and requires manual reconciliation/transfer reversal handling.
5. Attempt direct participant cancellation and confirm it is also refused for the released payment.

**Pass condition:** Aspire never creates a customer refund while accidentally leaving already-transferred provider funds unreconciled.

## I. Card-network dispute distinction

1. Use Stripe test tooling to create a card dispute where supported.
2. Confirm the payment is represented as `disputed` rather than an internal Resolution Center refund.
3. Confirm payout/refund/cancellation actions do not encourage a duplicate money movement while the card dispute is unresolved.
4. Confirm user-facing copy clearly distinguishes a payment dispute from an Aspire participant claim.

**Pass condition:** internal claims and Stripe/card-network disputes cannot accidentally trigger duplicate remedies.

## J. Privacy and evidence

- No location permission is requested merely by opening a case or cancelling a connection.
- A user can file a claim or cancel without sharing live location.
- Explicit cancellation removes active temporary location rows for that connection.
- Expired live-location rows are cleaned up by the reminder/cleanup path.
- Trust & Safety can review agreed schedule, coordination events, participant statements, payment state, cancellation actor, and other platform records without treating location as mandatory evidence.
- Raw report count alone does not automatically suspend an account.

## Release gate

Do not merge the Resolution Center into a production release until:

- the regression script passes;
- Vercel preview build passes;
- scenarios A–J pass in an isolated Supabase branch + Stripe test mode;
- payout release, cancellation guards, and refund idempotency are verified;
- payment-production hardening changes are reconciled;
- production migrations are reviewed separately before application.
