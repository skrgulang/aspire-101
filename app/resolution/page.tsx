import AppDock from '../AppDock';
import ResolutionQuickPanel from '../ResolutionQuickPanel';
import ResolutionHistory from '../ResolutionHistory';
import styles from '../UtilityWorkspace.module.css';

export default function ResolutionPage() {
  return (
    <main className="connectionsPage">
      <AppDock active="resolution" />
      <div className={`connectionsShell shell ${styles.shell}`}>
        <header className={styles.header}>
          <div className={styles.headerCopy}>
            <p className={styles.eyebrow}>ASPIRE PROTECTION</p>
            <h1 className={styles.title}>Resolution Center</h1>
            <p className={styles.lead}>Report a problem, keep an eligible protected payment paused during review, and follow the outcome without losing the record after a connection ends.</p>
          </div>
          <div className={styles.actions}>
            <a href="/resolution-policy">Read resolution policy</a>
          </div>
        </header>
        <div className={styles.content}>
          <ResolutionQuickPanel />
          <ResolutionHistory />
        </div>
      </div>
    </main>
  );
}
