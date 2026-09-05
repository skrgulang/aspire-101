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
        <a className="brand" href="/campus" aria-label="Aspire campus home">
          <img src={aspireLogo} alt="" style={logoStyle} />
          <span>Aspire 101</span>
        </a>
        <nav className="postModeNav" aria-label="Campus actions">
          <a href="/campus">Decks</a>
          <a className="active" href="/discover">Discover</a>
        </nav>
        <a className="quietLink" href="/post">+ Post</a>
      </header>
      <div className="postPageGlow" aria-hidden="true" />
      <div className="discoverShell shell">
        <DiscoverRequests />
      </div>
    </main>
  );
}
