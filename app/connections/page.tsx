import ConnectionsHub from '../ConnectionsHub';
import ConnectionCopilotPanel from '../ConnectionCopilotPanel';
import LiveConnectionStrip from '../LiveConnectionStrip';
import AppDock from '../AppDock';
import UiIcon from '../UiIcon';
import styles from './ConnectionsRefresh.module.css';

export default function ConnectionsPage() {
  return (
    <main className={`${styles.page} connectionsPage`}>
      <AppDock active="connections" />

      <div className={styles.workspace}>
        <section className={styles.primary} id="my-activity">
          <LiveConnectionStrip />
          <ConnectionsHub />
        </section>

        <aside className={styles.rail} aria-label="Inbox shortcuts">
          <section className={styles.railCard}>
            <div className={styles.railHeading}>
              <span>Quick Actions</span>
            </div>
            <a href="/post" className={styles.quickAction}>
              <i className={styles.yellowIcon}><UiIcon name="plus" /></i>
              <div><strong>Post a request</strong><span>Find help or offer something</span></div>
              <UiIcon name="chevron" />
            </a>
            <a href="/discover" className={styles.quickAction}>
              <i><UiIcon name="search" /></i>
              <div><strong>Browse campus</strong><span>See what students need</span></div>
              <UiIcon name="chevron" />
            </a>
            <a href="/activity" className={styles.quickAction}>
              <i><UiIcon name="users" /></i>
              <div><strong>View activity</strong><span>Your requests and connections</span></div>
              <UiIcon name="chevron" />
            </a>
            <a href="/resolution" className={styles.quickAction}>
              <i><UiIcon name="shield" /></i>
              <div><strong>Resolution Center</strong><span>No-show, cancellation, payment or safety help</span></div>
              <UiIcon name="chevron" />
            </a>
          </section>

          <section className={styles.railCard}>
            <div className={styles.railHeading}>
              <span>Trust & Safety</span>
            </div>
            <div className={styles.trustLead}>
              <i><UiIcon name="shield" /></i>
              <div><strong>Verified campus community</strong><span>Chat and transact only after both sides agree.</span></div>
            </div>
            <div className={styles.trustRow}><UiIcon name="check" /><span>Purdue email verification</span></div>
            <div className={styles.trustRow}><UiIcon name="users" /><span>Mutual choice before private chat</span></div>
            <div className={styles.trustRow}><UiIcon name="shield" /><span>Report, block, and safety support</span></div>
            <a className={styles.learnLink} href="/safety">Safety center →</a>
          </section>

          <section className={`${styles.railCard} ${styles.tipCard}`}>
            <span>INBOX TIP</span>
            <strong>Keep the important details in one thread.</strong>
            <p>Confirm time, place, scope, and payment before meeting.</p>
          </section>
        </aside>
      </div>

      <div className={styles.secondary}>
        <ConnectionCopilotPanel />
      </div>
    </main>
  );
}
