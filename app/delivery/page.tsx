import DeliveryBoard from './DeliveryBoard';

export const metadata = {
  title: 'Delivery / Errand · Aspire 101',
  description: 'Ask the Aspire Network for a flexible campus delivery or errand.'
};

export default function DeliveryPage() {
  return <>
    <div style={{ position: 'fixed', right: 20, bottom: 92, zIndex: 60 }}>
      <a
        href="/delivery/activity"
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 7,
          borderRadius: 999,
          padding: '10px 14px',
          background: '#111827',
          color: '#fff',
          textDecoration: 'none',
          fontSize: 12,
          fontWeight: 850,
          boxShadow: '0 10px 28px rgba(15,23,42,.18)'
        }}
      >
        Delivery Activity
      </a>
    </div>
    <DeliveryBoard />
  </>;
}
