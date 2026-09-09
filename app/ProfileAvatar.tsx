'use client';

import { ChangeEvent, useRef, useState } from 'react';
import { getSupabaseBrowserClient } from '../lib/supabase/client';

type Props = {
  initialUrl?: string | null;
  initials: string;
  name: string;
};

export default function ProfileAvatar({ initialUrl, initials, name }: Props) {
  const [url, setUrl] = useState(initialUrl || '');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  async function upload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (!['image/jpeg','image/png','image/webp'].includes(file.type)) {
      setMessage('Choose a JPG, PNG, or WebP image so Aspire can run the safety check.');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setMessage('Profile photos must be 5 MB or smaller.');
      return;
    }

    setBusy(true);
    setMessage('Checking photo safety…');
    let uploadedPath = '';
    try {
      const supabase = getSupabaseBrowserClient();
      const [{ data: authData, error: authError }, { data: sessionData, error: sessionError }] = await Promise.all([
        supabase.auth.getUser(),
        supabase.auth.getSession()
      ]);
      if (authError) throw authError;
      if (sessionError) throw sessionError;
      if (!authData.user || !sessionData.session?.access_token) throw new Error('Sign in again before changing your photo.');

      const ext = file.name.split('.').pop()?.toLowerCase() || 'jpg';
      const path = `${authData.user.id}/avatar-${Date.now()}.${ext.replace(/[^a-z0-9]/g, '')}`;
      uploadedPath = path;
      const { error: uploadError } = await supabase.storage.from('avatars').upload(path, file, { upsert: false, contentType: file.type, cacheControl: '3600' });
      if (uploadError) throw uploadError;

      const safetyResponse = await fetch('/api/moderation/content', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${sessionData.session.access_token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ context: 'avatar', avatarStoragePath: path }),
        cache: 'no-store'
      });
      const safety = await safetyResponse.json().catch(() => ({}));
      if (!safetyResponse.ok) {
        await supabase.storage.from('avatars').remove([path]);
        uploadedPath = '';
        throw new Error(safety?.error || 'Aspire could not approve that profile photo.');
      }

      const { data: publicData } = supabase.storage.from('avatars').getPublicUrl(path);
      const { error: profileError } = await supabase.from('profiles').update({ avatar_url: publicData.publicUrl, image_url: publicData.publicUrl }).eq('id', authData.user.id);
      if (profileError) throw profileError;
      setUrl(publicData.publicUrl);
      setMessage('Profile photo approved and updated ✓');
    } catch (error) {
      if (uploadedPath) {
        try {
          const supabase = getSupabaseBrowserClient();
          await supabase.storage.from('avatars').remove([uploadedPath]);
        } catch {
          // Best-effort cleanup. The unapproved path is never linked to the profile.
        }
      }
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
      <input ref={inputRef} className="profileAvatarInput" type="file" accept="image/jpeg,image/png,image/webp" onChange={upload} />
      <small>{message || 'Add photo · automatically safety checked'}</small>
    </div>
  );
}
