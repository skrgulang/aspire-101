'use client';

import { useEffect, useState } from 'react';
import { getSupabaseBrowserClient } from '../lib/supabase/client';

type VerificationStatus = 'not_started' | 'pending' | 'verified' | 'failed' | 'requires_input';

export default function IdentityVerificationCard() {
  const [status, setStatus] = useState<VerificationStatus>('not_started');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  async function refreshStatus() {
    const supabase = getSupabaseBrowserClient();
    const { data, error } = await supabase
      .from('identity_verifications')
      .select('status,last_error,verified_at')
      .maybeSingle();
    if (error) throw error;
    if (data?.status) setStatus(data.status as VerificationStatus);
    if (data?.last_error && data.status !== 'verified') setMessage(data.last_error);
  }

  useEffect(() => {
    refreshStatus().catch(() => undefined);
  }, []);

  async function startVerification() {
    setBusy(true);
    setMessage('');
    try {
      const supabase = getSupabaseBrowserClient();
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      if (!token) throw new Error('Sign in again to verify your identity.');
      const response = await fetch('/api/stripe/identity/start', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` }
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload?.error || 'Could not start identity verification.');
      if (payload.status === 'verified') {
        setStatus('verified');
        return;
      }
      setStatus('pending');
      if (!payload.url) throw new Error('Identity verification is not available on this deployment yet.');
      window.location.assign(payload.url);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not start identity verification.');
    } finally {
      setBusy(false);
    }
  }

  const verified = status === 'verified';
  const attention = status === 'failed' || status === 'requires_input';

  return (
    <article className="trustPassportCard identityPassportCard">
      <div className="trustPassportIcon">ID</div>
      <div className="trustPassportCopy">
        <span>GOVERNMENT ID</span>
        <h3>Identity verified</h3>
        <p>A higher-trust signal for rides, payments, paid help, and other in-person connections. Aspire does not store your raw government ID images.</p>
      </div>
      <div className={`trustPassportStatus ${verified ? 'isVerified' : attention ? 'needsAttention' : ''}`}>
        {verified ? 'VERIFIED ✓' : attention ? 'NEEDS ATTENTION' : status === 'pending' ? 'IN PROGRESS' : 'OPTIONAL'}
      </div>
      {!verified && (
        <button className="trustPassportAction" type="button" onClick={startVerification} disabled={busy}>
          {busy ? 'Opening verification…' : attention ? 'Continue verification →' : status === 'pending' ? 'Resume verification →' : 'Verify identity →'}
        </button>
      )}
      {verified && <p className="trustPassportMessage success">Your profile can show the ID Verified trust signal.</p>}
      {message && !verified && <p className="trustPassportMessage">{message}</p>}
      <small className="trustPassportPrivacy">Verification is completed by Stripe Identity. Aspire stores only the minimum verification status needed for trust and safety.</small>
    </article>
  );
}
