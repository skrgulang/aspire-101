'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { requestLanguages } from '../lib/supabase/requests';
import styles from './DiscoverSmartFilter.module.css';

const languageStorageKey = 'aspire:discover-language';
const keywordStorageKey = 'aspire:discover-keywords';
const priceStorageKey = 'aspire:discover-price';
const photoStorageKey = 'aspire:discover-photo-only';
const timeStorageKey = 'aspire:discover-time';
const sortStorageKey = 'aspire:discover-sort';
const refreshEvent = 'aspire:campus-feed-refresh';
const suggestedKeywords = ['Airport', 'IND', 'Ride', 'Math 55', 'Study', 'Valorant', 'Gaming', 'Moving', 'Photographer', 'BuildPurdue'];

type PriceFilter = 'any' | 'free' | 'paid';
type TimeFilter = 'any' | 'today' | 'tonight' | 'tomorrow' | 'week';
type SortMode = 'best' | 'soonest' | 'newest' | 'highest';

const timeOptions: { value: TimeFilter; label: string }[] = [
  { value: 'any', label: 'Any time' },
  { value: 'today', label: 'Today' },
  { value: 'tonight', label: 'Tonight' },
  { value: 'tomorrow', label: 'Tomorrow' },
  { value: 'week', label: 'This week' }
];

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
  const [price, setPrice] = useState<PriceFilter>('any');
  const [photoOnly, setPhotoOnly] = useState(false);
  const [time, setTime] = useState<TimeFilter>('any');
  const [sort, setSort] = useState<SortMode>('best');
  const [draft, setDraft] = useState('');
  const [open, setOpen] = useState(false);
  const [portalTarget, setPortalTarget] = useState<HTMLElement | null>(null);

  useEffect(() => {
    const storedLanguage = window.localStorage.getItem(languageStorageKey);
    if (storedLanguage === 'all' || requestLanguages.some((item) => item.value === storedLanguage)) {
      setLanguage(storedLanguage || 'all');
    }
    setKeywords(readStoredKeywords());

    const storedPrice = window.localStorage.getItem(priceStorageKey);
    if (storedPrice === 'free' || storedPrice === 'paid' || storedPrice === 'any') setPrice(storedPrice);
    setPhotoOnly(window.localStorage.getItem(photoStorageKey) === '1');

    const storedTime = window.localStorage.getItem(timeStorageKey);
    if (storedTime === 'today' || storedTime === 'tonight' || storedTime === 'tomorrow' || storedTime === 'week' || storedTime === 'any') {
      setTime(storedTime);
    }

    const storedSort = window.localStorage.getItem(sortStorageKey);
    if (storedSort === 'best' || storedSort === 'soonest' || storedSort === 'newest' || storedSort === 'highest') {
      setSort(storedSort);
    }

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
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node | null;
      const panel = document.querySelector('[data-aspire-smart-filter-panel]');
      const trigger = document.querySelector('[data-aspire-smart-filter-trigger]');
      if (target && panel && trigger && !panel.contains(target) && !trigger.contains(target)) setOpen(false);
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('pointerdown', onPointerDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('pointerdown', onPointerDown);
    };
  }, [open]);

  const activeCount = useMemo(
    () => keywords.length + (language === 'all' ? 0 : 1) + (price === 'any' ? 0 : 1) + (photoOnly ? 1 : 0) + (time === 'any' ? 0 : 1),
    [keywords, language, price, photoOnly, time]
  );

  function notifyFeed() {
    window.dispatchEvent(new Event(refreshEvent));
  }

  function chooseLanguage(next: string) {
    setLanguage(next);
    window.localStorage.setItem(languageStorageKey, next);
    notifyFeed();
  }

  function choosePrice(next: PriceFilter) {
    setPrice(next);
    window.localStorage.setItem(priceStorageKey, next);
    notifyFeed();
  }

  function choosePhotoOnly(next: boolean) {
    setPhotoOnly(next);
    window.localStorage.setItem(photoStorageKey, next ? '1' : '0');
    notifyFeed();
  }

  function chooseTime(next: TimeFilter) {
    setTime(next);
    window.localStorage.setItem(timeStorageKey, next);
    notifyFeed();
  }

  function chooseSort(next: SortMode) {
    setSort(next);
    window.localStorage.setItem(sortStorageKey, next);
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
    setPrice('any');
    setPhotoOnly(false);
    setTime('any');
    setSort('best');
    setDraft('');
    window.localStorage.setItem(languageStorageKey, 'all');
    window.localStorage.removeItem(keywordStorageKey);
    window.localStorage.setItem(priceStorageKey, 'any');
    window.localStorage.removeItem(photoStorageKey);
    window.localStorage.setItem(timeStorageKey, 'any');
    window.localStorage.setItem(sortStorageKey, 'best');
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
        data-aspire-smart-filter-trigger
      >
        <span className={styles.sliders} aria-hidden="true"><i /><i /><i /></span>
        <span>Filters</span>
        {activeCount > 0 && <b>{activeCount}</b>}
      </button>

      {open && (
        <div className={styles.panel} role="dialog" aria-label="Smart search filters" data-aspire-smart-filter-panel>
          <div className={styles.panelHead}>
            <div><span>SMART SEARCH</span><strong>Filter campus</strong></div>
            <button type="button" onClick={() => setOpen(false)} aria-label="Close filters">×</button>
          </div>

          <div className={styles.searchExample}>
            <span>Try a natural search</span>
            <code>ride to IND tonight under $25</code>
          </div>

          <section className={styles.section}>
            <div className={styles.sectionHead}><strong>Keywords</strong><span>Combine interests, places, classes, or activities</span></div>
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
            <div className={styles.sectionHead}><strong>When</strong><span>Only scheduled posts match a time filter</span></div>
            <div className={styles.timeGrid} role="group" aria-label="Time filter">
              {timeOptions.map((option) => (
                <button key={option.value} type="button" className={time === option.value ? styles.selected : ''} onClick={() => chooseTime(option.value)}>
                  {option.label}
                </button>
              ))}
            </div>
          </section>

          <section className={styles.section}>
            <div className={styles.sectionHead}><strong>Price</strong><span>Free hangouts or paid requests</span></div>
            <div className={styles.segmented} role="group" aria-label="Price filter">
              {(['any','free','paid'] as PriceFilter[]).map((option) => (
                <button key={option} type="button" className={price === option ? styles.segmentedActive : ''} onClick={() => choosePrice(option)}>
                  {option === 'any' ? 'Any' : option === 'free' ? 'Free' : 'Paid'}
                </button>
              ))}
            </div>
          </section>

          <section className={styles.section}>
            <div className={styles.sectionHead}><strong>Sort</strong><span>Choose what should rise to the top</span></div>
            <select value={sort} onChange={(event) => chooseSort(event.target.value as SortMode)} aria-label="Sort campus search results">
              <option value="best">Best match</option>
              <option value="soonest">Soonest</option>
              <option value="newest">Newest</option>
              <option value="highest">Highest pay</option>
            </select>
          </section>

          <section className={styles.section}>
            <div className={styles.sectionHead}><strong>Language</strong><span>Only show posts in this language</span></div>
            <select value={language} onChange={(event) => chooseLanguage(event.target.value)} aria-label="Filter campus posts by language">
              <option value="all">All languages</option>
              {requestLanguages.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
            </select>
          </section>

          <section className={styles.section}>
            <label className={styles.toggleRow}>
              <span><strong>Photos only</strong><small>Show requests that include an image</small></span>
              <input type="checkbox" checked={photoOnly} onChange={(event) => choosePhotoOnly(event.target.checked)} />
              <i aria-hidden="true" />
            </label>
          </section>

          <div className={styles.footer}>
            <button type="button" className={styles.clear} onClick={clearAll} disabled={!activeCount && sort === 'best'}>Clear all</button>
            <button type="button" className={styles.done} onClick={() => setOpen(false)}>Show results</button>
          </div>
        </div>
      )}
    </div>,
    portalTarget
  );
}
