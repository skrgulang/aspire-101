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
  }, []);

  function save(choice: Choice) {
    window.localStorage.setItem('aspire-cookie-consent', JSON.stringify({
      choice,
      analytics: choice === 'all' ? true : analytics,
      savedAt: new Date().toISOString()
    }));
    setVisible(false);
    setManaging(false);
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
          <button type="button" className="cookieQuiet" onClick={() => save('essential')}>Save choices</button>
        ) : (
          <button type="button" className="cookieQuiet" onClick={() => setManaging(true)}>Manage</button>
        )}
        <button type="button" className="cookieAccept" onClick={() => save('all')}>Accept all</button>
      </div>
    </div>
  );
}
