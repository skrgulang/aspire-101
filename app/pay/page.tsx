'use client';

import { useEffect, useState } from 'react';
import AspireEmbeddedCheckout from '../AspireEmbeddedCheckout';

export default function AspirePayPage() {
  const [connectionId, setConnectionId] = useState('');

  useEffect(() => {
    setConnectionId(new URLSearchParams(window.location.search).get('connection') || '');
  }, []);

  if (!connectionId) {
    return (
      <main className="embeddedPaymentPage">
        <div className="embeddedStripeError">
          <strong>Payment link is incomplete.</strong>
          <a href="/connections">Back to Connections</a>
        </div>
      </main>
    );
  }

  return (
    <main className="embeddedPaymentPage">
      <AspireEmbeddedCheckout connectionId={connectionId} />
    </main>
  );
}
