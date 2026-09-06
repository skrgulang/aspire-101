import MarketingHome from './MarketingHome';
import GlobalJourney from './GlobalJourney';
import FAQ from './FAQ';

export default function Home() {
  return (
    <>
      <div className="journeyWorld">
        <GlobalJourney />
        <MarketingHome />
      </div>
      <FAQ />
    </>
  );
}
