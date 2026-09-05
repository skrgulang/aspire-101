import PostAccessGate from '../PostAccessGate';
import AppDock from '../AppDock';

export default function PostPage() {
  return (
    <main className="postPage">
      <div className="postPageGlow" aria-hidden="true" />
      <div className="postDoodle postDoodleOne" aria-hidden="true">ASK → CONNECT → DO</div>
      <div className="postDoodle postDoodleTwo" aria-hidden="true">just post it on aspire ↗</div>

      <section className="postShell shell">
        <aside className="postSide postSideAlive">
          <p className="eyebrow">ONE PLACE TO ASK</p>
          <h2>Your campus<br /><span>is already helping.</span></h2>
          <p>Pick a need, say what is happening, and let nearby students decide if they can help.</p>

          <div className="postLiveStack" aria-label="Example requests">
            <article className="postLiveCard cardRide">
              <span>RIDE · SPLIT COST</span>
              <strong>IND Friday at 4?</strong>
              <small>Purdue · 3 interested</small>
            </article>
            <article className="postLiveCard cardPickup">
              <span>PICKUP · PAID HELP</span>
              <strong>Target order before 8</strong>
              <small>$12 · campus</small>
            </article>
            <article className="postLiveCard cardStudy">
              <span>STUDY · COMMUNITY</span>
              <strong>Math 55 tonight?</strong>
              <small>2 classmates nearby</small>
            </article>
          </div>

          <a className="postDiscoverLink" href="/discover">Or browse what campus needs <span>→</span></a>
        </aside>

        <div className="postPanel">
          <PostAccessGate />
        </div>
      </section>
      <AppDock active="post" />
    </main>
  );
}
