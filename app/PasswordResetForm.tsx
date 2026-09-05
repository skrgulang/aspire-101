'use client';

import { FormEvent, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getSupabaseBrowserClient } from '../lib/supabase/client';
import { aspireLogo } from './logo';

type Mode = 'request' | 'update';

export default function PasswordResetForm({ mode }: { mode: Mode }) {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (mode !== 'request') return;
    const param = new URLSearchParams(window.location.search).get('email');
    if (param) setEmail(param);
  }, [mode]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage('');

    try {
      const supabase = getSupabaseBrowserClient();

      if (mode === 'request') {
        const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
          redirectTo: `${window.location.origin}/update-password`
        });
        if (error) throw error;
        setMessage('If an Aspire account exists for that email, a password reset link is on the way. Check your inbox and spam folder.');
      } else {
        if (password.length < 6) throw new Error('Password must be at least 6 characters.');
        if (password !== confirmPassword) throw new Error('Passwords do not match.');

        const { data: sessionData } = await supabase.auth.getSession();
        if (!sessionData.session) {
          throw new Error('Open this page from the password reset email so Aspire can verify your recovery session.');
        }

        const { error } = await supabase.auth.updateUser({ password });
        if (error) throw error;
        setMessage('Password updated. Taking you back to log in…');
        window.setTimeout(() => router.push('/login'), 900);
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Something went wrong. Try again.');
    } finally {
      setBusy(false);
    }
  }

  const requesting = mode === 'request';

  return (
    <main className="authPage">
      <a className="authBrand" href="/" aria-label="Aspire 101 home">
        <img src={aspireLogo} alt="" />
        <span>Aspire 101</span>
      </a>

      <section className="authShell">
        <div className="authStory">
          <p className="eyebrow">ACCOUNT RECOVERY</p>
          <h1>{requesting ? 'Get back in.' : 'Choose a new password.'}</h1>
          <p>{requesting ? 'Enter the email you used for Aspire and we’ll send a secure recovery link.' : 'Use a new password for your Aspire account, then jump back into campus.'}</p>
          <div className="authMiniRequests" aria-hidden="true">
            <span>Your requests stay with your account.</span>
            <span>Your connections stay with you.</span>
          </div>
        </div>

        <form className="authCard" onSubmit={submit}>
          <div className="authCardTop">
            <span>{requesting ? 'RESET PASSWORD' : 'NEW PASSWORD'}</span>
            <a href="/login">Back to login</a>
          </div>

          {requesting ? (
            <label>
              <span>Email</span>
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" autoComplete="email" required />
            </label>
          ) : (
            <>
              <label>
                <span>New password</span>
                <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="At least 6 characters" minLength={6} autoComplete="new-password" required />
              </label>
              <label>
                <span>Confirm password</span>
                <input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} placeholder="Enter it again" minLength={6} autoComplete="new-password" required />
              </label>
            </>
          )}

          <button className="button buttonGold authSubmit" type="submit" disabled={busy}>
            {busy ? 'One second…' : requesting ? 'Send reset link →' : 'Update password →'}
          </button>

          {message && <p className="authMessage" role="status">{message}</p>}
        </form>
      </section>
    </main>
  );
}
