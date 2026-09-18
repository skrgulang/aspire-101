-- Match the request-media bucket to the formats the application and moderation pipeline accept.
-- HEIC/HEIF were bucket-allowed but cannot be attached to request_media rows and are not scanned.

update storage.buckets
set allowed_mime_types = array[
  'image/jpeg',
  'image/png',
  'image/webp'
]::text[]
where id = 'request-media';
