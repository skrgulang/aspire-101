import AspireMoneyDashboard from '../AspireMoneyDashboard';
import RefundRequestPanel from '../RefundRequestPanel';
import AppDock from '../AppDock';

export default function MoneyPage() {
  return (
    <main className="aspireMoneyPage">
      <div className="aspireMoneyShell shell">
        <AspireMoneyDashboard />
        <RefundRequestPanel />
      </div>
      <AppDock active="connections" />
    </main>
  );
}
