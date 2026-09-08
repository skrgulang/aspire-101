'use client';

import { useEffect } from 'react';
import { getSupabaseBrowserClient } from '../lib/supabase/client';

const HEARTBEAT_MS = 15 * 60 * 1000;
const STORAGE_KEY = 'aspire:last-activity-heartbeat';

export default function ActivityHeartbeat() {
  useEffect(() => {
    const supabase = getSupabaseBrowserClient();
    let stopped = false;

    async function record(force = false) {
      if (stopped || document.visibilityState === 'hidden') return;
      const now = Date.now();
      const last = Number(window.localStorage.getItem(STORAGE_KEY) || '0');
      if (!force && Number.isFinite(last) && now - last < HEARTBEAT_MS) return;

      const { data } = await supabase.auth.getSession();
      if (stopped || !data.session) return;

      const { error } = await supabase.rpc('record_user_activity');
      if (!error) window.localStorage.setItem(STORAGE_KEY, String(now));
    }

    void record(false);
    const timer = window.setInterval(() => void record(false), HEARTBEAT_MS);
    const onVisibility = () => {
      if (document.visibilityState === 'visible') void record(false);
    };
    document.addEventListener('visibilitychange', onVisibility);

    const { data: authListener } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_IN') void record(true);
    });

    return () => {
      stopped = true;
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisibility);
      authListener.subscription.unsubscribe();
    };
  }, []);

  return null;
}
