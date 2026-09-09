'use client';

import { getSupabaseBrowserClient } from './client';

export type AnalyticsEventName = 'page_view' | 'cta_click' | 'signup_submit' | 'signup_success';
export type AnalyticsSurface = 'home' | 'auth' | 'discover' | 'post' | 'inbox' | 'profile' | 'payments' | 'other';

const SESSION_KEY = 'aspire:analytics-session-id';

function fallbackUuid() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (char) => {
    const value = Math.floor(Math.random() * 16);
    const next = char === 'x' ? value : (value & 0x3) | 0x8;
    return next.toString(16);
  });
}

export function getAnalyticsSessionId() {
  if (typeof window === 'undefined') return null;
  const existing = window.localStorage.getItem(SESSION_KEY);
  if (existing) return existing;
  const next = typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : fallbackUuid();
  window.localStorage.setItem(SESSION_KEY, next);
  return next;
}

export async function recordProductEvent(eventName: AnalyticsEventName, surface: AnalyticsSurface, target?: string | null) {
  try {
    const sessionId = getAnalyticsSessionId();
    if (!sessionId) return;
    const supabase = getSupabaseBrowserClient();
    await supabase.rpc('record_product_event', {
      p_event_name: eventName,
      p_surface: surface,
      p_target: target || null,
      p_session_id: sessionId
    });
  } catch {
    // Analytics must never block the product flow.
  }
}
