# Aspire 101 production monitoring baseline

This document tracks the minimum production monitoring surface for Aspire 101.

## Public checks

- Homepage: https://aspires101.com/
- Health endpoint: https://aspires101.com/api/health
- Robots: https://aspires101.com/robots.txt
- Sitemap: https://aspires101.com/sitemap.xml
- Security contact: https://aspires101.com/.well-known/security.txt

## Alert targets

The external uptime monitor should alert on:

- homepage non-2xx responses
- /api/health non-2xx responses
- repeated 5xx responses
- SSL/TLS certificate problems
- elevated response latency

## Platform checks

Review these independently because a shallow health endpoint does not prove every dependency is healthy:

- Vercel runtime errors and failed deployments
- Supabase database/auth/storage health and Security Advisor findings
- Stripe webhook failures, disputes, refunds, payout restrictions, and Connect onboarding
- transactional email delivery and authentication (SPF/DKIM/DMARC)
- unusual authentication, spam, moderation, or rate-limit activity

## Incident rule

Do not place secrets, internal credentials, database identifiers, user data, or detailed dependency errors in the public health endpoint.
