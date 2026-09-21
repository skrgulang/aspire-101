# Legacy surface inventory — 2026-09-21

## Purpose

Inventory the pre-Next.js static Aspire 101 application surfaces that still exist in the repository so they can be reviewed before any deletion or RLS cleanup.

## Current state

The repository contains 64 files under `aspires 101/`, including a complete older static web application.

Legacy user-facing pages include:

- AspireLanding.html
- about.html
- account.html
- chat.html
- dashboard.html
- discover.html
- feed.html
- find-match.html
- guidelines.html
- index.html
- mainpage.html
- nearby.html
- password.html
- phone.html
- privacy.html
- quick-post.html
- signin.html
- signout.html
- signup.html
- support.html
- swipe.html
- task.html
- tasks.html
- terms.html

The current production application uses Next.js routes under `app/`, including modern equivalents for login, signup, discover, marketplace, post, connections, profile, settings, support/safety operations, transactions, money, and legal pages.

## Why this matters

The legacy static pages still reference old Supabase tables and policies such as:

- `tasks`
- `task_messages`
- `task_swipes`
- `posts`
- `support_feedback`

Those tables currently account for a meaningful portion of duplicate / permissive RLS advisor warnings.

Do not delete those tables or policies until the static application is confirmed unreachable and no production route, background job, migration, or support workflow still depends on them.

## Known examples

- Legacy `find-match.html` directly reads and updates `tasks`.
- Legacy `chat.html` directly reads `task_messages` and `tasks`.
- Legacy `app.js` writes `task_swipes`.
- Legacy `geo.js` writes `posts`.
- Legacy `support.html` uses `support_feedback`.

## Recommended deprecation sequence

1. Confirm whether any production URL or Vercel rewrite still serves `aspires 101/` pages.
2. Search current Next.js code for runtime dependencies on legacy tables.
3. Confirm no external links, QR codes, ambassador materials, or bookmarks rely on old URLs.
4. Mark the static folder read-only / deprecated in documentation.
5. Remove public exposure to old pages if any exists.
6. Only after a quiet period, archive the static app and consolidate legacy RLS policies.
7. Then review whether old tables can be migrated, frozen, or removed.

## No destructive action taken

This inventory intentionally does not delete files, tables, policies, or data.


## Sampled production URL checks

On 2026-09-21, the following legacy-style URLs returned HTTP 404 from the current production Next.js application:

- `/tasks.html`
- `/aspires%20101/tasks.html`
- `/aspires%20101/support.html`

This is evidence that the sampled static pages are not directly served by the current production deployment. It is not, by itself, proof that every legacy table or policy is unused.
