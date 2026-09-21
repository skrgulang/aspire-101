# Data retention & privacy inventory — 2026-09-21

## Purpose

Inventory sensitive Aspire 101 data classes, current controls, and retention decisions that still need to be formalized. This document is internal and does not set legal retention periods.

## Current storage snapshot

At audit time:

- live location rows: **0**
- school verification rows: **9**
- school verification rows with a stored raw `student_id`: **0**
- identity verification rows: **1**
- market orders with a stored delivery address: **0**
- connection message rows: **17**
- safety report rows: **1**
- Resolution Center cases: **0**

Storage buckets:

- `avatars` — public bucket; image content; 5 MB limit
- `avatar-review` — private
- `marketplace-drafts` — private
- `request-drafts` — private
- `request-media` — private
- `resumes` — private

Current object counts observed:
- `avatars`: 3
- `request-media`: 3
- other listed buckets currently had no objects returned by the aggregate query

## Data classes

### Account / profile

Examples:
- name / display name
- email / phone
- school / campus
- city
- profile bio / interests
- avatar

Current deletion behavior:
- core PII fields are nulled / anonymized;
- owned avatar files are removed.

Retention decision:
- public policy says account data is retained while active and removed/anonymized after deletion unless otherwise required.

### School verification

Potential fields:
- school
- school email
- verification method / provider metadata
- legacy `student_id`

Current state:
- no current rows contain a nonblank raw student ID.

Current deletion behavior:
- school-verification row is deleted with account erasure.

Recommendation:
- avoid reintroducing persistent raw student IDs unless necessary;
- prefer provider verification references / school-email verification where adequate.

### Identity verification

Stored metadata includes:
- provider
- provider session reference
- status
- timestamps / errors
- live/test mode

Aspire does not need to store raw identity document imagery in this table.

Current deletion behavior:
- identity-verification row is deleted with account erasure.

Retention decision:
- define whether completed verification metadata must persist for fraud / safety purposes and for how long.

### Temporary live location

Stored fields:
- connection ID
- user ID
- latitude / longitude
- accuracy
- expiry

Controls:
- location rows carry `expires_at`;
- `purge_connection_live_locations_when_closed` removes locations when a connection leaves active/confirmed states;
- `cleanup_expired_connection_locations` deletes expired rows.

Current state:
- 0 live-location rows.

Retention recommendation:
- continue short-lived / purpose-bound storage only;
- do not reuse temporary coordinates for advertising or unrelated analytics.

### Marketplace delivery address

`market_orders.delivery_address` can store a JSON delivery address and delivery instructions.

Current state:
- no current orders contain a delivery address.

Retention decision:
- define when address data should be scrubbed after successful fulfillment, refunds, or dispute windows;
- preserve only what is legally / operationally required.

### Messages

`connection_messages` contains participant message bodies.

Current state:
- 17 message rows.

Current account deletion behavior:
- messages authored by the deleted account are replaced with a deletion marker rather than physically removing the message row.

Reasonable operational rationale:
- maintain conversation integrity / evidence for both participants and disputes.

Retention decision:
- define a long-stop retention period and safety / dispute exceptions.

### Safety reports / Resolution Center

May contain:
- free-form report details
- counterpart user IDs
- transaction / scheduling snapshots
- evidence snapshots
- reviewer notes
- refund / payout resolution data

Current state:
- 1 safety report
- 0 Resolution Center cases

Retention decision:
- should be longer than ordinary product analytics when required for safety, fraud, dispute defense, or legal obligations;
- exact period requires policy/counsel decision.

### Payments

Aspire stores transaction state, fee snapshots, refund/dispute timestamps, and Stripe identifiers/relationships.

Do not treat payment data like disposable analytics.

Retention decision:
- financial/accounting/fraud obligations should drive retention;
- do not promise immediate deletion of all transaction records when an account is deleted.

### Product analytics

Aspire stores database-backed product analytics and also uses Amplitude for directional product behavior.

Recommendation:
- keep event payloads minimized;
- do not send free-form chat, safety report content, payment credentials, precise location, or raw identity data into product analytics.

### Reliability / logs

Datadog is used for browser / reliability monitoring.

Recommendation:
- minimize personal/sensitive fields;
- do not expose IP / precise geo / session identifiers in routine support output;
- define log retention based on operational need rather than indefinite storage.

## Account export

The current account export includes:
- account basics;
- profile / preferences;
- school / identity verification status;
- requests / responses;
- connections / messages;
- reviews authored;
- payments;
- payment-account state;
- Resolution Center data;
- notifications;
- circle choices;
- completion confirmations;
- request media metadata.

This is a solid foundation for data-access requests.

## Remaining work

Before publishing a refreshed privacy policy, define retention periods for:

1. transaction / fee / payout records;
2. shipping / delivery address data;
3. messages;
4. identity verification metadata;
5. safety / moderation records;
6. Resolution Center evidence;
7. application logs;
8. product analytics;
9. abandoned draft media;
10. resumes / applications if that legacy flow remains active.
