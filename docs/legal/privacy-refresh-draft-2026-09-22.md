# Aspire 101 privacy refresh — internal drafting language — 2026-09-22

> Drafting aid only. Not approved for publication. This document translates current product behavior into plain-language disclosure candidates for founder/counsel review.

## Operator identity

Suggested concept:

> Aspire 101 is a product operated by Cloudora Labs, Inc. This policy describes how Cloudora Labs, Inc. processes information when people use Aspire 101 and related services.

## Verification

Suggested concept:

> Aspire may use school, phone, and identity-verification signals to protect accounts, reduce fraud, and support trust features. Some identity verification is performed by third-party verification providers. Aspire may receive and retain a verification result, status, provider reference, and related anti-fraud metadata. Where provider-hosted verification is used, Aspire should not need to store the user's full identity document merely to confirm the verification result.

Counsel/product check:
- confirm what Stripe Identity returns and what Aspire persists;
- confirm whether any raw verification images are ever copied into Aspire storage;
- state provider-specific retention only after verification.

## Analytics and product observability

Suggested concept:

> If a user enables optional analytics, Aspire may use Google Analytics, Amplitude, and Datadog to understand product usage, reliability, performance, and feature adoption. Aspire configures these tools to minimize sensitive content and does not intentionally send private messages, request text, full addresses, precise location, payment credentials, passwords, or identity documents as analytics event properties.

Product facts currently verified in code:
- analytics initializes only after optional analytics consent;
- Amplitude autocapture is disabled;
- Datadog session replay is disabled;
- Datadog interaction tracking is disabled;
- Datadog privacy mode is set to mask;
- analytics helper drops properties with sensitive-looking keys.

Do not promise that every third-party telemetry field is completely anonymous unless verified.

## Shipping and delivery

Use only when carrier shipping is launched:

> If a marketplace order uses carrier shipping, Aspire may process sender and recipient contact/address details, parcel measurements, carrier/service choices, shipping rates, label and tracking identifiers, and delivery status. Aspire may send information needed to quote, purchase, or track shipping to a shipping provider such as Shippo. Carrier providers process information under their own terms and privacy policies.

Current launch status:
- integration code exists;
- live Shippo carrier shipping is not being treated as a launch dependency right now;
- do not market this disclosure as proof that live labels are currently available.

## Temporary live location

Suggested concept:

> If a participant chooses to use a live coordination feature, Aspire may temporarily process precise location coordinates, accuracy information, and timestamps for the participants in that connection. Live location is intended for short-lived coordination, expires or is cleaned up, and should not be used as a product-analytics field.

Product/counsel check:
- confirm exact maximum expiry window shown in product;
- confirm visibility is limited to the connection participants.

## Email delivery

Suggested concept:

> Aspire uses email providers for account, transactional, support, and program communications. We may process delivery metadata such as delivery status, provider message identifiers, sender/recipient domains, timestamps, bounces, complaints, failures, and suppression status to diagnose delivery and protect sender reputation.

Current providers:
- Resend for transactional/auth delivery infrastructure;
- Namecheap Private Email for human/ambassador SMTP.

Do not imply that message bodies are retained in the operational webhook ledger; current Resend webhook persistence is intentionally minimized.

## Moderation, safety, and disputes

Suggested concept:

> Aspire may process reports, moderation decisions, trust signals, account-enforcement records, transaction state, participant statements, and relevant activity evidence to review safety issues, abuse, fraud, no-shows, cancellations, transaction disputes, or other Resolution Center cases. We may retain relevant records after an account or transaction closes when reasonably needed for safety, fraud prevention, accounting, dispute resolution, legal obligations, or platform integrity.

## Cookies / consent choices

Suggested concept:

> Aspire uses essential browser storage for sign-in and core preferences. Optional analytics are enabled only when the user chooses analytics. Users should be able to reopen Cookie Preferences later and change that choice.

Required product change before relying on this sentence:
- add a persistent footer/control that reopens the consent manager.

## Retention

Keep the current public wording principle-based until exact operational periods are approved.

Internal schedule:
`docs/privacy/data-retention-schedule-draft.md`

Do not publish the draft numbers until provider retention and legal/accounting requirements are confirmed.

## Age

Do not draft a number yet.

Founder/counsel decision required:
- choose one clear account-eligibility rule;
- enforce the same rule in signup;
- use exactly the same rule in Terms and Privacy;
- account for jurisdiction-specific mandatory rules where applicable.

## Governing law / disputes

This belongs in Terms rather than Privacy and remains a founder/counsel decision. Do not infer a state, venue, or arbitration framework from company incorporation alone.
