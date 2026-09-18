import { getSupabaseBrowserClient } from './client';
import { runRequestAiSafety } from './trust';

export type RequestMedia = {
  id: string;
  request_id: string;
  uploader_id: string;
  storage_path: string;
  mime_type: string | null;
  sort_order: number;
  created_at: string;
  public_url?: string;
};

const requestMediaSelect = 'id,request_id,uploader_id,storage_path,mime_type,sort_order,created_at';
const allowedTypes = new Set(['image/jpeg', 'image/png', 'image/webp']);
const maxFileSize = 8 * 1024 * 1024;
const maxFiles = 5;
const signedUrlSeconds = 60 * 60;

function notifyCampusFeedChanged() {
  if (typeof window === 'undefined') return;
  const version = String(Date.now());
  try { window.localStorage.setItem('aspire:campus-feed-refresh-version', version); } catch { /* ignore storage errors */ }
  window.dispatchEvent(new Event('aspire:campus-feed-refresh'));
}

function extensionFor(file: File) {
  if (file.type === 'image/png') return 'png';
  if (file.type === 'image/webp') return 'webp';
  return 'jpg';
}

function friendlyRequestMediaError(error: { message?: string; details?: string; hint?: string }) {
  const detail = `${error.message || ''} ${error.details || ''} ${error.hint || ''}`;
  if (/REQUEST_MEDIA_LIMIT/i.test(detail) || /request_media_request_sort_order_uidx/i.test(detail)) return new Error('This post already has 5 photos. Remove one before adding another.');
  if (/REQUEST_MEDIA_UNSUPPORTED_FORMAT/i.test(detail)) return new Error('Request photos must be JPG, PNG, or WebP so Aspire can review every image before publishing.');
  if (/REQUEST_MEDIA_REQUIRES_OPEN_REQUEST/i.test(detail)) return new Error('Photos can only be changed while the post is still open and editable.');
  if (/REQUEST_MEDIA_UPLOADER_MISMATCH|REQUEST_MEDIA_INVALID_PATH/i.test(detail)) return new Error('This photo could not be attached to that post. Refresh and try again.');
  return error instanceof Error ? error : new Error(error.message || 'Could not attach this photo.');
}

export function validateRequestImages(files: File[]) {
  if (files.length > maxFiles) throw new Error(`Add up to ${maxFiles} photos.`);
  files.forEach((file) => {
    if (!allowedTypes.has(file.type)) throw new Error('Request photos must be JPG, PNG, or WebP so Aspire can review every image before publishing.');
    if (file.size > maxFileSize) throw new Error('Each photo must be 8 MB or smaller.');
  });
}

export async function uploadRequestMedia(requestId: string, files: File[]) {
  if (!files.length) return [] as RequestMedia[];
  validateRequestImages(files);

  const supabase = getSupabaseBrowserClient();
  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError) throw authError;
  const user = authData.user;
  if (!user) throw new Error('Sign in again before uploading photos.');

  // Append new images after any photos that survived an edit/resubmit instead of
  // reusing sort_order=0 and creating unstable photo ordering.
  const { data: lastMedia, error: lastMediaError } = await supabase
    .from('request_media')
    .select('sort_order')
    .eq('request_id', requestId)
    .order('sort_order', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (lastMediaError) throw lastMediaError;
  const startingSortOrder = typeof lastMedia?.sort_order === 'number' ? lastMedia.sort_order + 1 : 0;

  const staged: Array<{ path: string; file: File; sortOrder: number }> = [];

  try {
    for (let index = 0; index < files.length; index += 1) {
      const file = files[index];
      const path = `${user.id}/${requestId}/${crypto.randomUUID()}.${extensionFor(file)}`;
      const { error: uploadError } = await supabase.storage
        .from('request-media')
        .upload(path, file, { cacheControl: '3600', upsert: false, contentType: file.type });
      if (uploadError) throw uploadError;
      staged.push({ path, file, sortOrder: startingSortOrder + index });
    }

    // Insert all media rows in one statement. If the database rejects any one
    // image, none of the new request_media rows are committed.
    const { data: rows, error: rowError } = await supabase
      .from('request_media')
      .insert(staged.map((item) => ({
        request_id: requestId,
        uploader_id: user.id,
        storage_path: item.path,
        mime_type: item.file.type,
        sort_order: item.sortOrder
      })))
      .select(requestMediaSelect);
    if (rowError) throw friendlyRequestMediaError(rowError);

    const created = (rows ?? []) as RequestMedia[];
    const { data: signed, error: signedError } = await supabase.storage
      .from('request-media')
      .createSignedUrls(created.map((row) => row.storage_path), signedUrlSeconds);
    if (signedError) throw signedError;

    // Text is scanned when the request is created. Run again now so the final
    // assessment includes every uploaded image before a moderator approves it.
    await runRequestAiSafety(requestId).catch(() => undefined);
    notifyCampusFeedChanged();

    return created.map((row, index) => ({
      ...row,
      public_url: signed?.[index]?.signedUrl
    }));
  } catch (error) {
    if (staged.length) {
      // If rows were inserted but a later step failed, remove those rows first
      // while the request is still open. Only remove storage objects after the
      // database no longer references them.
      const { data: attachedRows } = await supabase
        .from('request_media')
        .select('id,storage_path')
        .eq('request_id', requestId)
        .in('storage_path', staged.map((item) => item.path));

      if (attachedRows?.length) {
        const { error: deleteError } = await supabase
          .from('request_media')
          .delete()
          .in('id', attachedRows.map((row) => row.id));
        if (!deleteError) {
          await supabase.storage
            .from('request-media')
            .remove(staged.map((item) => item.path))
            .catch(() => undefined);
        }
      } else {
        await supabase.storage
          .from('request-media')
          .remove(staged.map((item) => item.path))
          .catch(() => undefined);
      }
    }
    throw friendlyRequestMediaError(error instanceof Error ? error : { message: 'Could not upload these photos.' });
  }
}

export async function fetchRequestMedia(requestIds: string[]) {
  if (!requestIds.length) return [] as RequestMedia[];
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase
    .from('request_media')
    .select(requestMediaSelect)
    .in('request_id', requestIds)
    .order('sort_order');
  if (error) throw error;

  const rows = (data ?? []) as RequestMedia[];
  if (!rows.length) return rows;

  const { data: signed, error: signedError } = await supabase.storage
    .from('request-media')
    .createSignedUrls(rows.map((row) => row.storage_path), signedUrlSeconds);
  if (signedError) throw signedError;

  return rows.map((row, index) => ({
    ...row,
    public_url: signed?.[index]?.signedUrl
  }));
}
