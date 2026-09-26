'use client';

import { useEffect, useState } from 'react';
import { requestLanguages } from '../lib/supabase/requests';

const storageKey = 'aspire:discover-language';
const refreshEvent = 'aspire:campus-feed-refresh';

export default function DiscoverLanguageFilter() {
  const [language, setLanguage] = useState('all');

  useEffect(() => {
    const stored = window.localStorage.getItem(storageKey);
    if (stored === 'all' || requestLanguages.some((item) => item.value !== 'any' && item.value === stored)) setLanguage(stored || 'all');
  }, []);

  function choose(next: string) {
    setLanguage(next);
    window.localStorage.setItem(storageKey, next);
    window.dispatchEvent(new Event(refreshEvent));
  }

  return (
    <label className="discoverLanguageFilter">
      <span>Language</span>
      <select
        value={language}
        onChange={(event) => choose(event.target.value)}
        aria-label="Filter campus posts by language"
      >
        <option value="all">All languages</option>
        {requestLanguages.filter((item) => item.value !== 'any').map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
      </select>
    </label>
  );
}
