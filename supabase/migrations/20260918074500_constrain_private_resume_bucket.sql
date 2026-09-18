-- Constrain the dormant private resume bucket to the file types/size advertised by the legacy form.
-- Browser roles still have no storage.objects policy for this bucket.

update storage.buckets
set
  file_size_limit = 10485760,
  allowed_mime_types = array[
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ]::text[]
where id = 'resumes';
