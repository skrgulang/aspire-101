'use client';

import { useEffect, useState } from 'react';
import { getSupabaseBrowserClient } from '../lib/supabase/client';

type EnrollState = {
  factorId: string;
  qr: string;
  secret: string;
} | null;

export default function MfaSecurityCard() {
  const [enabled, setEnabled] = useState(false);
  const [factorId, setFactorId] = useState('');
  const [enroll, setEnroll] = useState<EnrollState>(null);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  async function refreshFactors() {
    const supabase = getSupabaseBrowserClient();
    const { data, error } = await supabase.auth.mfa.listFactors();
    if (error) throw error;
    const verified = [...(data?.totp ?? []), ...(data?.phone ?? [])].find((factor) => factor.status === 'verified');
    setEnabled(Boolean(verified));
    setFactorId(verified?.id ?? '');
  }

  useEffect(() => {
    refreshFactors().catch(() => undefined);
  }, []);

  async function startEnrollment() {
    setBusy(true);
    setMessage('');
    try {
      const supabase = getSupabaseBrowserClient();
      const { data, error } = await supabase.auth.mfa.enroll({ factorType: 'totp', friendlyName: 'Aspire 101' });
      if (error) throw error;
      setEnroll({ factorId: data.id, qr: data.totp.qr_code, secret: data.totp.secret });
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not start two-step verification.');
    } finally {
      setBusy(false);
    }
  }

  async function enableMfa() {
    if (!enroll || code.length < 6) return;
    setBusy(true);
    setMessage('');
    try {
      const supabase = getSupabaseBrowserClient();
      const { data: challenge, error: challengeError } = await supabase.auth.mfa.challenge({ factorId: enroll.factorId });
      if (challengeError) throw challengeError;
      const { error: verifyError } = await supabase.auth.mfa.verify({ factorId: enroll.factorId, challengeId: challenge.id, code });
      if (verifyError) throw verifyError;
      setEnroll(null);
      setCode('');
      setMessage('Two-step verification is now enabled.');
      await refreshFactors();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'That code did not work.');
    } finally {
      setBusy(false);
    }
  }

  async function cancelEnrollment() {
    if (enroll?.factorId) {
      const supabase = getSupabaseBrowserClient();
      await supabase.auth.mfa.unenroll({ factorId: enroll.factorId }).catch(() => undefined);
    }
    setEnroll(null);
    setCode('');
  }

  async function disableMfa() {
    if (!factorId) return;
    setBusy(true);
    setMessage('');
    try {
      const supabase = getSupabaseBrowserClient();
      const { error } = await supabase.auth.mfa.unenroll({ factorId });
      if (error) throw error;
      setEnabled(false);
      setFactorId('');
      setMessage('Two-step verification is off.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not change two-step verification.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <article className="trustPassportCard mfaPassportCard">
      <div className="trustPassportIcon">02</div>
      <div className="trustPassportCopy">
        <span>ACCOUNT SECURITY</span>
        <h3>Two-step verification</h3>
        <p>{enabled ? 'A second factor is required after your password.' : 'Add an authenticator code after your password for stronger account protection.'}</p>
      </div>
      <div className={`trustPassportStatus ${enabled ? 'isVerified' : ''}`}>{enabled ? 'ENABLED ✓' : 'OPTIONAL'}</div>

      {enroll ? (
        <div className="mfaEnrollment">
          <img src={enroll.qr} alt="QR code for Aspire two-step verification" />
          <div>
            <strong>Scan with an authenticator app.</strong>
            <p>Google Authenticator, 1Password, Authy, Apple Passwords, or another TOTP app.</p>
            <code>{enroll.secret}</code>
            <label><span>Verification code</span><input inputMode="numeric" autoComplete="one-time-code" value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, '').slice(0, 10))} placeholder="000000" /></label>
            <div className="mfaActions"><button type="button" onClick={cancelEnrollment}>Cancel</button><button className="button buttonGold" type="button" onClick={enableMfa} disabled={busy || code.length < 6}>{busy ? 'Verifying…' : 'Enable →'}</button></div>
          </div>
        </div>
      ) : (
        <button className="trustPassportAction" type="button" onClick={enabled ? disableMfa : startEnrollment} disabled={busy}>{busy ? 'Working…' : enabled ? 'Turn off' : 'Set up authenticator →'}</button>
      )}
      {message && <p className="trustPassportMessage">{message}</p>}
    </article>
  );
}
