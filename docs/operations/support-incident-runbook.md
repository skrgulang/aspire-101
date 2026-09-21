# Aspire 101 support & incident runbook

## Purpose

This runbook defines how Aspire 101 should triage support, safety, payment, and platform incidents during the campus beta. It is an internal operating guide for Cloudora Labs, Inc.

## Primary queues

| Queue | Use for | Operator surface |
| --- | --- | --- |
| Support inbox | Bug reports, feature ideas, general feedback, collaboration requests, legacy abuse submissions | `/moderator` → Support |
| Safety queue | Harassment, scams, unsafe conduct, illegal activity, account abuse | `/moderator` → Safety |
| Resolution Center | No-show, cancellation, incomplete work, payment or transaction disputes | `/resolution` and moderator Resolution Center console |
| Post moderation | New or reported requests that need publication review | `/moderator` → Posts |
| Verification | Manual school-ID exceptions | `/moderator` → School IDs |

Human contact channels currently referenced by the product:

- `team@aspires101.com` for general / safety follow-up.
- `business@aspires101.com` for marketplace and business matters.

## Severity

### SEV-0 — immediate safety or major security incident

Examples: credible imminent physical danger reported through the platform, confirmed active account compromise affecting staff/admin access, confirmed exposure of secrets or private user data, widespread payment integrity failure moving money incorrectly.

Actions:

1. Stop or restrict the affected platform path if necessary to prevent further harm.
2. Preserve relevant audit records; do not delete transaction, moderation, or safety evidence.
3. For imminent physical danger, direct the affected person to local emergency or campus emergency services; Aspire is not an emergency-response service.
4. Rotate exposed credentials only after identifying dependent services so replacement does not silently break production.
5. Document timeline, scope, actions, and follow-up.

### SEV-1 — major user-impacting incident

Examples: sign-in unavailable, checkout unavailable, webhook failures preventing transaction state updates, widespread email verification failure, moderation access unavailable during active reports.

Target response: investigate immediately during active operating hours and prioritize restoration over feature work.

### SEV-2 — degraded feature or isolated financial/support issue

Examples: one user cannot complete a normal flow, a single Resolution Center case, one payout/onboarding problem, recurring UI error with a workaround.

Target response: same-day triage when possible.

### SEV-3 — normal support / product feedback

Examples: feature request, cosmetic issue, general question, non-urgent business inquiry.

Target response: batch review rather than interrupting incident work.

## Triage rules

- Safety reports stay separate from public reviews and product feedback.
- Filing a report or Resolution Center case does not itself establish fault.
- Do not move money based only on a support email or chat message. Use the existing Resolution Center / reviewed payment path.
- Do not request passwords, recovery codes, full payment-card data, or unnecessary identity documents through support.
- Avoid copying sensitive user content into external tools unless needed for the case.
- Do not publish support submissions containing personal information. Public ideas should be limited to appropriate feature, bug, or general-feedback submissions.
- Archive spam, malformed submissions, or completed support threads rather than deleting audit-relevant records.

## Payment issue workflow

1. Identify the Aspire transaction / connection record.
2. Check the current payment state in Aspire before relying on a user's description.
3. Confirm Stripe mode (test vs live) and transaction identifiers.
4. If a participant has an open Resolution Center case, keep protected payout release paused according to the application logic.
5. Refund or release actions require the existing reviewed workflow and applicable staff role.
6. For card disputes or fraud warnings, preserve the Stripe event and Aspire payment history.

## Email incident workflow

1. Confirm whether the issue is human mail (Namecheap Private Email) or transactional auth mail (Resend).
2. For auth mail, check Resend lifecycle events first: delivered, delayed, bounced, complained, failed, suppressed.
3. Do not repeatedly resend to a hard-bounced or suppressed address.
4. Check Supabase Auth timestamps when the issue is signup confirmation or recovery.
5. Keep auth-mail sender reputation separate from newsletters / bulk marketing.

## Platform outage workflow

1. Check `/api/health`.
2. Check the latest Vercel production deployment and runtime errors.
3. Check Datadog RUM for browser-side regressions.
4. Check Supabase project health if data-backed features fail.
5. Check third-party providers only for the affected path (Stripe, Resend, Shippo, etc.).
6. Record the first known failure time and the first confirmed recovery time.

## Support inbox actions

- **Publish idea**: only for safe, non-sensitive feature/bug/general feedback that is suitable for a public ideas board.
- **Archive**: completed, spam, private, collaboration, abuse, or otherwise non-public submissions.
- **Reopen**: return an archived item to the review queue.

Safety and payment cases should be moved to their dedicated workflow rather than handled as a public feedback item.

## After an incident

For SEV-0/SEV-1 incidents, record:

- What happened.
- User-visible impact.
- Start / detection / mitigation / recovery timestamps.
- Root cause if known.
- What data or money was affected, if any.
- What was changed.
- One or more prevention actions.

Do not label a suspected cause as confirmed until evidence supports it.
