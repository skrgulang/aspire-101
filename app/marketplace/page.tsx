import '../marketplace-v4.css';
import MarketplaceCheckoutV5 from '../MarketplaceCheckoutV5';
import MarketCompleteGuide from '../MarketCompleteGuide';
import SmartCampusContextBar from '../SmartCampusContextBar';
import surfaceStyles from '../SmartCampusSurface.module.css';

export default function MarketplacePage() {
  return (
    <>
      <div className={surfaceStyles.marketWrap}>
        <SmartCampusContextBar label="BROWSING" variant="market" />
      </div>
      <MarketplaceCheckoutV5 />
      <MarketCompleteGuide />
    </>
  );
}
