import MarketOrdersPanel from '../MarketOrdersPanel';
import ShippingOrderSetupPanel from '../ShippingOrderSetupPanel';
import SellerDeliveryPanel from '../SellerDeliveryPanel';
import ConnectionPaymentsPanel from '../ConnectionPaymentsPanel';
import OrderWayfinder from '../OrderWayfinder';
import AppDock from '../AppDock';
import styles from '../UtilityWorkspace.module.css';

export default function TransactionsPage() {
  return (
    <main className="connectionsPage transactionsPage">
      <AppDock active="transactions" />
      <div className={styles.shell}>
        <header className={styles.header}>
          <div className={styles.headerCopy}>
            <p className={styles.eyebrow}>MARKETPLACE</p>
            <h1 className={styles.title}>Orders</h1>
            <p className={styles.lead}>Track marketplace payment, meetup, shipping, receipt confirmation, and payout. Delivery requests stay in their own flow.</p>
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
            <ConnectionPaymentsPanel />
          </section>

          <div className={styles.fulfillmentHelp}>
            <OrderWayfinder />
          </div>
        </div>
      </div>
    </main>
  );
}
