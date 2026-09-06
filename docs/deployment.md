# Aspire 101 deployment notes

## Active development branch

- Branch: `v2`
- Hosting: Vercel
- Backend: Supabase
- Payments: Stripe sandbox until production launch approval

## Required server environment variables

Configure these in Vercel. Never expose server secrets through `NEXT_PUBLIC_*` variables.

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- `NEXT_PUBLIC_SITE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`

Marketplace fees are configured server-side in Supabase `public.fee_policies`; they are not client configuration.

## Release workflow

1. Make incremental changes on `v2`.
2. Confirm migrations are applied before features that depend on them are exercised.
3. Let Vercel build the `v2` preview.
4. Check auth, posting, discovery, connections, profile, moderation, and payment regressions.
5. Keep Stripe in sandbox during development.
6. Move the production domain only after the `v2` preview is verified.
