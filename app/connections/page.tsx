import ConnectionsHub from '../ConnectionsHub';
import MarketOrdersPanel from '../MarketOrdersPanel';
import ConnectionPaymentsPanel from '../ConnectionPaymentsPanel';
import ConnectionCopilotPanel from '../ConnectionCopilotPanel';
import AppDock from '../AppDock';

export default function ConnectionsPage() {
  return (
    <main className="connectionsPage">
      <div className="connectionsShell shell">
        <section id="my-activity">
          <ConnectionsHub />
        </section>
        <ConnectionCopilotPanel />
        <section id="transactions">
          <MarketOrdersPanel />
          <ConnectionPaymentsPanel />
        </section>
      </div>
      <AppDock active="connections" />
    </main>
  );
}
