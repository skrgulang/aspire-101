import { aspireLogo } from '../logo';
import DiscoverRequests from '../DiscoverRequests';

const logoStyle = {
  width: 38,
  height: 38,
  borderRadius: 11,
  objectFit: 'cover' as const
};

export default function DiscoverPage() {
  return (
    <main className="postPage discoverPage">
      <header className="postNav shell">
        <a className="brand" href="/" aria-label="Aspire 101 home">
          <img src={aspireLogo} alt="" style={logoStyle} />
          <span>Aspire 101</span>
        </a>
        <nav className="postModeNav" aria-label="Request actions">
          <a href="/post">Post</a>
          <a className="active" href="/discover">Discover</a>
          <a href="/safety">Safety</a>
        </nav>
        <a className="quietLink" href="/">Back to campus ↙</a>
      </header>
      <div className="postPageGlow" aria-hidden="true" />
      <div className="discoverShell shell">
        <DiscoverRequests />
      </div>
    </main>
  );
}
