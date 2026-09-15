import { requireEnv } from './aspireServer';

const shippoApiBase = 'https://api.goshippo.com';

export type ShippoAddress = {
  name: string;
  street1: string;
  street2?: string;
  city: string;
  state: string;
  zip: string;
  country: string;
  email?: string;
  phone?: string;
};

export type ShippoAddressObject = ShippoAddress & {
  object_id: string;
  validation_results?: { is_valid?: boolean; messages?: Array<{ text?: string | null }> } | null;
};

export type ShippoParcel = {
  length: string;
  width: string;
  height: string;
  distance_unit: 'in';
  weight: string;
  mass_unit: 'lb';
};

export type ShippoRate = {
  object_id: string;
  object_status?: string;
  provider?: string;
  servicelevel?: { name?: string; token?: string };
  amount?: string;
  currency?: string;
  estimated_days?: number | null;
  duration_terms?: string | null;
};

export type ShippoShipment = {
  object_id: string;
  object_status?: string;
  status?: string;
  metadata?: string | null;
  rates?: ShippoRate[];
};

export type ShippoTransaction = {
  object_id: string;
  status: 'SUCCESS' | 'ERROR' | 'QUEUED' | string;
  rate?: ShippoRate | null;
  tracking_number?: string | null;
  tracking_status?: { status?: string | null } | null;
  tracking_url_provider?: string | null;
  label_url?: string | null;
  messages?: Array<{ text?: string | null }>;
};

export type ShippoTrackingStatus = {
  tracking_status?: { status?: string | null; status_details?: string | null } | null;
  eta?: string | null;
  tracking_history?: unknown[];
};

function shippoErrorMessage(payload: any, status: number) {
  const detail = payload?.detail || payload?.message || payload?.error || payload?.messages?.[0]?.text;
  return typeof detail === 'string' ? detail : `Shippo request failed (${status}).`;
}

export async function shippoRequest<T>(path: string, init: RequestInit = {}) {
  const token = requireEnv('SHIPPO_API_KEY');
  const response = await fetch(`${shippoApiBase}${path}`, {
    ...init,
    headers: {
      Authorization: `ShippoToken ${token}`,
      'Content-Type': 'application/json',
      ...(init.headers || {})
    },
    cache: 'no-store'
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`SHIPPO:${shippoErrorMessage(payload, response.status)}`);
  return payload as T;
}

export async function createShippoAddress(address: ShippoAddress) {
  return shippoRequest<ShippoAddressObject>('/addresses/', {
    method: 'POST',
    body: JSON.stringify({ ...address, validate: true })
  });
}

export async function createShippoShipment(input: {
  addressFrom: ShippoAddress | string;
  addressTo: ShippoAddress | string;
  parcel: ShippoParcel;
  metadata: string;
}) {
  return shippoRequest<ShippoShipment>('/shipments/', {
    method: 'POST',
    body: JSON.stringify({
      address_from: input.addressFrom,
      address_to: input.addressTo,
      parcels: [input.parcel],
      async: false,
      metadata: input.metadata
    })
  });
}

export async function getShippoShipment(shipmentId: string) {
  return shippoRequest<ShippoShipment>(`/shipments/${encodeURIComponent(shipmentId)}/`);
}

export async function buyShippoLabel(input: { rateId: string; metadata: string }) {
  return shippoRequest<ShippoTransaction>('/transactions/', {
    method: 'POST',
    body: JSON.stringify({
      rate: input.rateId,
      label_file_type: 'PDF',
      async: false,
      metadata: input.metadata
    })
  });
}

export async function getShippoTracking(carrier: string, trackingNumber: string) {
  return shippoRequest<ShippoTrackingStatus>(`/tracks/${encodeURIComponent(carrier)}/${encodeURIComponent(trackingNumber)}`);
}

export function normalizeShippingStatus(value: string | null | undefined) {
  switch ((value || '').toUpperCase()) {
    case 'PRE_TRANSIT':
    case 'UNKNOWN':
      return 'label_purchased' as const;
    case 'TRANSIT':
    case 'OUT_FOR_DELIVERY':
    case 'AVAILABLE_FOR_PICKUP':
      return 'in_transit' as const;
    case 'DELIVERED':
      return 'delivered' as const;
    case 'FAILURE':
    case 'RETURNED':
    case 'ERROR':
      return 'exception' as const;
    default:
      return 'label_purchased' as const;
  }
}
