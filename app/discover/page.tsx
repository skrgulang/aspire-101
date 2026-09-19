import DiscoverRequestsV2 from '../DiscoverRequestsV2';
import AspireMatchStrip from '../AspireMatchStrip';
import AspireAgentLauncher from '../AspireAgentLauncher';
import SmartCampusContextBar from '../SmartCampusContextBar';
import AppDock from '../AppDock';

export default function DiscoverPage() {
  return <>
    <main className="postPage discoverPage">
      <div className="postPageGlow" aria-hidden="true" />
      <div className="discoverShell shell">
        <SmartCampusContextBar label="BROWSING NEAR" />
        <AspireMatchStrip />
        <DiscoverRequestsV2 />
      </div>
      <AppDock active="discover" />
    </main>
    <AspireAgentLauncher />
  </>;
}
