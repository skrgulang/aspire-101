import PostAccessGate from '../PostAccessGate';
import AspireAgentLauncher from '../AspireAgentLauncher';
import AppDock from '../AppDock';

export default function PostPage() {
  return <>
    <main className="postPage postEntryPage">
      <div className="postPageGlow" aria-hidden="true" />
      <div className="postDoodle postDoodleOne" aria-hidden="true">ASK → CONNECT → DO</div>
      <div className="postDoodle postDoodleTwo" aria-hidden="true">just post it on aspire ↗</div>

      <header className="postEntryHeader">
        <div><span>ASPIRE 101 · PRIVATE BETA</span><strong>Start with one real campus need.</strong></div>
        <nav aria-label="Post entry shortcuts"><a href="/campus">Home</a><a href="/discover">Browse campus</a></nav>
      </header>

      <section className="postShell shell">
        <aside className="postSide postSideAlive">
          <p className="eyebrow">YOUR FIRST BETA TASK</p>
          <h2>Post something<br /><span>campus can see.</span></h2>
          <p>Right now we are testing the network first: post a real need or marketplace listing, then check whether another student can discover it, respond, connect, and message you.</p>

          <div className="postLiveStack" aria-label="Example requests">
            <article className="postLiveCard cardRide">
              <span>RIDE · SPLIT COST</span>
              <strong>IND Friday at 4?</strong>
              <small>Purdue · 3 interested</small>
            </article>
            <article className="postLiveCard cardPickup">
              <span>MARKET · FOR SALE</span>
              <strong>Mini fridge near campus</strong>
              <small>$40 · pickup</small>
            </article>
            <article className="postLiveCard cardStudy">
              <span>STUDY · COMMUNITY</span>
              <strong>Math 55 tonight?</strong>
              <small>2 classmates nearby</small>
            </article>
          </div>

          <a className="postDiscoverLink" href="/discover">Or browse what campus posted <span>→</span></a>
        </aside>

        <div className="postPanel">
          <PostAccessGate />
        </div>
      </section>
      <AppDock active="post" />
    </main>
    <AspireAgentLauncher />
  </>;
}
