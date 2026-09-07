import ConnectionsHub from '../ConnectionsHub';
import MarketOrdersPanel from '../MarketOrdersPanel';
import MarketDeliveryPanel from '../MarketDeliveryPanel';
import PaymentTermsPanel from '../PaymentTermsPanel';
import ConnectionPaymentsPanel from '../ConnectionPaymentsPanel';
import ConnectionCopilotPanel from '../ConnectionCopilotPanel';
import AppDock from '../AppDock';

export default function ConnectionsPage() {
  return (
    <main className="connectionsPage">
      <div className="connectionsShell shell">
        <ConnectionsHub />
        <ConnectionCopilotPanel />
        <MarketOrdersPanel />
        <MarketDeliveryPanel />
        <PaymentTermsPanel />
        <ConnectionPaymentsPanel />
      </div>
      <AppDock active="connections" />
    </main>
  );
}
