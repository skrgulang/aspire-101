-- Keep ordinary students able to submit/resubmit verification evidence, but reserve review/audit fields for trusted server/moderator paths.
revoke insert, update on table public.school_verifications from authenticated;

grant insert (
  user_id,
  school,
  student_id,
  status,
  university_id,
  verification_method,
  school_email,
  verification_provider,
  provider_verification_id,
  provider_status,
  submitted_at,
  updated_at
) on table public.school_verifications to authenticated;

grant update (
  school,
  student_id,
  status,
  university_id,
  verification_method,
  school_email,
  verification_provider,
  provider_verification_id,
  provider_status,
  submitted_at,
  updated_at
) on table public.school_verifications to authenticated;

-- RLS remains the second layer: owners may only create pending rows and only resubmit non-verified rows back to pending.
