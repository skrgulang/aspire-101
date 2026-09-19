-- Browser owner and moderator reads now use scoped verification RPCs.
-- Keep service-role/internal access while removing authenticated table/column SELECT paths.
revoke select on public.school_verifications from authenticated;
revoke select (user_id,school,student_id,status,submitted_at,review_note,verification_method,school_email,verified_at) on public.school_verifications from authenticated;
