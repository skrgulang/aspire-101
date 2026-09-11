'use client';

import { FormEvent, useState } from 'react';
import { cancelConnectionWithProtection, LiveConnection } from '../lib/supabase/liveConnections';
import styles from './CancelConnectionModal.module.css';

type Props = {
  connection: LiveConnection;
  otherName: string;
  onClose: () => void;
  onCancelled: (result: Awaited<ReturnType<typeof cancelConnectionWithProtection>>) => void | Promise<void>;
};

export default function CancelConnectionModal({ connection, otherName, onClose, onCancelled }: Props) {
  const [note, setNote] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!confirmed) return setError('Confirm that you understand this ends the active connection.');
    setBusy(true);
    setError('');
    try {
      const result = await cancelConnectionWithProtection(connection.id, note);
      await onCancelled(result);
      onClose();
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Could not cancel this connection.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={styles.backdrop} role="dialog" aria-modal="true" aria-label="Cancel Aspire connection">
      <form className={styles.modal} onSubmit={submit}>
        <button className={styles.close} type="button" onClick={onClose} aria-label="Close">×</button>
        <span className={styles.eyebrow}>CANCEL CONNECTION</span>
        <h2>Tell {otherName} you’re cancelling.</h2>
        <p className={styles.lead}>This is different from reporting a no-show. You are creating a timestamped record that <b>you</b> ended the connection.</p>

        <div className={styles.compare}>
          <article>
            <strong>Can’t make it</strong>
            <span>Only adds a coordination update. The connection stays active so you can reschedule.</span>
          </article>
          <article className={styles.cancelChoice}>
            <strong>Cancel connection</strong>
            <span>Ends the active connection. If protected money is already secured, Aspire opens a review and keeps payout paused.</span>
          </article>
        </div>

        <label className={styles.field}>
          <span>Short note <em>optional</em></span>
          <textarea
            rows={3}
            maxLength={1000}
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder="Example: My plans changed and I can’t make the agreed time."
          />
          <small>{note.length}/1000</small>
        </label>

        <div className={styles.moneyNotice}>
          <strong>Cancellation does not automatically decide who gets the money.</strong>
          <p>If no Pay with Aspire payment is secured, the connection simply closes. If a protected payment is already secured, Aspire opens or keeps a Resolution Center case so payout remains paused until review. Refunds or provider compensation depend on the transaction state and policy.</p>
          <a href="/resolution-policy" target="_blank" rel="noreferrer">Read cancellation &amp; refund policy ↗</a>
        </div>

        <label className={styles.confirm}>
          <input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} />
          <span>I understand this ends the active connection and creates a shared cancellation record.</span>
        </label>

        {error && <div className={styles.error} role="alert">{error}</div>}

        <div className={styles.actions}>
          <button type="button" onClick={onClose}>Keep connection</button>
          <button className={styles.danger} type="submit" disabled={busy || !confirmed}>{busy ? 'Cancelling…' : 'Cancel connection'}</button>
        </div>
      </form>
    </div>
  );
}
