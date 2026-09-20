'use client';

type Ga4Value = string | number | boolean;
type Ga4Params = Record<string, Ga4Value | undefined>;

declare global {
  interface Window {
    gtag?: (command: 'event', eventName: string, params?: Record<string, Ga4Value>) => void;
  }
}

function analyticsConsentGranted() {
  if (typeof window === 'undefined') return false;
  try {
    const raw = window.localStorage.getItem('aspire-cookie-consent');
    if (!raw) return false;
    const consent = JSON.parse(raw) as { analytics?: boolean };
    return consent.analytics === true;
  } catch {
    return false;
  }
}

export function trackGa4Event(eventName: string, params: Ga4Params = {}) {
  if (typeof window === 'undefined' || !analyticsConsentGranted() || !window.gtag) return;

  const safeParams = Object.fromEntries(
    Object.entries(params).filter(([, value]) => value !== undefined)
  ) as Record<string, Ga4Value>;

  window.gtag('event', eventName, safeParams);
}
