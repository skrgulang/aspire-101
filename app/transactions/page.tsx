'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import MarketOrdersPanel from '../MarketOrdersPanel';
import ShippingOrderSetupPanel from '../ShippingOrderSetupPanel';
import SellerDeliveryPanel from '../SellerDeliveryPanel';
import AppDock from '../AppDock';
import { getSupabaseBrowserClient } from '../../lib/supabase/client';
import styles from '../UtilityWorkspace.module.css';

export default function TransactionsPage() {
  const router = useRouter();
  const [authReady, setAuthReady] = useState(false);

  useEffect(() => {
    const supabase = getSupabaseBrowserClient();
    void supabase.auth.getUser().then(({ data }) => {
      if (!data.user) {
        router.replace('/login?next=%2Ftransactions');
        return;
      }
      setAuthReady(true);
    }).catch(() => {
      router.replace('/login?next=%2Ftransactions');
    });
  }, [router]);

  if (!authReady) {
    return (
      <main className="connectionsPage transactionsPage">
        <AppDock active="transactions" />
        <div className={styles.shell}>
          <div className={styles.content}>
            <section aria-live="polite" aria-label="Loading orders">
              <p>Opening your orders…</p>
            </section>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="connectionsPage transactionsPage">
      <AppDock active="transactions" />
      <div className={styles.shell}>
        <header className={styles.header}>
          <div className={styles.headerCopy}>
            <p className={styles.eyebrow}>MARKETPLACE</p>
            <h1 className={styles.title}>Orders</h1>
            <p className={styles.lead}>Marketplace purchases and sales. Open an order to see payment, handoff, shipping, and payout status.</p>
          </div>
          <div className={styles.actions}>
            <a href="/marketplace">Shop Market</a>
            <a href="/delivery">Delivery Requests</a>
            <a href="/resolution">Resolution Center</a>
          </div>
        </header>

        <div className={styles.content}>
          <MarketOrdersPanel />

          <section className={styles.orderTools} aria-label="Order tools">
            <ShippingOrderSetupPanel />
            <SellerDeliveryPanel />
          </section>

        </div>
      </div>
    </main>
  );
}
