'use client';

import { useEffect, useState } from 'react';
import styles from './PendingChoiceFlash.module.css';

const STORAGE_KEY = 'aspire-pending-choice-outcome';

export default function PendingChoiceFlash() {
  const [message, setMessage] = useState('');

  useEffect(() => {
    const outcome = window.sessionStorage.getItem(STORAGE_KEY);
    if (!outcome) return;
    window.sessionStorage.removeItem(STORAGE_KEY);
    setMessage(outcome === 'responder_declined'
      ? 'You declined before connecting. The original request is open again so the requester can choose someone else.'
      : 'The unconfirmed choice was cleared. Your original request is open again and the previous responses are available to review.');
  }, []);

  if (!message) return null;

  return (
    <div className={styles.flash} role="status">
      <strong>Request reopened</strong>
      <span>{message}</span>
      <button type="button" onClick={() => setMessage('')} aria-label="Dismiss">×</button>
    </div>
  );
}
