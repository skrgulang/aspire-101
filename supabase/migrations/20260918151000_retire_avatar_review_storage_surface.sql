-- Retire the unused avatar-review browser storage surface.
-- The private bucket is kept intact for rollback/history, but current product code has no active client path.

drop policy if exists "avatar_review_insert_own" on storage.objects;
drop policy if exists "avatar_review_select_own" on storage.objects;
drop policy if exists "avatar_review_delete_own" on storage.objects;
