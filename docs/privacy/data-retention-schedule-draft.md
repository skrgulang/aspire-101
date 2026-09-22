# Aspire 101 data retention schedule — internal draft

> **Status:** founder/operations draft. Do not publish this file as a customer-facing privacy promise until it is reconciled with the Privacy Policy and reviewed for applicable legal requirements.

Cloudora Labs, Inc. should retain only the data needed to operate Aspire 101, resolve disputes, prevent abuse, meet accounting/legal duties, and improve the product. Raw sensitive data should have a shorter lifetime than derived operational records.

## Proposed baseline

| Data class | Proposed retention | Notes |
| --- | --- | --- |
| Account/profile data | While account is active; delete/scrub after account deletion workflow | Preserve records that must remain for transaction, safety, or legal reasons separately. |
| School-verification status | While account is active + up to 12 months | Avoid retaining unnecessary submitted identity material after verification. |
| Raw identity documents | Do not store in Aspire when provider-hosted verification is available | Store only the minimum provider status/reference required for the workflow. |
| Exact delivery address / instructions | 90 days after completed/cancelled delivery | Extend only for an active dispute, chargeback, safety case, or legal hold. |
| Temporary live location | Ephemeral; remove at end of coordination session or within 24 hours | Do not use for analytics. |
| Connection/private messages | 24 months after last connection activity | May be retained longer when attached to an unresolved safety/resolution case. |
| Requests/listings and public content | While active + 24 months after closure | Earlier deletion/scrubbing may apply when no transaction/safety dependency exists. |
| Payment/accounting/payout ledger | 7 years | Keep provider IDs/statuses needed for reconciliation; never store full card/bank credentials. |
| Refund/dispute/resolution records | 7 years after final resolution | Includes the minimum evidence required to explain financial state. |
| Safety/moderation/enforcement records | 5 years after closure | Extend for repeat-abuse prevention, legal hold, or active investigation when justified. |
| Transactional email delivery events | 12 months | Keep delivery status/domain-level diagnostics, not message bodies. |
| Product analytics | 14 months | No names, emails, private messages, exact addresses, or precise location. |
| Reliability/security logs | 90 days by default | Longer only for a documented incident or investigation. |
| Abandoned drafts/uploads | 90 days of inactivity | Delete sooner when technically safe. |
| Ambassador / program applications | 12 months after final decision | Extend only when the applicant agrees to future opportunities or counsel requires it. |
| Marketing/update subscribers | Until unsubscribe or 24 months of inactivity | Honor suppression/unsubscribe records as required. |
| Support tickets | 24 months after closure | Safety/payment cases follow their longer dedicated schedule. |
| Database backups | Provider backup window + documented restore policy | Backup retention must not silently become indefinite data retention. |

## Deletion and legal-hold rules

1. User deletion should scrub direct profile/account data while preserving records needed for accounting, fraud prevention, counterparty integrity, safety, or legal obligations.
2. A legal hold or active dispute pauses normal deletion only for the minimum related records.
3. Expired records should be deleted or de-identified through a documented recurring job rather than an ad-hoc manual process.
4. Backups should age out on the provider's documented backup schedule; expired records should not be restored permanently from an old backup.
5. Provider-side retention (Stripe, email, analytics, observability, shipping) must be reviewed independently.

## Founder decisions still required

- Confirm the final legal retention period for payment/tax records.
- Confirm whether any campus ambassador application must be retained longer under employment/applicant-record rules.
- Confirm provider retention settings in Stripe, Supabase, Google Analytics, Amplitude, Datadog, email, and Shippo.
- Reconcile the final schedule with the customer-facing Privacy Policy before broad launch.
