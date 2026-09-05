import { aspireLogo } from './logo';

export default function AppLoader({ label = 'Finding your circle…', detail = 'Scanning campus activity' }: { label?: string; detail?: string }) {
  return (
    <main className="appLoader" aria-live="polite" aria-busy="true">
      <div className="appLoaderRadar" aria-hidden="true">
        <div className="appLoaderSweep" />
        <span className="appLoaderRing ringOne" />
        <span className="appLoaderRing ringTwo" />
        <span className="appLoaderRing ringThree" />
        <i className="appLoaderDot dotOne" />
        <i className="appLoaderDot dotTwo" />
        <i className="appLoaderDot dotThree" />
        <div className="appLoaderCenter"><img src={aspireLogo} alt="" /></div>
      </div>
      <div className="appLoaderCopy">
        <span>ASPIRE 101</span>
        <strong>{label}</strong>
        <small><i />{detail}</small>
      </div>
    </main>
  );
}
