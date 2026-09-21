# Account and access security audit

Date: 2026-09-21

## Scope

Read-only review of current application authorization, repository exposure, and staff-access controls. This audit does not change Stripe, bank, payout, Vercel environment variables, Supabase auth users, or staff roles.

## Application staff authorization

The authoritative staff-role table is `public.user_roles`.

Current aggregate state:

- Admin roles in `user_roles`: 1
- Moderator roles in `user_roles`: 0
- Admin accounts with at least one verified MFA factor: 1
- Moderator accounts with at least one verified MFA factor: 0

The current `is_admin` and `is_moderator` functions require both:

1. an appropriate row in `public.user_roles`; and
2. AAL2 for normal signed-in staff sessions.

Service-role calls are handled separately by the server-side path.

This means a normal browser session cannot become admin/moderator only because a profile field says so.

## Legacy profile-role fields

The profiles table currently contains:

- 1 profile marked as admin;
- 2 profiles with moderator-style profile flags / role values.

Those profile-level moderator markers are **not** authoritative under the current security functions because there are zero corresponding moderator rows in `public.user_roles`.

Treat these as legacy / informational fields unless the accounts are intentionally promoted through the current role system.

Do not grant moderator access automatically. Any future support/operations account should receive an explicit role only after the intended scope and MFA requirement are confirmed.

## Repository exposure

The GitHub repository is currently public.

A targeted scan of the current repository tree found no committed live Stripe secret-key prefix, restricted live key prefix, raw private-key block, or other obvious live credential value from the searched patterns. References to server-side secret variable names and placeholder values remain in documentation / `.env.example`, which is expected.

This check covers the current repository tree and targeted search patterns. It is not a forensic scan of every historical Git object.

A repository `.gitignore` now blocks common local secret/config files, Vercel metadata, private-key containers, logs, and build output while keeping `.env.example` tracked.

## GitHub branch governance

Current repository metadata:

- Visibility: public
- Production development branch used by Vercel: `main`
- GitHub default branch: `v2`

This mismatch is operational debt. Do not casually change the default branch or repository visibility because the production Vercel integration should be verified first.

The current GitHub connector cannot read branch-protection settings, so this audit does **not** claim whether `main` or `v2` is protected.

Recommended controlled sequence later:

1. Create / confirm the intended GitHub organization ownership model.
2. Verify Vercel GitHub App access to private repositories.
3. Confirm `main` is the intended canonical production branch.
4. Review branch protection / required checks.
5. Test a preview deployment under the target permission model.
6. Only then consider aligning the default branch and moving the repository to private visibility.

## Staff-account minimum standard

For any account with admin or moderator permissions:

- unique named account;
- verified MFA;
- no shared passwords;
- no secrets stored in repo, chat, ticket, or support notes;
- least-privilege role;
- role removed when no longer needed;
- separate provider access only when required for the job.

## Current conclusions

- Current admin authorization is MFA-gated at the database authorization layer.
- No active moderator role exists in the authoritative role table.
- Legacy profile moderator flags should not be treated as access grants.
- The current repository tree does not show an obvious live credential from the targeted secret-pattern scan.
- Public-repo / default-branch governance remains a future hardening task and should be changed only after Vercel permission testing.
