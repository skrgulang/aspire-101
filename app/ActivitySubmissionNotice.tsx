'use client';

import { useEffect, useState } from 'react';
import styles from './ActivitySubmissionNotice.module.css';

export default function ActivitySubmissionNotice() {
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setSubmitted(params.get('submitted') === '1' && Boolean(params.get('review')));
  }, []);

  if (!submitted) return null;

  return (
    <section className={styles.notice} role="status" aria-live="polite">
      <div>
        <span>LISTING SUBMITTED</span>
        <strong>Your item is in review.</strong>
        <p>It stays private until the required Post, Language, and Market checks pass. Track the same listing below.</p>
      </div>
      <a href="/marketplace-rules">Marketplace rules →</a>
    </section>
  );
}
