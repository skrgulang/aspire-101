import { getSupabaseBrowserClient } from './client';

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

const allowedTypes = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']);
const maxFileSize = 8 * 1024 * 1024;
const maxFiles = 5;

function extensionFor(file: File) {
  const nameExt = file.name.split('.').pop()?.toLowerCase();
  if (nameExt && /^[a-z0-9]{2,5}$/.test(nameExt)) return nameExt;
  if (file.type === 'image/png') return 'png';
  if (file.type === 'image/webp') return 'webp';
  if (file.type === 'image/heic') return 'heic';
  if (file.type === 'image/heif') return 'heif';
  return 'jpg';
}

export function validateRequestImages(files: File[]) {
  if (files.length > maxFiles) throw new Error(`Add up to ${maxFiles} photos.`);
  files.forEach((file) => {
    if (!allowedTypes.has(file.type)) throw new Error('Photos must be JPG, PNG, WebP, HEIC, or HEIF.');
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

  const created: RequestMedia[] = [];

  for (let index = 0; index < files.length; index += 1) {
    const file = files[index];
    const path = `${user.id}/${requestId}/${crypto.randomUUID()}.${extensionFor(file)}`;
    const { error: uploadError } = await supabase.storage
      .from('request-media')
      .upload(path, file, { cacheControl: '3600', upsert: false, contentType: file.type });
    if (uploadError) throw uploadError;

    const { data: publicData } = supabase.storage.from('request-media').getPublicUrl(path);
    const { data: row, error: rowError } = await supabase
      .from('request_media')
      .insert({
        request_id: requestId,
        uploader_id: user.id,
        storage_path: path,
        mime_type: file.type,
        sort_order: index
      })
      .select('*')
      .single();

    if (rowError) {
      await supabase.storage.from('request-media').remove([path]).catch(() => undefined);
      throw rowError;
    }
    created.push({ ...(row as RequestMedia), public_url: publicData.publicUrl });
  }

  return created;
}

export async function fetchRequestMedia(requestIds: string[]) {
  if (!requestIds.length) return [] as RequestMedia[];
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase
    .from('request_media')
    .select('*')
    .in('request_id', requestIds)
    .order('sort_order');
  if (error) throw error;
  return (data ?? []).map((row) => {
    const { data: publicData } = supabase.storage.from('request-media').getPublicUrl(row.storage_path);
    return { ...row, public_url: publicData.publicUrl } as RequestMedia;
  });
}
