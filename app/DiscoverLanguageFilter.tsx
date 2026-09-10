'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { requestLanguages } from '../lib/supabase/requests';
import styles from './DiscoverSmartFilter.module.css';

const languageStorageKey = 'aspire:discover-language';
const keywordStorageKey = 'aspire:discover-keywords';
const refreshEvent = 'aspire:campus-feed-refresh';
const suggestedKeywords = ['Airport', 'IND', 'Ride', 'Math 55', 'Study', 'Valorant', 'Gaming', 'Moving', 'Photographer', 'BuildPurdue', 'Free', 'Paid'];

function readStoredKeywords() {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(keywordStorageKey) || '[]');
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is string => typeof item === 'string' && item.trim().length > 0).slice(0, 8);
  } catch {
    return [];
  }
}

export default function DiscoverLanguageFilter() {
  const [language, setLanguage] = useState('all');
  const [keywords, setKeywords] = useState<string[]>([]);
  const [draft, setDraft] = useState('');
  const [open, setOpen] = useState(false);
  const [portalTarget, setPortalTarget] = useState<HTMLElement | null>(null);

  useEffect(() => {
    const storedLanguage = window.localStorage.getItem(languageStorageKey);
    if (storedLanguage === 'all' || requestLanguages.some((item) => item.value === storedLanguage)) {
      setLanguage(storedLanguage || 'all');
    }
    setKeywords(readStoredKeywords());

    let frame = 0;
    const findTarget = () => {
      const target = document.querySelector<HTMLElement>('.discoverV2SearchBox');
      if (target) {
        setPortalTarget(target);
        return;
      }
      frame = window.requestAnimationFrame(findTarget);
    };
    findTarget();
    return () => window.cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open]);

  const activeCount = useMemo(() => keywords.length + (language === 'all' ? 0 : 1), [keywords, language]);

  function notifyFeed() {
    window.dispatchEvent(new Event(refreshEvent));
  }

  function chooseLanguage(next: string) {
    setLanguage(next);
    window.localStorage.setItem(languageStorageKey, next);
    notifyFeed();
  }

  function saveKeywords(next: string[]) {
    const cleaned = next
      .map((item) => item.trim())
      .filter(Boolean)
      .filter((item, index, all) => all.findIndex((other) => other.toLowerCase() === item.toLowerCase()) === index)
      .slice(0, 8);
    setKeywords(cleaned);
    window.localStorage.setItem(keywordStorageKey, JSON.stringify(cleaned));
    notifyFeed();
  }

  function toggleKeyword(keyword: string) {
    const exists = keywords.some((item) => item.toLowerCase() === keyword.toLowerCase());
    saveKeywords(exists ? keywords.filter((item) => item.toLowerCase() !== keyword.toLowerCase()) : [...keywords, keyword]);
  }

  function addKeyword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const value = draft.trim().slice(0, 40);
    if (!value) return;
    saveKeywords([...keywords, value]);
    setDraft('');
  }

  function clearAll() {
    setLanguage('all');
    setKeywords([]);
    setDraft('');
    window.localStorage.setItem(languageStorageKey, 'all');
    window.localStorage.removeItem(keywordStorageKey);
    notifyFeed();
  }

  if (!portalTarget) return null;

  return createPortal(
    <div className={styles.root}>
      <button
        type="button"
        className={`${styles.trigger} ${activeCount ? styles.active : ''}`}
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label={activeCount ? `Search filters, ${activeCount} active` : 'Search filters'}
      >
        <span className={styles.sliders} aria-hidden="true"><i /><i /><i /></span>
        <span>Filters</span>
        {activeCount > 0 && <b>{activeCount}</b>}
      </button>

      {open && (
        <div className={styles.panel} role="dialog" aria-label="Smart search filters">
          <div className={styles.panelHead}>
            <div><span>SMART SEARCH</span><strong>Filter campus</strong></div>
            <button type="button" onClick={() => setOpen(false)} aria-label="Close filters">×</button>
          </div>

          <section className={styles.section}>
            <div className={styles.sectionHead}><strong>Keywords</strong><span>Choose a few or add your own</span></div>
            <div className={styles.chips}>
              {suggestedKeywords.map((keyword) => {
                const selected = keywords.some((item) => item.toLowerCase() === keyword.toLowerCase());
                return <button key={keyword} type="button" className={selected ? styles.selected : ''} onClick={() => toggleKeyword(keyword)}>{keyword}{selected && <span>✓</span>}</button>;
              })}
            </div>
            <form className={styles.addKeyword} onSubmit={addKeyword}>
              <input value={draft} onChange={(event) => setDraft(event.target.value)} maxLength={40} placeholder="Add keyword — e.g. piano, roommate, CS 180" aria-label="Add a search keyword" />
              <button type="submit" disabled={!draft.trim()}>Add</button>
            </form>
            {keywords.some((keyword) => !suggestedKeywords.some((suggestion) => suggestion.toLowerCase() === keyword.toLowerCase())) && (
              <div className={styles.customKeywords}>
                {keywords.filter((keyword) => !suggestedKeywords.some((suggestion) => suggestion.toLowerCase() === keyword.toLowerCase())).map((keyword) => (
                  <button key={keyword} type="button" onClick={() => toggleKeyword(keyword)}>{keyword}<span>×</span></button>
                ))}
              </div>
            )}
          </section>

          <section className={styles.section}>
            <div className={styles.sectionHead}><strong>Language</strong><span>Only show posts in this language</span></div>
            <select value={language} onChange={(event) => chooseLanguage(event.target.value)} aria-label="Filter campus posts by language">
              <option value="all">All languages</option>
              {requestLanguages.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
            </select>
          </section>

          <div className={styles.footer}>
            <button type="button" className={styles.clear} onClick={clearAll} disabled={!activeCount}>Clear all</button>
            <button type="button" className={styles.done} onClick={() => setOpen(false)}>Show results</button>
          </div>
        </div>
      )}
    </div>,
    portalTarget
  );
}
