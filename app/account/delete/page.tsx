'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getSupabaseBrowserClient } from '../../../lib/supabase/client';
import AppDock from '../../AppDock';
import AppLoader from '../../AppLoader';
import styles from './DeleteAccount.module.css';

type Blocker = { code: string; message: string; href?: string };

export default function DeleteAccountPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [typedEmail, setTypedEmail] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [busy, setBusy] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [ready, setReady] = useState(false);
  const [message, setMessage] = useState('');
  const [blockers, setBlockers] = useState<Blocker[]>([]);

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

  async function getToken() {
    const supabase = getSupabaseBrowserClient();
    const { data, error } = await supabase.auth.getSession();
    if (error || !data.session?.access_token) throw new Error('Your session expired. Sign in again and retry.');
    return data.session.access_token;
  }

  async function downloadData() {
    setExporting(true);
    setMessage('');
    try {
      const token = await getToken();
      const response = await fetch('/api/account/export', { headers: { Authorization: `Bearer ${token}` } });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload?.error || 'Could not prepare your data export.');
      }
      const blob = await response.blob();
      const disposition = response.headers.get('content-disposition') || '';
      const filename = disposition.match(/filename="([^"]+)"/)?.[1] || 'aspire-101-data.json';
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = filename;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not prepare your data export.');
    } finally {
      setExporting(false);
    }
  }

  async function deleteAccount() {
    if (busy || confirmation !== 'DELETE' || typedEmail.trim().toLowerCase() !== email.toLowerCase()) return;
    setBusy(true);
    setMessage('');
    setBlockers([]);

    try {
      const token = await getToken();
      const response = await fetch('/api/account/delete', {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ confirmation, email: typedEmail })
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        setBlockers(Array.isArray(payload?.blockers) ? payload.blockers : []);
        throw new Error(payload?.error || 'Could not delete your account.');
      }

      const supabase = getSupabaseBrowserClient();
      await supabase.auth.signOut().catch(() => undefined);
      window.location.assign('/?account=deleted');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not delete your account.');
      setBusy(false);
    }
  }

  if (!ready) return <AppLoader label="Opening account controls…" detail="Privacy + account" />;

  const confirmed = confirmation === 'DELETE' && typedEmail.trim().toLowerCase() === email.toLowerCase();

  return (
    <main className={styles.page}>
      <AppDock active="profile" />
      <div className={styles.shell}>
        <a className={styles.back} href="/settings">← Back to Settings</a>
        <section className={styles.card}>
          <header className={styles.head}>
            <span className={styles.eyebrow}>DANGER ZONE</span>
            <h1>Delete your account.</h1>
            <p>Account deletion closes your Aspire login, removes or anonymizes direct personal data, and takes your active profile off the platform. Some limited financial, dispute, moderation, and safety records may be retained when needed for accounting, refunds, legal obligations, or platform integrity.</p>
          </header>

          <div className={styles.body}>
            <div className={styles.accountLine}><span>Account</span><strong>{email}</strong></div>

            <div className={styles.steps}>
              <div className={styles.step}><b>01</b><strong>Finish open obligations</strong><span>Active connections, unresolved payments, orders, or Resolution Center cases must be closed first.</span></div>
              <div className={styles.step}><b>02</b><strong>Direct data is removed</strong><span>Profile details, verification records, location data, preferences, notifications, AI sessions, uploaded request photos, and other direct account data are removed or anonymized.</span></div>
              <div className={styles.step}><b>03</b><strong>Login is permanently closed</strong><span>Your Supabase Auth identity is soft-deleted so retained records can stay attached to an opaque account ID without keeping a usable login.</span></div>
            </div>

            <div className={styles.notice}>
              <strong>Download your data first</strong>
              <p>You can save a JSON copy of your profile, settings, requests, media metadata, connections, messages, reviews, payments, and Resolution Center history before deleting the account.</p>
              <div className={styles.actions}>
                <button type="button" className={styles.secondary} onClick={downloadData} disabled={exporting}>{exporting ? 'Preparing export…' : 'Download my Aspire data'}</button>
              </div>
            </div>

            <div className={`${styles.notice} ${styles.warning}`}>
              <strong>This action cannot be undone.</strong>
              <p>For security, Aspire requires a recent sign-in. If your last sign-in was more than 30 minutes ago, you will be asked to log out and sign back in before deletion.</p>
            </div>

            <div className={styles.form}>
              <label className={styles.field}>
                <span>Enter your account email</span>
                <input value={typedEmail} onChange={(event) => setTypedEmail(event.target.value)} autoComplete="email" placeholder={email} />
              </label>
              <label className={styles.field}>
                <span>Type DELETE</span>
                <input value={confirmation} onChange={(event) => setConfirmation(event.target.value)} autoComplete="off" spellCheck={false} placeholder="DELETE" />
              </label>

              {message && <p className={styles.message} role="alert">{message}</p>}
              {blockers.length > 0 && (
                <div className={styles.blockers}>
                  {blockers.map((blocker) => (
                    <div className={styles.blocker} key={blocker.code}>
                      <span>{blocker.message}</span>
                      {blocker.href && <a href={blocker.href}>Resolve →</a>}
                    </div>
                  ))}
                </div>
              )}

              <div className={styles.actions}>
                <button type="button" className={styles.danger} onClick={deleteAccount} disabled={!confirmed || busy}>{busy ? 'Deleting account…' : 'Permanently delete account'}</button>
                <a className={styles.linkButton} href="/settings">Cancel</a>
              </div>
            </div>

            <p className={styles.fine}>Deleting your Aspire account does not automatically erase records held by third-party payment processors where they have their own legal or regulatory retention duties.</p>
          </div>
        </section>
      </div>
    </main>
  );
}
