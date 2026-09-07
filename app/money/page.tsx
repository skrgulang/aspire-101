import AspireMoneyDashboard from '../AspireMoneyDashboard';
import AppDock from '../AppDock';

export default function MoneyPage() {
  return (
    <main className="aspireMoneyPage">
      <div className="aspireMoneyShell shell">
        <AspireMoneyDashboard />
      </div>
      <AppDock active="connections" />
    </main>
  );
}
