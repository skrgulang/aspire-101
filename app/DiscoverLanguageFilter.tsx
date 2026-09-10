'use client';

import { useEffect, useState } from 'react';
import { requestLanguages } from '../lib/supabase/requests';

const storageKey = 'aspire:discover-language';
const refreshEvent = 'aspire:campus-feed-refresh';

export default function DiscoverLanguageFilter() {
  const [language, setLanguage] = useState('all');

  useEffect(() => {
    const stored = window.localStorage.getItem(storageKey);
    if (stored === 'all' || requestLanguages.some((item) => item.value === stored)) setLanguage(stored || 'all');
  }, []);

  function choose(next: string) {
    setLanguage(next);
    window.localStorage.setItem(storageKey, next);
    window.dispatchEvent(new Event(refreshEvent));
  }

  return (
    <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 10, margin: '0 0 14px', flexWrap: 'wrap' }}>
      <span style={{ fontSize: 12, fontWeight: 800, letterSpacing: '.08em', opacity: .65 }}>POST LANGUAGE</span>
      <select
        value={language}
        onChange={(event) => choose(event.target.value)}
        aria-label="Filter campus posts by language"
        style={{ background: '#171714', color: 'inherit', border: '1px solid rgba(255,255,255,.14)', borderRadius: 12, padding: '9px 34px 9px 12px', fontWeight: 700 }}
      >
        <option value="all">All languages</option>
        {requestLanguages.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
      </select>
    </div>
  );
}
