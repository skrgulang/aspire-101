'use client';

import * as amplitude from '@amplitude/analytics-browser';
import { datadogRum } from '@datadog/browser-rum';
import { nextjsPlugin } from '@datadog/browser-rum-nextjs';
import { getSupabaseBrowserClient } from '../supabase/client';

export type ProductEventName =
  | 'product_session_started'
  | 'signup_submitted'
  | 'request_created'
  | 'response_sent'
  | 'connection_chosen'
  | 'connection_confirmed'
  | 'connection_completion_marked'
  | 'marketplace_listing_created'
  | 'marketplace_order_reserved'
  | 'checkout_started'
  | 'payout_released'
  | 'review_submitted';

type AnalyticsValue = string | number | boolean | null;
export type ProductEventProperties = Record<string, AnalyticsValue | undefined>;

let amplitudeReady = false;
let datadogReady = false;
let authListenerReady = false;
let currentUserId: string | null = null;
let sessionStartTracked = false;

const blockedPropertyPattern =
  /(email|name|title|message|detail|address|location|latitude|longitude|phone|student|token|secret|password|document|content|text)/i;

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

function sanitizeProperties(properties: ProductEventProperties = {}) {
  const safe: Record<string, AnalyticsValue> = {};

  Object.entries(properties).forEach(([rawKey, rawValue]) => {
    const key = rawKey.trim().slice(0, 64);
    if (!key || blockedPropertyPattern.test(key) || rawValue === undefined) return;
    safe[key] = typeof rawValue === 'string' ? rawValue.slice(0, 120) : rawValue;
  });

  return safe;
}

function setAnalyticsUser(userId: string | null) {
  const previousUserId = currentUserId;
  currentUserId = userId;

  if (amplitudeReady) {
    if (userId) amplitude.setUserId(userId);
    else if (previousUserId) amplitude.reset();
  }

  if (datadogReady) {
    if (userId) datadogRum.setUser({ id: userId });
    else if (previousUserId) datadogRum.clearUser();
  }
}

function startAuthIdentitySync() {
  if (authListenerReady || typeof window === 'undefined') return;
  authListenerReady = true;

  const supabase = getSupabaseBrowserClient();
  void supabase.auth.getUser().then(({ data }) => {
    setAnalyticsUser(data.user?.id ?? null);
  });

  supabase.auth.onAuthStateChange((_event, session) => {
    setAnalyticsUser(session?.user?.id ?? null);
  });
}

export async function initializeProductObservability() {
  if (typeof window === 'undefined' || !analyticsConsentGranted()) return false;

  const amplitudeKey = process.env.NEXT_PUBLIC_AMPLITUDE_API_KEY?.trim();
  if (amplitudeKey && !amplitudeReady) {
    amplitude.init(amplitudeKey, undefined, {
      autocapture: false,
      fetchRemoteConfig: false
    });
    amplitudeReady = true;
  }

  const datadogApplicationId = process.env.NEXT_PUBLIC_DATADOG_APPLICATION_ID?.trim();
  const datadogClientToken = process.env.NEXT_PUBLIC_DATADOG_CLIENT_TOKEN?.trim();
  const productionHosts = new Set(['aspires101.com', 'www.aspires101.com']);
  const observedEnvironment =
    typeof window !== 'undefined' && productionHosts.has(window.location.hostname)
      ? 'production'
      : 'preview';
  if (datadogApplicationId && datadogClientToken && !datadogReady) {
    datadogRum.init({
      applicationId: datadogApplicationId,
      clientToken: datadogClientToken,
      site: 'datadoghq.com',
      service: 'aspire101-web',
      env: observedEnvironment,
      sessionSampleRate: 100,
      sessionReplaySampleRate: 0,
      trackUserInteractions: false,
      trackResources: true,
      trackLongTasks: true,
      defaultPrivacyLevel: 'mask',
      plugins: [nextjsPlugin()]
    });
    datadogReady = true;
  }

  if (amplitudeReady || datadogReady) {
    startAuthIdentitySync();
    if (currentUserId) setAnalyticsUser(currentUserId);

    if (!sessionStartTracked) {
      sessionStartTracked = true;
      const environment = observedEnvironment;
      if (amplitudeReady) amplitude.track('product_session_started', { environment });
      if (datadogReady) datadogRum.addAction('product_session_started', { environment });
    }
  }

  return amplitudeReady || datadogReady;
}

export async function trackProductEvent(
  eventName: ProductEventName,
  properties: ProductEventProperties = {}
) {
  const ready = await initializeProductObservability();
  if (!ready) return;

  const safeProperties = sanitizeProperties(properties);

  if (amplitudeReady) amplitude.track(eventName, safeProperties);
  if (datadogReady) datadogRum.addAction(eventName, safeProperties);
}
