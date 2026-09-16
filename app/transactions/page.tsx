import MarketOrdersPanel from '../MarketOrdersPanel';
import ConnectionPaymentsPanel from '../ConnectionPaymentsPanel';
import OrderWayfinder from '../OrderWayfinder';
import AppDock from '../AppDock';
import styles from '../UtilityWorkspace.module.css';

export default function TransactionsPage() {
  return (
    <main className="connectionsPage">
      <AppDock active="transactions" />
      <div className={styles.shell}>
        <header className={styles.header}>
          <div className={styles.headerCopy}>
            <p className={styles.eyebrow}>YOUR ASPIRE · ORDERS</p>
            <h1 className={styles.title}>Orders & delivery</h1>
            <p className={styles.lead}>Everything after Buy Now lives here: payment, meetup or shipping, receipt confirmation, refunds, disputes, and seller payout.</p>
          </div>
          <div className={styles.actions}>
            <a href="/marketplace">Shop Market</a>
            <a href="/delivery">Aspire Delivery</a>
            <a href="/resolution">Resolution Center</a>
          </div>
        </header>
        <div className={styles.content}>
          <OrderWayfinder />
          <MarketOrdersPanel />
          <ConnectionPaymentsPanel />
        </div>
      </div>
    </main>
  );
}
