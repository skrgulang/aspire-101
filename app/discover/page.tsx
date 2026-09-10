import DiscoverRequestsV2 from '../DiscoverRequestsV2';
import DiscoverLanguageFilter from '../DiscoverLanguageFilter';
import AspireMatchStrip from '../AspireMatchStrip';
import AspireAgentLauncher from '../AspireAgentLauncher';
import AppDock from '../AppDock';

export default function DiscoverPage() {
  return <>
    <main className="postPage discoverPage">
      <div className="postPageGlow" aria-hidden="true" />
      <div className="discoverShell shell">
        <AspireMatchStrip />
        <DiscoverLanguageFilter />
        <DiscoverRequestsV2 />
      </div>
      <AppDock active="discover" />
    </main>
    <AspireAgentLauncher />
  </>;
}
