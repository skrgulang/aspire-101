'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getSupabaseBrowserClient } from '../../../lib/supabase/client';
import { aspireLogo } from '../../logo';
import AppLoader from '../../AppLoader';

export default function DeleteAccountPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const supabase = getSupabaseBrowserClient();
    supabase.auth.getUser().then(({ data }) => {
      if (!data.user) {
        router.replace('/login?next=%2Faccount%2Fdelete');
        return;
      }
      setEmail(data.user.email || '');
      setReady(true);
    });
  }, [router]);

  async function deleteAccount() {
    if (confirmation !== 'DELETE' || busy) return;
    setBusy(true);
    setMessage('');

    try {
      const supabase = getSupabaseBrowserClient();
      const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
      if (sessionError || !sessionData.session?.access_token) throw new Error('Your session expired. Sign in again and retry.');

      const response = await fetch('/api/account/delete', {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${sessionData.session.access_token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ confirmation })
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload?.error || 'Could not delete your account.');

      await supabase.auth.signOut().catch(() => undefined);
      window.location.assign('/?account=deleted');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not delete your account.');
      setBusy(false);
    }
  }

  if (!ready) return <AppLoader label="Opening account settings…" detail="Privacy + account" />;

  return (
    <main style={{ minHeight: '100vh', background: '#080807', color: '#f3efe6', padding: '28px 18px 80px' }}>
      <div style={{ width: 'min(760px, 100%)', margin: '0 auto' }}>
        <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16, marginBottom: 56 }}>
          <a href="/profile" style={{ display: 'inline-flex', alignItems: 'center', gap: 10, color: 'inherit', textDecoration: 'none' }}>
            <img src={aspireLogo} alt="" style={{ width: 32, height: 32 }} />
            <strong>Aspire 101</strong>
          </a>
          <a href="/profile" style={{ color: '#9b9386', fontSize: 13 }}>Back to profile →</a>
        </header>

        <section style={{ border: '1px solid rgba(255,255,255,.1)', borderRadius: 28, padding: 'clamp(24px, 5vw, 44px)', background: 'rgba(255,255,255,.018)', boxShadow: '0 28px 90px rgba(0,0,0,.3)' }}>
          <span style={{ display: 'inline-block', color: '#ffb0a8', fontSize: 11, fontWeight: 900, letterSpacing: '.16em', marginBottom: 12 }}>DANGER ZONE</span>
          <h1 style={{ margin: 0, fontSize: 'clamp(38px, 7vw, 64px)', letterSpacing: '-.055em', lineHeight: .98 }}>Delete your account.</h1>
          <p style={{ margin: '18px 0 0', maxWidth: 620, color: '#a49b8d', lineHeight: 1.65, fontSize: 14 }}>
            This permanently removes your Aspire login and direct account data such as your profile, verification records, location data, notifications, trust settings, and account-specific AI sessions.
          </p>

          <div style={{ marginTop: 26, padding: 18, borderRadius: 18, border: '1px solid rgba(255,135,120,.18)', background: 'rgba(255,90,70,.035)' }}>
            <strong style={{ display: 'block', marginBottom: 8, fontSize: 13 }}>Some records may be retained.</strong>
            <p style={{ margin: 0, color: '#8f877b', fontSize: 12, lineHeight: 1.6 }}>
              Aspire may retain limited transaction, payment-ledger, dispute, moderation, fraud-prevention, or safety records where required for accounting, legal obligations, or platform integrity. These records are not used to keep your account active.
            </p>
          </div>

          <div style={{ marginTop: 28 }}>
            <div style={{ marginBottom: 16 }}>
              <span style={{ display: 'block', color: '#756e64', fontSize: 10, fontWeight: 800, letterSpacing: '.12em', marginBottom: 6 }}>ACCOUNT</span>
              <strong style={{ fontSize: 14 }}>{email}</strong>
            </div>

            <label style={{ display: 'block' }}>
              <span style={{ display: 'block', marginBottom: 8, color: '#a59d90', fontSize: 12 }}>Type <strong style={{ color: '#f3efe6' }}>DELETE</strong> to confirm.</span>
              <input
                value={confirmation}
                onChange={(event) => setConfirmation(event.target.value)}
                autoComplete="off"
                spellCheck={false}
                placeholder="DELETE"
                style={{ width: '100%', minHeight: 52, boxSizing: 'border-box', borderRadius: 14, border: '1px solid rgba(255,255,255,.12)', background: '#0d0d0b', color: '#f3efe6', padding: '0 15px', font: 'inherit', outline: 'none' }}
              />
            </label>

            {message && <p role="alert" style={{ color: '#ffb0a8', fontSize: 12, marginTop: 12 }}>{message}</p>}

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginTop: 22 }}>
              <button
                type="button"
                onClick={deleteAccount}
                disabled={busy || confirmation !== 'DELETE'}
                style={{ minHeight: 46, padding: '0 18px', borderRadius: 13, border: '1px solid rgba(255,120,105,.35)', background: confirmation === 'DELETE' ? '#d84d3f' : 'rgba(255,255,255,.05)', color: confirmation === 'DELETE' ? '#fff' : '#716a61', fontWeight: 850, cursor: confirmation === 'DELETE' && !busy ? 'pointer' : 'not-allowed' }}
              >
                {busy ? 'Deleting account…' : 'Permanently delete account'}
              </button>
              <button
                type="button"
                onClick={() => router.push('/profile')}
                disabled={busy}
                style={{ minHeight: 46, padding: '0 18px', borderRadius: 13, border: '1px solid rgba(255,255,255,.1)', background: 'transparent', color: '#b4ac9f', fontWeight: 750, cursor: 'pointer' }}
              >
                Cancel
              </button>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
