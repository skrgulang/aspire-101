import ConnectionsHub from '../ConnectionsHub';
import MarketOrdersPanel from '../MarketOrdersPanel';
import ConnectionPaymentsPanel from '../ConnectionPaymentsPanel';
import AppDock from '../AppDock';

export default function ConnectionsPage() {
  return (
    <main className="connectionsPage">
      <div className="connectionsShell shell">
        <ConnectionsHub />
        <MarketOrdersPanel />
        <ConnectionPaymentsPanel />
      </div>
      <AppDock active="connections" />
    </main>
  );
}
