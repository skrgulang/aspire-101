import type { Metadata } from 'next';
import FounderGrowthDashboard from '../../FounderGrowthDashboard';

export const metadata: Metadata = {
  title: 'Founder Growth Monitor — Aspire 101',
  description: 'Admin-only DAU, CTR, signup conversion, campus growth, and transaction monitoring for Aspire 101.'
};

export default function AdminMetricsPage() {
  return <FounderGrowthDashboard />;
}
