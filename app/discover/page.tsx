import DiscoverRequestsV2 from '../DiscoverRequestsV2';
import AppDock from '../AppDock';

export default function DiscoverPage() {
  return (
    <main className="postPage discoverPage">
      <div className="postPageGlow" aria-hidden="true" />
      <div className="discoverShell shell">
        <DiscoverRequestsV2 />
      </div>
      <AppDock active="discover" />
    </main>
  );
}
