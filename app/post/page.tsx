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
        <a className="brand" href="/" aria-label="Aspire 101 home">
          <img src={aspireLogo} alt="" style={logoStyle} />
          <span>Aspire 101</span>
        </a>
        <a className="quietLink" href="/">Back to campus ↙</a>
      </header>

      <div className="postPageGlow" aria-hidden="true" />
      <section className="postShell shell">
        <aside className="postSide">
          <p className="eyebrow">ASK CAMPUS</p>
          <h2>One request.<br /><span>Real people nearby.</span></h2>
          <p>Rides, pickups, errands, moving help, study groups, projects, and the random things college throws at you.</p>
          <div className="postSideExamples" aria-hidden="true">
            <span>Need a Costco pickup?</span>
            <span>Anyone driving to Chicago?</span>
            <span>Help move a desk upstairs?</span>
          </div>
        </aside>

        <div className="postPanel">
          <PostRequestForm />
        </div>
      </section>
    </main>
  );
}
