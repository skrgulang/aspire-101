# Aspire 101 email operations runbook

## Signup / recovery mail

1. Confirm the user-facing flow succeeds in the app.
2. Check Supabase Auth confirmation/recovery timestamps and rate limits.
3. If delivery is delayed or missing, check the configured SMTP provider before changing application code.
4. Check spam/junk placement and the recipient domain before retrying repeatedly.

## Ambassador mail

Provider: Namecheap Private Email SMTP.

Production defaults:

- Host: `mail.privateemail.com`
- Port: `465`
- TLS/secure: `true`
- SMTP user/from mailbox: `team@aspires101.com` unless explicitly overridden

The SMTP password must remain server-side. Prefer a mailbox application password over the master mailbox password.

## Bounce handling

- Do not treat a malformed destination address as a provider outage.
- Store delivery status and error reason without exposing full recipient addresses in operational dashboards.
- Repeated bounces to a valid domain should trigger a DNS/authentication/provider review.

## DNS change safety

- Never delete existing MX/SPF/DKIM/DMARC records until the replacement values are confirmed.
- Never publish two separate SPF records at the same hostname.
- For this legacy Namecheap Private Email subscription, verify DKIM at `default._domainkey`.
- When adding a transactional provider, follow its DKIM instructions and merge SPF only when that provider actually requires SPF at the same organizational domain.

## Launch checklist

- Signup confirmation works.
- Password recovery works.
- Human mail can send and receive.
- SPF passes.
- DKIM passes.
- DMARC exists and reports to a monitored mailbox.
- No hard-coded SMTP credentials exist in source control.
- Vercel production SMTP credentials use server-only variables.

## Resend delivery webhooks

Endpoint: `/api/resend/webhook`.

Tracked events:

- `email.sent`
- `email.delivered`
- `email.delivery_delayed`
- `email.bounced`
- `email.complained`
- `email.failed`
- `email.suppressed`

The endpoint verifies Svix/Resend signatures against `RESEND_WEBHOOK_SIGNING_SECRET` before parsing the JSON payload. It stores a privacy-minimized operational event record in `public.resend_webhook_events`: webhook message ID, event type, Resend email ID, sender/recipient domains, event timestamp, and bounce category when provided. Full recipient addresses and message bodies are not stored.

Repeated webhook deliveries are idempotent because `webhook_message_id` is the primary key.

Delivery failures, complaints, bounces, and suppressions also emit a structured server warning without full recipient addresses.

Preview validation uses the same signed webhook flow before the endpoint is switched to the production domain.
