'use client';

import { useEffect } from 'react';
import { requestLanguages, type RequestLanguageCode } from '../lib/supabase/requests';
import styles from './PostLanguagePicker.module.css';

type Props = {
  value: RequestLanguageCode;
  onChange: (value: RequestLanguageCode) => void;
  compact?: boolean;
};

const storageKey = 'aspire:post-language';

export default function PostLanguagePicker({ value, onChange, compact = false }: Props) {
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try { window.localStorage.setItem(storageKey, value); } catch { /* ignore storage errors */ }
  }, [value]);

  const languages = requestLanguages.filter((item) => item.value !== 'any');

  return (
    <section className={`${styles.root} ${compact ? styles.compact : ''}`} aria-label="Post language">
      <div className={styles.heading}>
        <div><span>WHO CAN SEE THIS?</span><strong>Language reach</strong></div>
        <small>You can target one language, or leave it open to everyone.</small>
      </div>

      <button
        className={`${styles.anyOption} ${value === 'any' ? styles.active : ''}`}
        type="button"
        onClick={() => onChange('any')}
      >
        <i>∞</i>
        <div><strong>Doesn’t matter</strong><span>Any language · show this post in every language feed.</span></div>
        <b>{value === 'any' ? '✓' : ''}</b>
      </button>

      <div className={styles.chips} role="group" aria-label="Choose one post language">
        {languages.map((item) => (
          <button
            type="button"
            key={item.value}
            className={value === item.value ? styles.selected : ''}
            onClick={() => onChange(item.value)}
          >
            {item.label}
          </button>
        ))}
      </div>
    </section>
  );
}
