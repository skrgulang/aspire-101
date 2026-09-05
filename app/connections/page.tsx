import { aspireLogo } from '../logo';
import ConnectionsHub from '../ConnectionsHub';

const logoStyle = { width: 38, height: 38, borderRadius: 11, objectFit: 'cover' as const };

export default function ConnectionsPage() {
  return (
    <main className="connectionsPage">
      <header className="postNav shell">
        <a className="brand" href="/" aria-label="Aspire 101 home"><img src={aspireLogo} alt="" style={logoStyle} /><span>Aspire 101</span></a>
        <nav className="postModeNav" aria-label="Aspire activity"><a href="/post">Post</a><a href="/discover">Discover</a><a className="active" href="/connections">Connections</a></nav>
        <a className="quietLink" href="/">Back to campus ↙</a>
      </header>
      <div className="connectionsShell shell"><ConnectionsHub /></div>
    </main>
  );
}
