'use client';

import { ChangeEvent, useRef, useState } from 'react';
import { getSupabaseBrowserClient } from '../lib/supabase/client';

type Props = {
  initialUrl?: string | null;
  initials: string;
  name: string;
};

function ownedAvatarPath(publicUrl: string, expectedOrigin: string, userId: string) {
  if (!publicUrl) return null;
  try {
    const parsed = new URL(publicUrl);
    if (parsed.origin !== expectedOrigin) return null;
    const prefix = '/storage/v1/object/public/avatars/';
    if (!parsed.pathname.startsWith(prefix)) return null;
    const path = decodeURIComponent(parsed.pathname.slice(prefix.length));
    return path.startsWith(`${userId}/`) ? path : null;
  } catch {
    return null;
  }
}

export default function ProfileAvatar({ initialUrl, initials, name }: Props) {
  const [url, setUrl] = useState(initialUrl || '');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  async function upload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (!['image/jpeg','image/png','image/webp','image/heic','image/heif'].includes(file.type)) {
      setMessage('Choose a JPG, PNG, WebP, HEIC, or HEIF image.');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setMessage('Profile photos must be 5 MB or smaller.');
      return;
    }

    setBusy(true);
    setMessage('');
    try {
      const supabase = getSupabaseBrowserClient();
      const { data: authData, error: authError } = await supabase.auth.getUser();
      if (authError) throw authError;
      if (!authData.user) throw new Error('Sign in again before changing your photo.');
      const ext = file.name.split('.').pop()?.toLowerCase() || 'jpg';
      const path = `${authData.user.id}/avatar-${Date.now()}.${ext.replace(/[^a-z0-9]/g, '')}`;
      const { error: uploadError } = await supabase.storage.from('avatars').upload(path, file, { upsert: false, contentType: file.type, cacheControl: '3600' });
      if (uploadError) throw uploadError;
      const { data: publicData } = supabase.storage.from('avatars').getPublicUrl(path);
      const previousPath = ownedAvatarPath(url, new URL(publicData.publicUrl).origin, authData.user.id);
      const { error: profileError } = await supabase.rpc('set_my_avatar_url', {
        p_storage_path: path,
        p_avatar_url: publicData.publicUrl
      });
      if (profileError) {
        await supabase.storage.from('avatars').remove([path]).catch(() => undefined);
        throw profileError;
      }

      if (previousPath && previousPath !== path) {
        await supabase.storage.from('avatars').remove([previousPath]).catch(() => undefined);
      }

      setUrl(publicData.publicUrl);
      setMessage('Profile photo updated.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not upload your photo.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="profileAvatarWrap">
      <button type="button" className={`profileAvatar profileAvatarEditable ${url ? 'hasPhoto' : ''}`} onClick={() => inputRef.current?.click()} disabled={busy} aria-label="Change profile photo">
        {url ? <img src={url} alt={`${name} profile`} /> : initials}
        <span>{busy ? '…' : '+'}</span>
      </button>
      <input ref={inputRef} className="profileAvatarInput" type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif" onChange={upload} />
      <small>{message || 'Add photo'}</small>
    </div>
  );
}
