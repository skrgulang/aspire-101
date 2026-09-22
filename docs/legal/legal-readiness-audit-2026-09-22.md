# Aspire 101 legal / privacy readiness audit — 2026-09-22

> Internal product/legal readiness document for Cloudora Labs, Inc. This is not legal advice and is not a customer-facing policy. Do not publish legal language from this file without founder/counsel review.

## Executive summary

The public legal pages are materially better than the older issue description suggests, but they are not ready to be treated as final broad-launch legal terms.

Current public pages are dated **September 12, 2026**, not October 2025. They already cover the core request/response model, marketplace payments, trust signals, moderation, and Resolution Center at a high level.

The remaining work is mostly about precision and consistency:

1. finalize governing law / venue / dispute language;
2. make privacy disclosures match the actual 2026 provider and data flows;
3. explicitly describe verification, shipping/address, temporary live-location, analytics/observability, and email-delivery data;
4. make the age rule explicit and consistent across signup, Terms, and Privacy;
5. provide a persistent way to reopen analytics consent choices;
6. reconcile the public retention statement with the internal retention schedule before publishing specific periods.

## Current public Terms

File: `app/terms/page.tsx`

### Already covered

- Aspire is a coordination/discovery platform rather than the provider of offline services.
- Account responsibilities and enforcement.
- Prohibited conduct.
- Response / mutual-connection model.
- Meetups and safety.
- Reviews/trust signals.
- In-product payment model and third-party payment provider role.
- Marketplace / Resolution Center cross-references.
- User content and platform IP.
- General third-party service language.
- General limitation/disclaimer language.
- Suspension/termination.

### Still unresolved

#### Governing law / dispute framework

Section 13 currently says that governing law, venue, and any arbitration provisions should be confirmed before paid or broad public launch.

That is an appropriate internal warning but not a final dispute clause. Founder/counsel must decide:

- governing-law state;
- court venue;
- whether arbitration is used;
- small-claims carve-out;
- class-action waiver, if any;
- opt-out mechanics, if arbitration is used;
- how mandatory consumer rights are preserved.

Do not invent or publish these terms without review.

#### Eligibility / age

Terms currently use a generic rule: users must satisfy the minimum age required by law and any registration requirement.

Privacy says Aspire is designed for college communities and is not directed to children.

This removes the prior direct 18+/16+ contradiction, but it still leaves the actual Aspire eligibility rule undefined. The final rule should be one explicit product rule enforced consistently at signup and in both policies.

#### Shipping

Terms describe marketplace transactions but do not clearly explain third-party carrier shipping, shipping labels, tracking, delivery-address sharing, or when carrier terms apply.

Because Shippo live carrier shipping is not yet enabled, final language can be held until the feature is actually launched. Do not imply live Shippo availability before then.

## Current public Privacy Policy

File: `app/privacy/page.tsx`

### Already covered

The current policy already describes:

- account/profile information;
- request and response activity;
- messages and support submissions;
- trust/feedback/moderation signals;
- payment and transaction metadata;
- technical/browser information;
- optional work/ambassador submissions;
- optional location use;
- payment/refund/payout/Resolution Center purposes;
- broad categories of service providers;
- security;
- general retention;
- privacy choices and deletion requests.

### Gaps against actual product behavior

#### Analytics and observability providers

Actual code initializes analytics only after `aspire-cookie-consent.analytics === true`.

Current providers in code:

- Google Analytics (GA4)
- Amplitude
- Datadog RUM

Datadog is configured with session replay disabled, user-interaction tracking disabled, resource/long-task tracking enabled, and default privacy masking. Product analytics code blocks sensitive property names and does not intentionally send free-form request/message/address/location content.

The public Privacy Policy currently refers only to generic "analytics" providers. A final revision should identify these providers/categories with enough specificity for the jurisdictions where Aspire operates.

#### Consent management

`CookieBanner.tsx` stores the choice in local storage and supports Accept All / Manage / essential-only choices.

Once a choice is saved, the banner disappears and the footer currently has no persistent "Cookie Preferences" control.

Recommended non-legal UX fix: add a footer control that reopens the existing consent UI and lets a user withdraw analytics consent later.

#### Identity and phone verification

Current product behavior includes:

- school verification state;
- phone verification state;
- Stripe Identity verification state;
- a provider session identifier stored in Aspire for Stripe Identity.

The public Privacy Policy mentions verification status but does not clearly distinguish:

- verification result/status retained by Aspire;
- sensitive identity-document handling performed by Stripe Identity;
- phone verification handled through the authentication/provider stack.

The final policy should say explicitly that Aspire should avoid storing raw identity-document images when provider-hosted verification can be used, while retaining limited verification status/provider references needed for account trust and fraud prevention.

#### Shipping and delivery addresses

Marketplace code supports shipping-address fields including:

- recipient/sender name;
- street lines;
- city/state/ZIP/country;
- optional email/phone;
- parcel dimensions/weight;
- carrier/service/rate;
- tracking identifiers and URLs.

Shippo integration code sends shipping addresses/parcel data to Shippo when carrier shipping is used.

The current Privacy Policy does not yet describe this level of shipping/address processing.

Because live Shippo is not currently enabled, the policy should be updated at or before carrier shipping launch, not prematurely marketed as live.

#### Temporary live location

The product has `connection_live_locations` with latitude, longitude, accuracy, expiry, and cleanup logic.

The public policy says precise coordinates may be used temporarily, which is directionally accurate. The final revision should explicitly state that temporary live-location sharing is participant-controlled, expires/cleans up, and is not used for product analytics.

#### Email infrastructure

Current product paths include:

- Resend for transactional/auth delivery telemetry;
- Namecheap Private Email SMTP for human/ambassador mail.

The Resend webhook stores delivery event metadata such as event type, provider email ID, sender/recipient domains, timestamps, and bounce classification rather than full message bodies.

The public policy currently says only "email" service providers. Final disclosure should cover operational delivery telemetry and bounce/suppression handling.

#### Moderation and Resolution Center

Public privacy language mentions moderation and Resolution Center broadly.

The product actually retains structured moderation/safety signals and resolution evidence snapshots. Final language should explain that Aspire may preserve relevant transaction, safety, moderation, and dispute evidence for investigation, abuse prevention, accounting, and legal obligations.

## Retention

An internal draft retention schedule now exists at:

`docs/privacy/data-retention-schedule-draft.md`

Do not copy those exact durations into the public policy yet. First confirm:

- accounting/tax retention with a professional;
- applicant/ambassador record requirements;
- provider-side retention in Stripe, Supabase, Google Analytics, Amplitude, Datadog, email, and Shippo;
- backup/PITR retention.

The public policy can remain principle-based until those periods are confirmed.

## Company identity / contact

Public footer states:

- Cloudora Labs, Inc. is the company;
- Aspire 101 is a product of Cloudora Labs.

Legal/privacy pages should consistently identify Cloudora Labs, Inc. as the operating entity and keep the same legal/privacy contact mailbox.

## Launch blockers vs follow-ups

### Block before broad paid launch

- final governing-law / venue / dispute clause;
- explicit and consistently enforced age rule;
- final payment/shipping disclosures for every live provider;
- final legal review of Terms + Privacy as a single package.

### Can be completed as product hardening

- persistent Cookie Preferences control;
- more explicit analytics/observability provider disclosure;
- provider/data-flow table for internal compliance;
- retention schedule reconciliation;
- record of policy effective dates and material-change notices.

## Recommended sequence

1. Implement persistent Cookie Preferences without changing policy substance.
2. Prepare a redline/draft Privacy update naming actual 2026 data categories/providers.
3. Prepare a redline/draft Terms update for shipping/provider language only if/when live carrier shipping is enabled.
4. Founder/counsel decides age + governing law / venue / dispute language.
5. Publish Terms and Privacy together with one reviewed effective date.
6. Close issue #329 only after publication and product/signup rules match the text.
