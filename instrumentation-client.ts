import { onRouterTransitionStart } from '@datadog/browser-rum-nextjs';
import { initializeProductObservability } from './lib/analytics/client';

if (typeof window !== 'undefined') {
  void initializeProductObservability();

  window.addEventListener('aspire-cookie-consent-changed', () => {
    void initializeProductObservability();
  });
}

export { onRouterTransitionStart };
