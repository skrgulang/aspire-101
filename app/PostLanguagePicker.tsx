'use client';

import { useEffect, useState } from 'react';
import { detectRequestLanguage, requestLanguages, type RequestLanguageCode } from '../lib/supabase/requests';

const storageKey = 'aspire:post-language';

export default function PostLanguagePicker() {
  const [language, setLanguage] = useState<RequestLanguageCode>('en');

  useEffect(() => {
    const stored = window.localStorage.getItem(storageKey) as RequestLanguageCode | null;
    const validStored = requestLanguages.some((item) => item.value === stored);
    const next = validStored ? stored! : detectRequestLanguage(window.navigator.language);
    setLanguage(next);
    window.localStorage.setItem(storageKey, next);
  }, []);

  function choose(next: RequestLanguageCode) {
    setLanguage(next);
    window.localStorage.setItem(storageKey, next);
  }

  return (
    <section style={{ marginBottom: 18, padding: '16px 18px', border: '1px solid rgba(255,190,30,.28)', borderRadius: 18, background: 'rgba(255,190,30,.045)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
        <div>
          <span style={{ display: 'block', color: '#f7b916', fontSize: 11, fontWeight: 900, letterSpacing: '.1em', marginBottom: 4 }}>POST LANGUAGE</span>
          <strong style={{ display: 'block', fontSize: 16 }}>Who should this post reach?</strong>
          <small style={{ opacity: .65 }}>Students can filter Browse by language.</small>
        </div>
        <select
          value={language}
          onChange={(event) => choose(event.target.value as RequestLanguageCode)}
          aria-label="Choose post language"
          style={{ minWidth: 190, background: '#171714', color: 'inherit', border: '1px solid rgba(255,255,255,.14)', borderRadius: 12, padding: '10px 34px 10px 12px', fontWeight: 800 }}
        >
          {requestLanguages.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
        </select>
      </div>
    </section>
  );
}
