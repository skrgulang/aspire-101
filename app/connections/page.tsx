import ConnectionsHub from '../ConnectionsHub';
import ConnectionCopilotPanel from '../ConnectionCopilotPanel';
import ConnectionPaymentsPanel from '../ConnectionPaymentsPanel';
import LiveConnectionStrip from '../LiveConnectionStrip';
import AppDock from '../AppDock';
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
          <LiveConnectionStrip />
          <div id="my-activity" className={cleanup.inboxAnchor}>
            <ConnectionsHub />
          </div>
        </section>
      </div>

      <div className={styles.secondary}>
        <ConnectionCopilotPanel />
        <ConnectionPaymentsPanel />
      </div>
    </main>
  );
}
