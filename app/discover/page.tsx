import DiscoverRequests from '../DiscoverRequests';
import AppDock from '../AppDock';

export default function DiscoverPage() {
  return (
    <main className="postPage discoverPage">
      <div className="postPageGlow" aria-hidden="true" />
      <div className="discoverShell shell">
        <DiscoverRequests />
      </div>
      <AppDock active="discover" />
    </main>
  );
}
