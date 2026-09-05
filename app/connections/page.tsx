import ConnectionsHub from '../ConnectionsHub';
import ConnectionPaymentsPanel from '../ConnectionPaymentsPanel';
import AppDock from '../AppDock';

export default function ConnectionsPage() {
  return (
    <main className="connectionsPage">
      <div className="connectionsShell shell">
        <ConnectionsHub />
        <ConnectionPaymentsPanel />
      </div>
      <AppDock active="connections" />
    </main>
  );
}
