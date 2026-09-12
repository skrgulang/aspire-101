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
            <h1 className={styles.title}>Transactions</h1>
            <p className={styles.lead}>Track Aspire Protected orders, payments, handoff, receipt confirmation, refunds, and payouts without losing the activity trail.</p>
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
