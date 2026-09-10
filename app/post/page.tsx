import PostAccessGate from '../PostAccessGate';
import PostLanguagePicker from '../PostLanguagePicker';
import PostCoverPicker from '../PostCoverPicker';
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
            <p>Share what you need with students on your campus.</p>
          </div>

          <ol className="postProgress" aria-label="Post creation steps">
            <li className="active"><b>1</b><span>Category</span></li>
            <li><b>2</b><span>Details</span></li>
            <li><b>3</b><span>Photos</span></li>
            <li><b>4</b><span>Review</span></li>
          </ol>
        </header>

        <div className="postWorkspaceGrid">
          <div className="postMainColumn">
            <div className="postPanel">
              <PostLanguagePicker />
              <PostCoverPicker />
              <PostAccessGate />
            </div>
          </div>

          <aside className="postRightRail" aria-label="Posting help">
            <section className="postVerifiedCard">
              <div className="postVerifiedIcon"><UiIcon name="check" /></div>
              <div><strong>Purdue Verified</strong><span>Your post is visible only to students in the selected campus community.</span></div>
            </section>

            <section className="postRailCard">
              <div className="postRailHeading"><UiIcon name="bell" /><h2>Posting tips</h2></div>
              <ul className="postTipList">
                <li><i><UiIcon name="check" /></i><span>Be specific and include the details someone needs to respond.</span></li>
                <li><i><UiIcon name="check" /></i><span>Use a clear title that can be understood at a glance.</span></li>
                <li><i><UiIcon name="check" /></i><span>Add real photos when they make the post easier to trust.</span></li>
                <li><i><UiIcon name="check" /></i><span>Keep personal information private until you connect.</span></li>
                <li><i><UiIcon name="check" /></i><span>You can manage your request later from Inbox.</span></li>
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
              <div className="postPreviewTitle"><UiIcon name="search" /><h2>Live preview</h2></div>
              <article className="postPreviewCard">
                <div className="postPreviewMeta"><span>POST PREVIEW</span><small>Just now</small></div>
                <strong>Your post will appear here.</strong>
                <p>As you add a title, campus, photos, and details, this card shows the visual style students will see in Browse.</p>
                <div className="postPreviewFooter"><UiIcon name="mapPin" /><span>Purdue community</span></div>
              </article>
            </section>
          </aside>
        </div>
      </section>
    </main>
    <AspireAgentLauncher />
  </>;
}
