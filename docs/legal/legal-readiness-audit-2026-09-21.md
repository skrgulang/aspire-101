# Legal readiness audit — 2026-09-21

## Scope

Read-only review of the currently published legacy Privacy Policy and Terms of Service against the product that exists today. This is an operational gap audit, not legal advice. No public legal page was changed.

## Critical public Terms issue

The current public legacy Terms page is dated **2025-10-24** and still contains unresolved template placeholders in the governing-law section:

- `[Insert governing jurisdiction, e.g., Delaware, USA]`
- `[Insert venue, e.g., Wilmington, Delaware]`
- an arbitration note that explicitly says to state rules / seat / language if arbitration is used.

This should be resolved by the founder with qualified counsel before broad public launch or serious live transaction volume.

Do **not** silently replace the placeholders with Indiana, Delaware, or another jurisdiction without a deliberate legal decision.

## Entity naming

The public Privacy Policy currently identifies the data controller as “Aspire 101 (operating entity).”

Current corporate records identify **Cloudora Labs, Inc.** as the corporation and **Aspire 101** as its assumed business name / product.

A refreshed policy should use the exact legal entity / DBA relationship consistently.

## Privacy Policy is materially stale relative to current product

The current policy is also dated **2025-10-24** and predates major current functionality.

Current product/data flows include items that are not specifically described in the legacy policy, including:

- Stripe / Stripe Connect protected payments and seller/provider onboarding;
- payment state, fees, refunds, disputes, payout readiness, and transaction records;
- Stripe Identity-style verification metadata;
- phone verification used for higher-trust payment actions;
- temporary live location sharing between connection participants;
- marketplace delivery addresses and delivery instructions;
- shipping / tracking metadata;
- Resend transactional email lifecycle tracking;
- Datadog browser / reliability telemetry;
- Amplitude product analytics;
- moderation, Resolution Center evidence snapshots, and account-enforcement records;
- private marketplace/request media storage.

The policy does mention general hosting/database/storage/email/analytics providers, but the disclosure is too generic for the current product surface.

## Terms are also stale relative to current payment model

The legacy Terms say only that payments are handled by third-party processors and that fees are generally non-refundable.

The current product has substantially more specific behavior:

- platform fee quoting;
- protected checkout;
- seller/provider Stripe Connect onboarding;
- payout holds pending completion;
- refund / dispute paths;
- Resolution Center review;
- delivery / shipping choices;
- marketplace handoff / received states.

These product mechanics should be reviewed against the public Terms before opening Live Mode broadly.

## Age-language inconsistency

The legacy Terms require users to be **18+** (or higher age of majority), while the Privacy Policy says services are intended for users who meet the age of digital consent, “typically 16+.”

This is internally inconsistent and should be reconciled by counsel/product policy.

Until reconciled, do not make a new public age claim based on either page alone.

## Retention-language gaps

The public Privacy Policy currently specifies:

- account data: retained while active, then deleted/anonymized within a reasonable period after deletion unless required;
- join requests / resumes: typically up to 24 months;
- support / collaboration: typically up to 24 months;
- logs: briefly unless needed for investigations.

It does **not** currently specify retention treatment for:

- payment / transaction records;
- delivery addresses;
- connection messages;
- identity verification metadata;
- safety reports;
- Resolution Center records / evidence snapshots;
- live location data;
- moderation / enforcement records.

A retention schedule should be intentionally defined before the refreshed policy is published.

## Current deletion implementation

The current account-deletion implementation does several strong things:

- removes live location rows;
- deletes school / identity verification rows;
- deletes payment-account relationship rows;
- removes owned request media / drafts / avatars;
- scrubs request details / coordinates;
- scrubs authored response text;
- replaces authored connection-message bodies with a deletion marker;
- clears profile PII;
- removes preferences, trust/profile role rows, and other direct per-user records.

Deletion is blocked while active connections, unsettled payments, active orders, or open Resolution Center cases exist.

However, transactional / safety / counterparty records may need to remain for legal, accounting, fraud, safety, or dispute reasons. The public policy should describe this distinction accurately.

## Required decisions before publication

Founder / counsel should decide:

1. Exact legal entity naming and contact.
2. Governing law and venue.
3. Whether arbitration is used; if so, rules / seat / process.
4. Minimum age / student eligibility rules.
5. Refund / fee / Resolution Center legal language.
6. Marketplace role and user-to-user relationship language.
7. Retention periods by data category.
8. State / jurisdiction privacy disclosures actually applicable at launch.
9. Treatment of identity, location, shipping, and safety data.
10. Third-party processor disclosures / links as appropriate.

## Operational recommendation

Keep the current public policies unchanged until the replacement language is reviewed as a complete package. Avoid piecemeal edits that could create new contradictions.

The internal refresh draft should be treated as a requirements document for counsel, not as publish-ready legal advice.
