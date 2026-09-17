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
            <h1>Create a post or listing</h1>
            <p>Ask campus for something, offer something useful, or list an item for sale from the same Post workspace.</p>
          </div>

          <ol className="postProgress" aria-label="Post creation steps">
            <li className="active"><b>1</b><span>Type</span></li>
            <li><b>2</b><span>Details</span></li>
            <li><b>3</b><span>Timing</span></li>
            <li><b>4</b><span>Review</span></li>
          </ol>
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
                <li><i><UiIcon name="check" /></i><span>If you are offering a ride or help, say what you are already doing and when.</span></li>
                <li><i><UiIcon name="check" /></i><span>Add real photos for marketplace items.</span></li>
                <li><i><UiIcon name="check" /></i><span>For a sale, choose every delivery method you are actually willing to offer.</span></li>
                <li><i><UiIcon name="check" /></i><span>Keep exact private addresses inside the matched order or connection.</span></li>
              </ul>
            </section>

            <section className="postRailCard">
              <div className="postRailHeading"><UiIcon name="check" /><h2>Trust & safety</h2></div>
              <ul className="postTipList compact">
                <li><i><UiIcon name="check" /></i><span>Interact with verified campus members.</span></li>
                <li><i><UiIcon name="check" /></i><span>Meet in public, well-lit places when possible.</span></li>
                <li><i><UiIcon name="check" /></i><span>Report suspicious activity or prohibited listings.</span></li>
              </ul>
              <a className="postSafetyLink" href="/safety">Learn more about safety <UiIcon name="chevron" /></a>
            </section>

            <section className="postPreviewPanel">
              <div className="postPreviewTitle"><UiIcon name="search" /><h2>Where it goes</h2></div>
              <article className="postPreviewCard">
                <div className="postPreviewMeta"><span>POST WORKSPACE</span><small>One place</small></div>
                <strong>Needs and offers go to Browse. Published items go to Market.</strong>
                <p>“I can help” creates your own offer instead of sending you away to search other people’s requests.</p>
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
