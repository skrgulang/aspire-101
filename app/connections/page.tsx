import ConnectionsHub from '../ConnectionsHub';
import ConnectionCopilotPanel from '../ConnectionCopilotPanel';
import AppDock from '../AppDock';
import UiIcon from '../UiIcon';
import PendingChoiceFlash from './PendingChoiceFlash';
import styles from './ConnectionsRefresh.module.css';
import cleanup from './ConnectionLifecycleCleanup.module.css';

export default function ConnectionsPage() {
  return (
    <main className={`${styles.page} ${cleanup.scope} connectionsPage`}>
      <AppDock active="connections" />

      <div className={styles.workspace}>
        <section className={styles.primary}>
          <PendingChoiceFlash />

          <header style={{ marginBottom: 24 }}>
            <p style={{ margin: '0 0 8px', fontSize: 12, fontWeight: 800, letterSpacing: '.12em', color: '#8f8778' }}>INBOX</p>
            <h1 style={{ margin: 0, fontSize: 'clamp(34px,5vw,58px)', letterSpacing: '-.055em', lineHeight: 1 }}>Messages & connections</h1>
            <p style={{ maxWidth: 680, margin: '12px 0 0', color: '#989083', lineHeight: 1.6 }}>Use Inbox for conversations and people. Marketplace purchases, payment, shipping, handoff, and payout now live in Orders &amp; delivery.</p>
          </header>

          <div id="my-activity" className={cleanup.inboxAnchor}>
            <ConnectionsHub />
          </div>
        </section>

        <aside className={styles.rail} aria-label="Inbox shortcuts">
          <section className={styles.railCard}>
            <div className={styles.railHeading}><span>Go to</span></div>
            <a href="/transactions" className={styles.quickAction}>
              <i className={styles.yellowIcon}><UiIcon name="wallet" /></i>
              <div><strong>Orders &amp; delivery</strong><span>Marketplace payment, meetup, shipping, receipt and payout</span></div>
              <UiIcon name="chevron" />
            </a>
            <a href="/delivery" className={styles.quickAction}>
              <i><UiIcon name="mapPin" /></i>
              <div><strong>Aspire Delivery</strong><span>Post a delivery or errand request</span></div>
              <UiIcon name="chevron" />
            </a>
            <a href="/activity" className={styles.quickAction}>
              <i><UiIcon name="activity" /></i>
              <div><strong>My Activity</strong><span>Your posts and non-marketplace activity</span></div>
              <UiIcon name="chevron" />
            </a>
            <a href="/resolution" className={styles.quickAction}>
              <i><UiIcon name="shield" /></i>
              <div><strong>Resolution Center</strong><span>Cancellation, payment or safety help</span></div>
              <UiIcon name="chevron" />
            </a>
          </section>

          <section className={`${styles.railCard} ${styles.tipCard}`}>
            <span>ONE PLACE FOR EACH JOB</span>
            <strong>Inbox is for people. Orders is for transactions.</strong>
            <p>This keeps marketplace controls from mixing with generic task status buttons.</p>
          </section>
        </aside>
      </div>

      <div className={styles.secondary}>
        <ConnectionCopilotPanel />
      </div>
    </main>
  );
}
