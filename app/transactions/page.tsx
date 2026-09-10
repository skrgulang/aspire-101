import MarketOrdersPanel from '../MarketOrdersPanel';
import ConnectionPaymentsPanel from '../ConnectionPaymentsPanel';
import AppDock from '../AppDock';

export default function TransactionsPage() {
  return (
    <main className="connectionsPage">
      <AppDock active="transactions" />
      <div className="connectionsShell shell">
        <header style={{ marginBottom: 28 }}>
          <p className="eyebrow">YOUR ASPIRE</p>
          <h1 style={{ margin: '10px 0 8px', fontSize: 'clamp(38px, 5vw, 68px)', lineHeight: 0.96, letterSpacing: '-.055em' }}>Transactions</h1>
          <p style={{ margin: 0, color: '#8f897d', maxWidth: 720 }}>Track protected campus orders, payments, handoff, receipt confirmation, refunds, and payouts in one place.</p>
        </header>
        <MarketOrdersPanel />
        <ConnectionPaymentsPanel />
      </div>
    </main>
  );
}
