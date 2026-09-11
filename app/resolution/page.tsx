import AppDock from '../AppDock';
import CancellationHistory from '../CancellationHistory';
import ResolutionHistory from '../ResolutionHistory';

export default function ResolutionPage() {
  return (
    <main className="connectionsPage">
      <AppDock active="resolution" />
      <div className="connectionsShell shell">
        <header style={{ marginBottom: 28 }}>
          <p className="eyebrow">ASPIRE PROTECTION</p>
          <h1 style={{ margin: '10px 0 8px', fontSize: 'clamp(38px, 5vw, 68px)', lineHeight: 0.96, letterSpacing: '-.055em' }}>Resolution Center</h1>
          <p style={{ margin: 0, color: '#8f897d', maxWidth: 760 }}>Follow active claims, past outcomes, and cancellation receipts without losing the record after a connection is cancelled or completed.</p>
        </header>
        <ResolutionHistory />
        <CancellationHistory />
      </div>
    </main>
  );
}
