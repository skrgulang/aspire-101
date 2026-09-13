import type { Metadata } from 'next';
import AmbassadorAdminDashboard from './AmbassadorAdminDashboard';

export const metadata: Metadata = {
  title: 'Campus Ambassador Admin — Aspire 101',
  robots: { index: false, follow: false }
};

export default function AmbassadorAdminPage() {
  return <AmbassadorAdminDashboard />;
}
