import PostAccessGate from '../PostAccessGate';
import AspireAgentLauncher from '../AspireAgentLauncher';
import AppDock from '../AppDock';
import UiIcon from '../UiIcon';

export default function PostPage() {
  return <>
    <main className="postPage postPageRefreshed">
      <AppDock active="post" />

      <section className="postWorkspace">
        <header className="postWorkspaceHeader">
          <div>
            <h1>Create a post</h1>
            <p>Choose what you need, add the key details, then review it before submission.</p>
          </div>

          <div className="postFlowHint" aria-label="Post creation flow">
            <span><b>1</b> Choose</span>
            <i>→</i>
            <span><b>2</b> Add details</span>
            <i>→</i>
            <span><b>3</b> Review</span>
          </div>
        </header>

        <div className="postWorkspaceGrid">
          <div className="postMainColumn">
            <div className="postPanel">
              <PostAccessGate />
            </div>
          </div>

          <aside className="postRightRail" aria-label="Posting help">
            <section className="postVerifiedCard">
              <div className="postVerifiedIcon"><UiIcon name="check" /></div>
              <div><strong>Campus verified</strong><span>Your post, offer, or listing stays attached to your verified campus identity.</span></div>
            </section>

            <section className="postRailCard">
              <div className="postRailHeading"><UiIcon name="bell" /><h2>Posting tips</h2></div>
              <ul className="postTipList">
                <li><i><UiIcon name="check" /></i><span>Use a clear title that can be understood at a glance.</span></li>
                <li><i><UiIcon name="check" /></i><span>Add the time, place area, and amount when they matter.</span></li>
                <li><i><UiIcon name="check" /></i><span>Use real photos for marketplace items and keep private addresses for the connection chat.</span></li>
              </ul>
            </section>

            <section className="postRailCard">
              <div className="postRailHeading"><UiIcon name="check" /><h2>Trust & safety</h2></div>
              <ul className="postTipList compact">
                <li><i><UiIcon name="check" /></i><span>Meet in public when possible and keep exact private details in chat.</span></li>
                <li><i><UiIcon name="check" /></i><span>Report suspicious activity or prohibited listings.</span></li>
              </ul>
              <a className="postSafetyLink" href="/safety">Learn more about safety <UiIcon name="chevron" /></a>
            </section>

            <section className="postPreviewPanel">
              <div className="postPreviewTitle"><UiIcon name="search" /><h2>Where it goes</h2></div>
              <article className="postPreviewCard">
                <div className="postPreviewMeta"><span>POST WORKSPACE</span><small>One place</small></div>
                <strong>Needs and offers go to Browse after review. Approved items go to Market.</strong>
                <p>Submitted posts stay private while Aspire finishes the required safety and content checks.</p>
                <div className="postPreviewFooter"><UiIcon name="mapPin" /><span>Selected campus community</span></div>
              </article>
            </section>
          </aside>
        </div>
      </section>
    </main>
    <AspireAgentLauncher />
  </>;
}
