import type { Metadata } from 'next';
import AdminActivityDashboard from '../../AdminActivityDashboard';

export const metadata: Metadata = {
  title: 'Daily Active Monitor — Aspire 101',
  description: 'Admin-only product activity monitoring for Aspire 101.'
};

export default function AdminMetricsPage() {
  return <AdminActivityDashboard />;
}
