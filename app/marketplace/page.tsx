import Marketplace from '../Marketplace';

export default function MarketplacePage() {
  return <>
    <a
      href="/marketplace/sell"
      style={{
        position: 'fixed',
        right: 20,
        bottom: 92,
        zIndex: 40,
        padding: '12px 16px',
        borderRadius: 999,
        background: '#ffc400',
        color: '#17130a',
        fontWeight: 900,
        textDecoration: 'none',
        boxShadow: '0 14px 34px rgba(0,0,0,.18)'
      }}
    >
      + Sell an item
    </a>
    <Marketplace />
  </>;
}
