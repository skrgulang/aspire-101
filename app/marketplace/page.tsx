import '../marketplace-v4.css';
import MarketplaceCheckoutV5 from '../MarketplaceCheckoutV5';
import MarketCompleteGuide from '../MarketCompleteGuide';
import SmartCampusContextBar from '../SmartCampusContextBar';

export default function MarketplacePage() {
  return (
    <>
      <div style={{ margin: '0 auto', width: 'min(1480px, calc(100% - 120px))', paddingTop: 20 }}>
        <SmartCampusContextBar label="SHOPPING NEAR" />
      </div>
      <MarketplaceCheckoutV5 />
      <MarketCompleteGuide />
    </>
  );
}
