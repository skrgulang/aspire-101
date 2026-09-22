'use client';

import { useEffect, useState } from 'react';

type Choice = 'all' | 'essential';

export default function CookieBanner() {
  const [visible, setVisible] = useState(false);
  const [managing, setManaging] = useState(false);
  const [analytics, setAnalytics] = useState(true);

  useEffect(() => {
    const saved = window.localStorage.getItem('aspire-cookie-consent');
    if (!saved) setVisible(true);

    const openPreferences = () => {
      try {
        const current = window.localStorage.getItem('aspire-cookie-consent');
        const consent = current ? JSON.parse(current) as { analytics?: boolean } : null;
        setAnalytics(consent?.analytics === true);
      } catch {
        setAnalytics(false);
      }
      setManaging(true);
      setVisible(true);
    };

    window.addEventListener('aspire-cookie-preferences-open', openPreferences);
    return () => window.removeEventListener('aspire-cookie-preferences-open', openPreferences);
  }, []);

  function save(choice: Choice) {
    const previousRaw = window.localStorage.getItem('aspire-cookie-consent');
    let previousAnalytics: boolean | null = null;
    if (previousRaw) {
      try {
        previousAnalytics = (JSON.parse(previousRaw) as { analytics?: boolean }).analytics === true;
      } catch {
        previousAnalytics = false;
      }
    }

    const nextAnalytics = choice === 'all';
    const consent = {
      choice,
      analytics: nextAnalytics,
      savedAt: new Date().toISOString()
    };

    window.localStorage.setItem('aspire-cookie-consent', JSON.stringify(consent));
    window.dispatchEvent(new CustomEvent('aspire-cookie-consent-changed', { detail: consent }));
    setVisible(false);
    setManaging(false);

    if (previousAnalytics !== null && previousAnalytics !== nextAnalytics) {
      window.location.reload();
    }
  }

  if (!visible) return null;

  return (
    <div className="cookieBar" role="dialog" aria-modal="false" aria-label="Cookie preferences">
      <div className="cookieMessage">
        <span className="cookieIcon">◔</span>
        <div><strong>Cookies, but keep it simple.</strong><p>Aspire uses essential cookies for sign-in and preferences. Optional analytics help us improve the product.</p></div>
      </div>

      {managing && (
        <div className="cookieManage">
          <label><span><strong>Essential</strong><small>Required for sign-in and core product behavior.</small></span><input type="checkbox" checked disabled /></label>
          <label><span><strong>Product analytics</strong><small>Helps us understand what people use and improve the experience.</small></span><input type="checkbox" checked={analytics} onChange={(event) => setAnalytics(event.target.checked)} /></label>
        </div>
      )}

      <div className="cookieActions">
        {managing ? (
          <button type="button" className="cookieQuiet" onClick={() => save(analytics ? 'all' : 'essential')}>Save choices</button>
        ) : (
          <button type="button" className="cookieQuiet" onClick={() => setManaging(true)}>Manage</button>
        )}
        <button type="button" className="cookieAccept" onClick={() => save('all')}>Accept all</button>
      </div>
    </div>
  );
}
