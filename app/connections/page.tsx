import BetaInbox from '../BetaInbox';
import AppDock from '../AppDock';

export default function ConnectionsPage() {
  return (
    <main className="connectionsPage">
      <div className="connectionsShell shell">
        <BetaInbox />
      </div>
      <AppDock active="connections" />
    </main>
  );
}
