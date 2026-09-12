'use client';

import { FormEvent, useMemo, useState } from 'react';
import {
  openResolutionCase,
  RequestedResolution,
  ResolutionReason
} from '../lib/supabase/resolution';
import type { LiveConnection } from '../lib/supabase/liveConnections';
import styles from './ResolutionCenterModal.module.css';

type Props = {
  connection: LiveConnection;
  currentUserId: string;
  otherUserId: string;
  otherName: string;
  onClose: () => void;
  onOpened: () => void | Promise<void>;
};

const reasons: { value: ResolutionReason; label: string; detail: string }[] = [
  { value: 'no_show', label: 'Someone didn’t show up', detail: 'Available after a 10-minute grace period from the agreed start time.' },
  { value: 'cancellation', label: 'Someone cancelled', detail: 'Use this when plans were cancelled after the connection was confirmed.' },
  { value: 'incomplete', label: 'Task wasn’t completed', detail: 'The agreed service or help was not completed.' },
  { value: 'not_as_described', label: 'Not as described', detail: 'The item, service, or outcome was materially different from the agreement.' },
  { value: 'payment', label: 'Payment problem', detail: 'Unexpected charge, duplicate payment, refund, or payout concern.' },
  { value: 'safety', label: 'Safety concern', detail: 'Use this for unsafe behavior or a situation that needs Trust & Safety review.' },
  { value: 'other', label: 'Something else', detail: 'Tell Aspire what happened in your own words.' }
];

export default function ResolutionCenterModal({ connection, currentUserId, otherUserId, otherName, onClose, onOpened }: Props) {
  void currentUserId;
  const [reason, setReason] = useState<ResolutionReason>('cancellation');
  const [requestedResolution, setRequestedResolution] = useState<RequestedResolution>('review');
  const [details, setDetails] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const noShowState = useMemo(() => {
    if (!connection.scheduled_start_at) return { allowed: false, label: 'Set an agreed time first.' };
    const unlockAt = new Date(connection.scheduled_start_at).getTime() + 10 * 60_000;
    const allowed = Date.now() >= unlockAt;
    return {
      allowed,
      label: allowed
        ? 'No-show reporting is available now.'
        : `Available ${new Date(unlockAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}.`
    };
  }, [connection.scheduled_start_at]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      await openResolutionCase({
        connectionId: connection.id,
        reason,
        details,
        requestedResolution: reason === 'safety' ? 'safety_review' : requestedResolution,
        againstUserId: otherUserId
      });
      await onOpened();
      onClose();
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Could not open this case.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={styles.backdrop} role="dialog" aria-modal="true" aria-label="Aspire Resolution Center">
      <form className={styles.modal} onSubmit={submit}>
        <button className={styles.close} type="button" onClick={onClose} aria-label="Close">×</button>
        <span className={styles.eyebrow}>ASPIRE RESOLUTION CENTER</span>
        <h2>What happened?</h2>
        <p className={styles.lead}>Report an issue with {otherName}. If this connection uses Pay with Aspire, an open case pauses provider payout while Aspire reviews it.</p>

        <div className={styles.reasonList}>
          {reasons.map((item) => {
            const disabled = item.value === 'no_show' && !noShowState.allowed;
            return (
              <label key={item.value} className={`${styles.reason} ${reason === item.value ? styles.selected : ''} ${disabled ? styles.disabled : ''}`}>
                <input
                  type="radio"
                  name="resolution-reason"
                  value={item.value}
                  checked={reason === item.value}
                  disabled={disabled}
                  onChange={() => setReason(item.value)}
                />
                <span><strong>{item.label}</strong><small>{item.value === 'no_show' ? noShowState.label : item.detail}</small></span>
              </label>
            );
          })}
        </div>

        {reason !== 'safety' && (
          <label className={styles.field}>
            <span>What outcome are you asking for?</span>
            <select value={requestedResolution} onChange={(event) => setRequestedResolution(event.target.value as RequestedResolution)}>
              <option value="review">Let Aspire decide after review</option>
              <option value="refund">Refund my Aspire payment — if I was the payer</option>
              <option value="provider_compensation">Provider cancellation / no-show compensation — if applicable</option>
              <option value="partial">Partial refund / partial payment</option>
            </select>
            <small>Aspire verifies the actual payer/payee roles from the transaction record. A request here does not move money automatically.</small>
          </label>
        )}

        <label className={styles.field}>
          <span>Tell us what happened</span>
          <textarea
            rows={4}
            maxLength={2000}
            value={details}
            onChange={(event) => setDetails(event.target.value)}
            placeholder="Keep it factual: agreed time, what you did, what happened, and whether you tried to contact the other person."
          />
          <small>{details.length}/2000</small>
        </label>

        <div className={styles.protection}>
          <strong>What happens next</strong>
          <p>Aspire keeps the payment from being released while an eligible case is open. Trust & Safety can review the connection timeline, arrival/status events, the agreed time, and relevant platform records. Location is optional and is not required to file a claim.</p>
        </div>

        {error && <div className={styles.error} role="alert">{error}</div>}

        <div className={styles.actions}>
          <button type="button" onClick={onClose}>Cancel</button>
          <button className={styles.primary} type="submit" disabled={busy}>{busy ? 'Opening case…' : 'Open case & pause payout'}</button>
        </div>
      </form>
    </div>
  );
}
