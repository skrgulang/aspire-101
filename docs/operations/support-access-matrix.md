# Aspire 101 support & operations access matrix

## Current policy

Application staff authorization is controlled by `public.user_roles` plus MFA/AAL2 checks. Profile flags are not an access grant.

Current authoritative production state at the time of this draft:

- 1 admin
- 0 moderators

Do not promote support/operations accounts merely because they exist. Grant staff privileges only after their job scope and MFA status are confirmed.

## Access matrix

| Capability | Founder/Admin | Support/Operations | External contractor |
| --- | --- | --- | --- |
| Normal user support | Yes | Yes | Only when assigned |
| Post/safety queue | Yes | Moderator role after MFA | No by default |
| School verification review | Yes | Moderator role after MFA | No |
| Resolution-case review | Yes | Only if explicitly assigned and trained | No |
| Issue refunds / release protected funds | Founder-reviewed workflow | No independent authority | No |
| Stripe Dashboard / API secrets | Yes, least privilege | No by default | No |
| Company bank account | Yes | No | No |
| Supabase service-role / production SQL | Yes, controlled | No | No |
| Vercel production env/secrets | Yes | No | No |
| GitHub production write | Yes | Only if engineering role requires it | Scoped repo only |
| Datadog/Amplitude read | Yes | Read-only if useful | Read-only if needed |
| Customer private messages | Case-specific only | Case-specific only | No |

## Support account onboarding

1. Unique named account; no shared login.
2. MFA verified before any staff role is granted.
3. Written scope: support, moderation, safety, or engineering.
4. Grant the minimum app role required.
5. Do not grant provider dashboards merely for convenience.
6. Record the grant date and approver.

## Offboarding

1. Remove `user_roles` row first.
2. Revoke provider access.
3. Revoke GitHub/Vercel/Supabase access if any.
4. Rotate shared credentials only if the person had access to them.
5. Preserve audit records; do not delete staff actions.

## Escalation

Support/operators escalate to the founder/admin for:

- any refund, payout, chargeback, or protected-payment decision;
- credible safety threats;
- account compromise;
- legal/privacy requests;
- suspected data exposure;
- provider credential/configuration changes.

## Next role-design decision

If support volume grows, introduce a narrower `support` role instead of giving all support staff the broader `moderator` permission set.
