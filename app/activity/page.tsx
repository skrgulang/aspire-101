import ConnectionsHub from '../ConnectionsHub';
import AppDock from '../AppDock';

export default function ActivityPage() {
  return (
    <main className="connectionsPage">
      <div className="connectionsShell shell">
        <ConnectionsHub />
      </div>
      <AppDock active="activity" />
    </main>
  );
}
