'use client';

import { useMemo, useState } from 'react';
import AppDock from '../../AppDock';
import './seller-preview.css';

type OptionKey = 'meet' | 'shipping' | 'seller' | 'aspirer';

export default function MarketplaceSellerPreview() {
  const [enabled, setEnabled] = useState<Record<OptionKey, boolean>>({
    meet: true,
    shipping: true,
    seller: false,
    aspirer: true
  });
  const [shippingPayer, setShippingPayer] = useState<'buyer' | 'seller' | 'either'>('buyer');
  const [sellerDeliveryMode, setSellerDeliveryMode] = useState<'free' | 'fixed' | 'negotiable'>('negotiable');
  const [sellerDeliveryPrice, setSellerDeliveryPrice] = useState('5');

  const buyerOptions = useMemo(() => {
    const result: string[] = [];
    if (enabled.meet) result.push('Meet up · Free');
    if (enabled.shipping) result.push(`Ship to me · ${shippingPayer === 'buyer' ? 'Buyer pays shipping' : shippingPayer === 'seller' ? 'Seller covers shipping' : 'Buyer or seller can cover'}`);
    if (enabled.seller) result.push(`Ask seller to deliver · ${sellerDeliveryMode === 'free' ? 'Free' : sellerDeliveryMode === 'fixed' ? `$${sellerDeliveryPrice || '0'}` : 'Negotiable'}`);
    if (enabled.aspirer) result.push('Ask an Aspirer · Free / Paid / Negotiable');
    return result;
  }, [enabled, shippingPayer, sellerDeliveryMode, sellerDeliveryPrice]);

  function toggle(key: OptionKey) {
    setEnabled((current) => ({ ...current, [key]: !current[key] }));
  }

  return (
    <main className="sellerPreviewPage">
      <AppDock active="post" />
      <div className="sellerPreviewShell">
        <header className="sellerPreviewHeader">
          <p>SELL ON ASPIRE MARKET</p>
          <h1>Choose how buyers can get your item.</h1>
          <span>Offer one or several fulfillment options. Buyers only see the methods you enable.</span>
        </header>

        <div className="sellerPreviewLayout">
          <section className="sellerPreviewPanel">
            <div className="sellerPreviewItemCard">
              <div className="sellerPreviewPhoto">TEST ITEM</div>
              <div>
                <small>YOUR LISTING</small>
                <h2>[TEST] Flexible delivery demo item</h2>
                <strong>$12.00</strong>
              </div>
            </div>

            <div className="sellerPreviewSectionHead">
              <div>
                <small>DELIVERY OPTIONS</small>
                <h2>What are you willing to offer?</h2>
              </div>
              <span>Multi-select</span>
            </div>

            <button className={`sellerOption ${enabled.meet ? 'active' : ''}`} onClick={() => toggle('meet')}>
              <span className="sellerCheck">{enabled.meet ? '✓' : ''}</span>
              <div><b>Meet up / Local pickup</b><small>Meet the buyer on campus or nearby. No delivery fee.</small></div>
              <em>Free</em>
            </button>

            <button className={`sellerOption ${enabled.shipping ? 'active' : ''}`} onClick={() => toggle('shipping')}>
              <span className="sellerCheck">{enabled.shipping ? '✓' : ''}</span>
              <div><b>Carrier shipping</b><small>Allow the buyer to choose a carrier rate, label, and tracking.</small></div>
              <em>Calculated</em>
            </button>
            {enabled.shipping && (
              <div className="sellerSubPanel">
                <h3>Who can cover shipping?</h3>
                <label><input type="radio" checked={shippingPayer === 'buyer'} onChange={() => setShippingPayer('buyer')} /> <span><b>Buyer pays shipping</b><small>Shipping is added to the buyer's checkout total.</small></span></label>
                <label><input type="radio" checked={shippingPayer === 'seller'} onChange={() => setShippingPayer('seller')} /> <span><b>I'll cover shipping</b><small>Shipping is deducted from your seller proceeds.</small></span></label>
                <label><input type="radio" checked={shippingPayer === 'either'} onChange={() => setShippingPayer('either')} /> <span><b>Either is okay</b><small>The final payer can be agreed before checkout.</small></span></label>
              </div>
            )}

            <button className={`sellerOption ${enabled.seller ? 'active' : ''}`} onClick={() => toggle('seller')}>
              <span className="sellerCheck">{enabled.seller ? '✓' : ''}</span>
              <div><b>I may deliver it myself</b><small>Let buyers ask you to bring the item directly.</small></div>
              <em>{enabled.seller ? 'On' : 'Off'}</em>
            </button>
            {enabled.seller && (
              <div className="sellerSubPanel">
                <h3>Your delivery terms</h3>
                <div className="sellerPills">
                  {(['free','fixed','negotiable'] as const).map((mode) => <button key={mode} className={sellerDeliveryMode === mode ? 'active' : ''} onClick={() => setSellerDeliveryMode(mode)}>{mode === 'free' ? 'Free' : mode === 'fixed' ? 'Fixed price' : 'Negotiable'}</button>)}
                </div>
                {sellerDeliveryMode === 'fixed' && <label className="sellerPrice"><span>Delivery price</span><div>$ <input value={sellerDeliveryPrice} onChange={(event) => setSellerDeliveryPrice(event.target.value.replace(/[^0-9.]/g,''))} /></div></label>}
                <p>Buyer sends a delivery request first. You can still accept or decline before the item is reserved.</p>
              </div>
            )}

            <button className={`sellerOption ${enabled.aspirer ? 'active' : ''}`} onClick={() => toggle('aspirer')}>
              <span className="sellerCheck">{enabled.aspirer ? '✓' : ''}</span>
              <div><b>Allow Aspirer delivery</b><small>A third student can pick the item up from you and deliver it to the buyer.</small></div>
              <em>Flexible</em>
            </button>

            <button className="sellerPreviewPrimary" type="button">Save delivery options</button>
          </section>

          <aside className="sellerBuyerPreview">
            <small>BUYER PREVIEW</small>
            <h2>What the buyer will see</h2>
            <p>Only the delivery methods you enable appear at Buy Now.</p>
            <div className="sellerBuyerList">
              {buyerOptions.map((option) => <div key={option}><span>✓</span><b>{option}</b></div>)}
              {!buyerOptions.length && <div><span>!</span><b>Choose at least one option</b></div>}
            </div>
            <div className="sellerMoneyExample">
              <small>EXAMPLE IF BUYER CHOOSES SHIPPING</small>
              <div><span>Item</span><b>$12.00</b></div>
              <div><span>Shipping</span><b>{shippingPayer === 'seller' ? 'Deducted from payout' : 'Added to buyer total'}</b></div>
              <div><span>Seller fee</span><b>Shown before payout</b></div>
            </div>
          </aside>
        </div>
      </div>
    </main>
  );
}
