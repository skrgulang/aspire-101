'use client';

import { useEffect, useState } from 'react';
import Script from 'next/script';

type StoredConsent = {
  analytics?: boolean;
};

function hasAnalyticsConsent() {
  try {
    const raw = window.localStorage.getItem('aspire-cookie-consent');
    if (!raw) return false;
    const consent = JSON.parse(raw) as StoredConsent;
    return consent.analytics === true;
  } catch {
    return false;
  }
}

export default function GoogleAnalytics() {
  // Measurement ID is supplied by Vercel at build time.
  const measurementId = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID;
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    const refresh = () => setEnabled(hasAnalyticsConsent());
    refresh();
    window.addEventListener('aspire-cookie-consent-changed', refresh);
    return () => window.removeEventListener('aspire-cookie-consent-changed', refresh);
  }, []);

  if (!measurementId || !enabled) return null;

  return (
    <>
      <Script
        src={`https://www.googletagmanager.com/gtag/js?id=${measurementId}`}
        strategy="afterInteractive"
      />
      <Script id="aspire-google-analytics" strategy="afterInteractive">
        {`
          window.dataLayer = window.dataLayer || [];
          function gtag(){dataLayer.push(arguments);}
          gtag('js', new Date());
          gtag('config', '${measurementId}', {
            anonymize_ip: true
          });
        `}
      </Script>
    </>
  );
}
