import DeliveryBoard from './DeliveryBoard';

export const metadata = {
  title: 'Delivery / Errand · Aspire 101',
  description: 'Ask the Aspire Network for a flexible campus delivery or errand.'
};

export default function DeliveryPage() {
  return <>
    <div style={{ position: 'fixed', right: 20, bottom: 92, zIndex: 60, display: 'grid', gap: 8, justifyItems: 'end' }}>
      <a
        href="/delivery/manage"
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 7, borderRadius: 999, padding: '9px 13px',
          background: '#fff', color: '#111827', border: '1px solid #d8dde5', textDecoration: 'none',
          fontSize: 12, fontWeight: 850, boxShadow: '0 8px 22px rgba(15,23,42,.11)'
        }}
      >
        Manage Delivery
      </a>
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
