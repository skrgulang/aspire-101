export const metadata = { robots: { index: false, follow: false } };

import ModeratorConsole from '../ModeratorConsole';
import DisputeIntelligenceLauncher from '../DisputeIntelligenceLauncher';
import ResolutionCaseConsole from '../ResolutionCaseConsole';
import AvatarModerationQueue from '../AvatarModerationQueue';

export default function ModeratorPage() {
  return <>
    <section style={{ maxWidth: 1180, margin: '24px auto 0', padding: '0 22px' }}>
      <div style={{ border: '1px solid rgba(255,255,255,.14)', borderRadius: 18, padding: 18, background: 'rgba(255,255,255,.04)', display: 'flex', justifyContent: 'space-between', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
        <div><strong>Layered Content Review</strong><div style={{ opacity: .7, marginTop: 4 }}>Separate queues for Post Review, Language Review, and Market Review.</div></div>
        <a href="/moderator/content" style={{ fontWeight: 800 }}>Open layered review →</a>
      </div>
    </section>
    <ModeratorConsole />
    <AvatarModerationQueue />
    <ResolutionCaseConsole />
    <DisputeIntelligenceLauncher />
  </>;
}
