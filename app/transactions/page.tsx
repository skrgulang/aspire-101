import MarketOrdersPanel from '../MarketOrdersPanel';
import ConnectionPaymentsPanel from '../ConnectionPaymentsPanel';
import AppDock from '../AppDock';
import styles from '../UtilityWorkspace.module.css';

export default function TransactionsPage() {
  return (
    <main className="connectionsPage">
      <AppDock active="transactions" />
      <div className={styles.shell}>
        <header className={styles.header}>
          <div className={styles.headerCopy}>
            <p className={styles.eyebrow}>YOUR ASPIRE · MONEY</p>
            <h1 className={styles.title}>Orders</h1>
            <p className={styles.lead}>Your protected marketplace orders: payment, handoff, delivery, receipt confirmation, refunds, and payouts. Your cart lives in Market.</p>
          </div>
          <div className={styles.actions}>
            <a href="/resolution">Resolution Center</a>
          </div>
        </header>
        <div className={styles.content}>
          <MarketOrdersPanel />
          <ConnectionPaymentsPanel />
        </div>
      </div>
    </main>
  );
}
