# Aspire 101 launch operations checklist

## Daily beta checks

- Review the moderator **Support**, **Safety**, **Posts**, and **School IDs** queues.
- Review open Resolution Center cases.
- Check production runtime errors for material regressions.
- Check transactional email failures / bounces when signup or recovery complaints appear.
- Review Stripe only when a payment or Connect issue exists; do not make routine live financial changes without a reason.

## Before a campus push

- Production deployment is READY.
- `/api/health` returns 200.
- Sign up + email confirmation works.
- Sign in and password recovery work.
- Create / discover / connect / chat flows work.
- Moderator account can load moderation queues.
- Resolution Center opens and preserves transaction holds.
- Stripe Checkout and Connect have already been validated in sandbox.
- Resend domain remains verified and production webhook remains enabled.
- No unresolved SEV-0 or SEV-1 incident is open.

## Weekly founder review

- New users and activation funnel.
- Requests/listings created and successful connections/orders.
- Safety reports and moderation volume.
- Resolution cases, refunds, disputes, and payout exceptions.
- Support themes: repeated bugs, repeated questions, requested features.
- Infrastructure errors that repeated more than once.

The goal is to identify recurring product or operating problems, not to optimize vanity metrics.
