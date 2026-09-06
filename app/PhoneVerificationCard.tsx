'use client';

import { FormEvent, useMemo, useState } from 'react';
import { getSupabaseBrowserClient } from '../lib/supabase/client';

type Step = 'phone' | 'code' | 'verified';

function normalizePhone(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return '';
  if (trimmed.startsWith('+')) return `+${trimmed.slice(1).replace(/\D/g, '')}`;
  const digits = trimmed.replace(/\D/g, '');
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
  return '';
}

function maskPhone(value: string) {
  const digits = value.replace(/\D/g, '');
  if (digits.length < 4) return value;
  return `••• ••• ${digits.slice(-4)}`;
}

function friendlyPhoneError(detail: string) {
  if (/invalid from number|caller id|sms provider|phone provider|twilio|21212|unsupported|not enabled|sender/i.test(detail)) {
    return 'Phone verification is temporarily unavailable while Aspire finishes connecting its SMS sender. Your school verification still works normally.';
  }
  if (/rate limit|too many/i.test(detail)) return 'Too many verification attempts. Wait a little and try again.';
  return detail;
}

export default function PhoneVerificationCard({ initialPhone, initiallyVerified }: { initialPhone: string; initiallyVerified: boolean }) {
  const [phone, setPhone] = useState(initialPhone || '');
  const [submittedPhone, setSubmittedPhone] = useState(initialPhone || '');
  const [code, setCode] = useState('');
  const [step, setStep] = useState<Step>(initiallyVerified ? 'verified' : 'phone');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  const normalizedPhone = useMemo(() => normalizePhone(phone), [phone]);

  async function sendCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage('');
    if (!normalizedPhone) {
      setMessage('Enter a valid mobile number with country code.');
      return;
    }

    setBusy(true);
    try {
      const supabase = getSupabaseBrowserClient();
      const { error } = await supabase.auth.updateUser({ phone: normalizedPhone });
      if (error) throw error;
      setSubmittedPhone(normalizedPhone);
      setStep('code');
      setMessage('We sent a 6-digit verification code.');
    } catch (error) {
      const detail = error instanceof Error ? error.message : 'Could not send a verification code.';
      setMessage(friendlyPhoneError(detail));
    } finally {
      setBusy(false);
    }
  }

  async function verifyCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage('');
    if (!/^\d{6}$/.test(code.trim())) {
      setMessage('Enter the 6-digit code.');
      return;
    }

    setBusy(true);
    try {
      const supabase = getSupabaseBrowserClient();
      const { error } = await supabase.auth.verifyOtp({
        phone: submittedPhone,
        token: code.trim(),
        type: 'phone_change'
      });
      if (error) throw error;
      setStep('verified');
      setMessage('Phone verified.');
    } catch (error) {
      const detail = error instanceof Error ? error.message : 'That code could not be verified.';
      setMessage(friendlyPhoneError(detail));
    } finally {
      setBusy(false);
    }
  }

  if (step === 'verified') {
    return (
      <article className="profileCard profilePhoneCard isVerified">
        <div className="trustCardIcon" aria-hidden="true">⌁</div>
        <div>
          <span>PHONE</span>
          <strong>Verified ✓</strong>
          <p>{maskPhone(submittedPhone || phone)}</p>
          <small>Used as an additional trust signal for higher-trust actions.</small>
        </div>
      </article>
    );
  }

  return (
    <article className="profileCard profilePhoneCard">
      <div className="trustCardIcon" aria-hidden="true">⌁</div>
      <div className="phoneVerificationBody">
        <span>PHONE</span>
        <strong>{step === 'code' ? 'Check your phone' : 'Add another trust signal'}</strong>
        <p>{step === 'code' ? `Enter the code sent to ${maskPhone(submittedPhone)}.` : 'Optional for browsing. We can require it later for rides, paid exchanges, and other higher-trust actions.'}</p>

        {step === 'phone' ? (
          <form className="phoneVerifyForm" onSubmit={sendCode}>
            <input type="tel" value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="+1 765 555 0123" autoComplete="tel" aria-label="Mobile phone number" />
            <button className="button buttonGold" type="submit" disabled={busy}>{busy ? 'Sending…' : 'Send code'}</button>
          </form>
        ) : (
          <form className="phoneVerifyForm phoneCodeForm" onSubmit={verifyCode}>
            <input inputMode="numeric" pattern="[0-9]*" maxLength={6} value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, '').slice(0, 6))} placeholder="123456" autoComplete="one-time-code" aria-label="6-digit verification code" />
            <button className="button buttonGold" type="submit" disabled={busy}>{busy ? 'Checking…' : 'Verify'}</button>
            <button type="button" className="phoneVerifyBack" onClick={() => { setStep('phone'); setCode(''); setMessage(''); }} disabled={busy}>Change number</button>
          </form>
        )}

        {message && <small className="phoneVerifyMessage" role="status">{message}</small>}
      </div>
    </article>
  );
}
