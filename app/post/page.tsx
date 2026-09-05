import { aspireLogo } from '../logo';
import PostRequestForm from '../PostRequestForm';

const logoStyle = {
  width: 38,
  height: 38,
  borderRadius: 11,
  objectFit: 'cover' as const
};

export default function PostPage() {
  return (
    <main className="postPage">
      <header className="postNav shell">
        <a className="brand" href="/campus" aria-label="Aspire campus home">
          <img src={aspireLogo} alt="" style={logoStyle} />
          <span>Aspire 101</span>
        </a>
        <nav className="postModeNav" aria-label="Campus actions">
          <a href="/campus">Decks</a>
          <a className="active" href="/post">Post</a>
        </nav>
        <a className="quietLink" href="/discover">Discover →</a>
      </header>

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
              <small>$12 · 1.8 mi</small>
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
          <PostRequestForm />
        </div>
      </section>
    </main>
  );
}
