import ConnectionsHub from '../ConnectionsHub';
import AppDock from '../AppDock';

export default function ConnectionsPage() {
  return (
    <main className="connectionsPage">
      <div className="connectionsShell shell"><ConnectionsHub /></div>
      <AppDock active="connections" />
    </main>
  );
}
