export const CAMPUS_FEED_REFRESH_EVENT = 'aspire:campus-feed-refresh';
export const CAMPUS_FEED_REFRESH_STORAGE_KEY = 'aspire:campus-feed-refresh-version';

export function notifyCampusFeedChanged() {
  if (typeof window === 'undefined') return;
  const version = String(Date.now());
  try { window.localStorage.setItem(CAMPUS_FEED_REFRESH_STORAGE_KEY, version); } catch { /* ignore storage errors */ }
  window.dispatchEvent(new Event(CAMPUS_FEED_REFRESH_EVENT));
}
