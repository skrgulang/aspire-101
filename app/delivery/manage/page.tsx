import DeliveryManageCenter from './DeliveryManageCenter';

export const metadata = {
  title: 'Manage Deliveries · Aspire 101',
  description: 'Cancel unmatched delivery requests, withdraw delivery offers, or open Resolution Center for matched deliveries.'
};

export default function DeliveryManagePage() {
  return <DeliveryManageCenter />;
}
