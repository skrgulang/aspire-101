import ConnectionsHub from '../ConnectionsHub';
import MarketOrdersPanel from '../MarketOrdersPanel';
import AppDock from '../AppDock';

export default function ActivityPage() {
  return (
    <main className="connectionsPage">
      <div className="connectionsShell shell">
        <div id="my-activity">
          <ConnectionsHub />
        </div>
        <div id="transactions">
          <MarketOrdersPanel />
        </div>
      </div>
      <AppDock active="activity" />
    </main>
  );
}
