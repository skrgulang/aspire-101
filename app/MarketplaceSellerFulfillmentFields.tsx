'use client';

import { useEffect, useMemo, useState } from 'react';
import styles from './MarketplaceSellerFulfillmentFields.module.css';

type OptionKey = 'meet' | 'shipping' | 'seller' | 'aspirer';
type ShippingPayer = 'buyer' | 'seller' | 'either';
type SellerDeliveryMode = 'free' | 'fixed' | 'negotiable';

type Draft = {
  enabled: Record<OptionKey, boolean>;
  shippingPayer: ShippingPayer;
  sellerDeliveryMode: SellerDeliveryMode;
  sellerDeliveryPrice: string;
  updatedAt: string;
};

export const SELLER_FULFILLMENT_DRAFT_KEY = 'aspire:seller-delivery-options-preview-v1';

const DEFAULT_ENABLED: Record<OptionKey, boolean> = {
  meet: true,
  shipping: true,
  seller: false,
  aspirer: true
};

export default function MarketplaceSellerFulfillmentFields() {
  const [enabled, setEnabled] = useState(DEFAULT_ENABLED);
  const [shippingPayer, setShippingPayer] = useState<ShippingPayer>('buyer');
  const [sellerDeliveryMode, setSellerDeliveryMode] = useState<SellerDeliveryMode>('negotiable');
  const [sellerDeliveryPrice, setSellerDeliveryPrice] = useState('5');
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(SELLER_FULFILLMENT_DRAFT_KEY);
      if (raw) {
        const saved = JSON.parse(raw) as Partial<Draft>;
        if (saved.enabled) setEnabled({
          meet: Boolean(saved.enabled.meet),
          shipping: Boolean(saved.enabled.shipping),
          seller: Boolean(saved.enabled.seller),
          aspirer: Boolean(saved.enabled.aspirer)
        });
        if (saved.shippingPayer === 'buyer' || saved.shippingPayer === 'seller' || saved.shippingPayer === 'either') setShippingPayer(saved.shippingPayer);
        if (saved.sellerDeliveryMode === 'free' || saved.sellerDeliveryMode === 'fixed' || saved.sellerDeliveryMode === 'negotiable') setSellerDeliveryMode(saved.sellerDeliveryMode);
        if (typeof saved.sellerDeliveryPrice === 'string') setSellerDeliveryPrice(saved.sellerDeliveryPrice);
      }
    } catch {
      // A broken browser draft should never block listing creation.
    } finally {
      setHydrated(true);
    }
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    const draft: Draft = {
      enabled,
      shippingPayer,
      sellerDeliveryMode,
      sellerDeliveryPrice,
      updatedAt: new Date().toISOString()
    };
    try { window.localStorage.setItem(SELLER_FULFILLMENT_DRAFT_KEY, JSON.stringify(draft)); } catch { /* ignore browser storage failure */ }
  }, [enabled, shippingPayer, sellerDeliveryMode, sellerDeliveryPrice, hydrated]);

  const preview = useMemo(() => {
    const items: string[] = [];
    if (enabled.meet) items.push('Meet up · Free');
    if (enabled.shipping) items.push(`Shipping · ${shippingPayer === 'buyer' ? 'Buyer pays' : shippingPayer === 'seller' ? 'Seller covers' : 'Either can cover'}`);
    if (enabled.seller) items.push(`Seller delivery · ${sellerDeliveryMode === 'free' ? 'Free' : sellerDeliveryMode === 'fixed' ? `$${sellerDeliveryPrice || '0'}` : 'Negotiable'}`);
    if (enabled.aspirer) items.push('Aspirer delivery · Flexible');
    return items;
  }, [enabled, shippingPayer, sellerDeliveryMode, sellerDeliveryPrice]);

  const invalidFixedPrice = enabled.seller && sellerDeliveryMode === 'fixed' && Number(sellerDeliveryPrice) <= 0;

  function toggle(key: OptionKey) {
    setEnabled((current) => ({ ...current, [key]: !current[key] }));
  }

  return (
    <section className={styles.wrap} aria-label="Seller delivery options">
      <div className={styles.head}>
        <div><span>DELIVERY OPTIONS · MULTI-SELECT</span><h3>How can buyers get this item?</h3></div>
        <small>Choose every option you are willing to offer. The buyer only sees the methods you enable.</small>
      </div>

      <div className={styles.grid}>
        <button type="button" className={`${styles.option} ${enabled.meet ? styles.active : ''}`} onClick={() => toggle('meet')}>
          <i className={styles.check}>{enabled.meet ? '✓' : ''}</i><span className={styles.copy}><b>Meet up / Local pickup</b><small>Meet on campus or nearby.</small></span><em className={styles.badge}>FREE</em>
        </button>
        <button type="button" className={`${styles.option} ${enabled.shipping ? styles.active : ''}`} onClick={() => toggle('shipping')}>
          <i className={styles.check}>{enabled.shipping ? '✓' : ''}</i><span className={styles.copy}><b>Carrier shipping</b><small>Buyer enters an address and picks an available carrier rate.</small></span><em className={styles.badge}>CALCULATED</em>
        </button>
        <button type="button" className={`${styles.option} ${enabled.seller ? styles.active : ''}`} onClick={() => toggle('seller')}>
          <i className={styles.check}>{enabled.seller ? '✓' : ''}</i><span className={styles.copy}><b>I may deliver it myself</b><small>Let the buyer ask you to bring it directly.</small></span><em className={styles.badge}>{enabled.seller ? 'ON' : 'OFF'}</em>
        </button>
        <button type="button" className={`${styles.option} ${enabled.aspirer ? styles.active : ''}`} onClick={() => toggle('aspirer')}>
          <i className={styles.check}>{enabled.aspirer ? '✓' : ''}</i><span className={styles.copy}><b>Allow Aspirer delivery</b><small>A third student can pick it up from you and deliver it.</small></span><em className={styles.badge}>FLEXIBLE</em>
        </button>
      </div>

      {enabled.shipping && <div className={styles.sub}>
        <h4>If the buyer chooses carrier shipping, who can cover the shipping cost?</h4>
        <label className={styles.radio}><input type="radio" checked={shippingPayer === 'buyer'} onChange={() => setShippingPayer('buyer')} /><span><b>Buyer pays shipping</b><small>Carrier cost is added to the buyer checkout.</small></span></label>
        <label className={styles.radio}><input type="radio" checked={shippingPayer === 'seller'} onChange={() => setShippingPayer('seller')} /><span><b>I’ll cover shipping</b><small>Carrier cost is deducted from your seller proceeds.</small></span></label>
        <label className={styles.radio}><input type="radio" checked={shippingPayer === 'either'} onChange={() => setShippingPayer('either')} /><span><b>Either is okay</b><small>Buyer can choose who covers it at checkout.</small></span></label>
      </div>}

      {enabled.seller && <div className={styles.sub}>
        <h4>Your own delivery terms</h4>
        <div className={styles.pills}>
          {(['free','fixed','negotiable'] as SellerDeliveryMode[]).map((mode) => <button type="button" key={mode} className={sellerDeliveryMode === mode ? styles.active : ''} onClick={() => setSellerDeliveryMode(mode)}>{mode === 'free' ? 'Free' : mode === 'fixed' ? 'Fixed price' : 'Negotiable'}</button>)}
        </div>
        {sellerDeliveryMode === 'fixed' && <label className={styles.price}>$ <input inputMode="decimal" value={sellerDeliveryPrice} onChange={(event) => setSellerDeliveryPrice(event.target.value.replace(/[^0-9.]/g, ''))} aria-label="Seller delivery price" /></label>}
        {invalidFixedPrice && <p className={styles.error}>Enter a seller delivery price greater than $0 before publishing.</p>}
      </div>}

      <div className={styles.preview}>{preview.map((item) => <span key={item}>{item}</span>)}{!preview.length && <span>No delivery method selected</span>}</div>
      <p className={styles.auto}>Saved automatically with this listing draft. These exact choices will be written to the real marketplace listing when you publish.</p>
    </section>
  );
}
