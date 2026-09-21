# Aspire 101 email infrastructure audit — 2026-09-20

## Current architecture

- Human/team mail is hosted on **Namecheap Private Email** for `aspires101.com`.
- The Namecheap Private Email subscription for `aspires101.com` predates June 2, 2026, so the Private Email DKIM selector to verify is **`default._domainkey`** (not the newer `privateemail._domainkey`).
- The campus ambassador workflow sends through Namecheap SMTP using `mail.privateemail.com:465` with TLS and `team@aspires101.com` by default.
- Supabase Auth is responsible for signup confirmation / recovery emails used by the app.

## Verified application behavior

- The ambassador mail path has successfully delivered through `namecheap_private_email` in production.
- One historical ambassador receipt was later marked bounced; the recipient domain contained a test typo (`prudue.edu`), so that record does not by itself indicate a Namecheap delivery failure.
- Supabase Auth currently has 39 users with confirmation mail timestamps; 28 have confirmed their email.
- Recent Purdue and Berkeley confirmations were completed roughly 0.3–0.7 minutes after confirmation mail was sent, so the auth-email path is operational.

## DNS records to verify in Cloudflare

Because the domain uses Namecheap Private Email, verify the following records exist and that there is only one SPF record at the root:

| Purpose | Type | Host | Expected value / behavior |
| --- | --- | --- | --- |
| Inbound mail | MX | `@` | `mx1.privateemail.com` priority 10 |
| Inbound mail | MX | `@` | `mx2.privateemail.com` priority 10 |
| SPF | TXT | `@` | includes `include:spf.privateemail.com` and ends in an appropriate `~all` / `-all` policy |
| DKIM | TXT | `default._domainkey` | full Namecheap-provided DKIM public key |
| DMARC | TXT | `_dmarc` | valid `v=DMARC1` policy with reporting address |

Do not create multiple SPF TXT records for `@`. If another sender is added later, merge authorized senders into one SPF policy.

## Supabase Auth production requirement

Supabase's built-in SMTP service is for development / limited testing. Before broad public launch, confirm **Authentication → Emails → SMTP Settings** is using a custom SMTP provider.

Early-stage options:

- Keep Namecheap Private Email for human mail and use Namecheap SMTP for low-volume auth mail.
- Prefer a dedicated transactional provider/domain such as `auth.aspires101.com` once volume grows or when bounce/delivery telemetry is needed.

Do not mix bulk marketing mail with auth / password-reset email reputation.

## Operational gaps

1. Public DNS authentication has not yet been independently verified from the repository or provider API; confirm the Cloudflare DNS records above.
2. Confirm Supabase Auth custom SMTP configuration rather than relying on successful historic delivery alone.
3. Namecheap SMTP does not provide the same programmatic bounce / complaint webhook workflow as a transactional-mail provider; maintain delivery-event auditing and migrate auth/transactional mail if operational visibility becomes important.
4. Keep mailbox master passwords out of Vercel. Use a mailbox application password for SMTP when supported.
5. Enable 2FA on the Namecheap / Private Email administrator account and maintain recovery access.

## Recommended sender separation

- Human/team: `team@aspires101.com`, `legal@aspires101.com`, founder mailboxes.
- Auth/transactional: eventually `no-reply@auth.aspires101.com` through a transactional provider.
- Marketing/newsletters: separate sender/domain and separate reputation from auth mail.

## Re-check cadence

- After any DNS or mail-provider change: verify MX, SPF, DKIM and DMARC after propagation.
- Monthly during launch: review auth-email failures, ambassador email events and bounce reasons.
- Before a major campus launch: validate signup confirmation and password recovery with Gmail plus at least one university mailbox.
