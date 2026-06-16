import type { OrderStatus, PoStatus } from '../types';

export const money = (n: number) =>
  n.toLocaleString(undefined, { style: 'currency', currency: 'USD' });

export const shortDate = (iso?: string | null) =>
  iso ? new Date(iso).toLocaleDateString() : '—';

export const poStatusTone: Record<PoStatus, 'gray' | 'blue' | 'amber' | 'green' | 'red'> = {
  DRAFT: 'gray',
  AWAITING_CONFIRMATION: 'amber',
  ORDERED: 'blue',
  PARTIALLY_RECEIVED: 'amber',
  RECEIVED: 'green',
  CANCELLED: 'red',
  DECLINED: 'red',
};

export const poStatusLabel: Record<PoStatus, string> = {
  DRAFT: 'Draft',
  AWAITING_CONFIRMATION: 'Awaiting confirmation',
  ORDERED: 'Confirmed',
  PARTIALLY_RECEIVED: 'Partially received',
  RECEIVED: 'Received',
  CANCELLED: 'Cancelled',
  DECLINED: 'Declined',
};

export const orderStatusTone: Record<OrderStatus, 'gray' | 'blue' | 'amber' | 'green' | 'red'> = {
  UNCONFIRMED: 'gray',
  CONFIRMED: 'blue',
  PREORDER: 'amber',
  DELIVERED: 'green',
  CANCELLED: 'red',
};

export const orderStatusLabel: Record<OrderStatus, string> = {
  UNCONFIRMED: 'Unconfirmed',
  CONFIRMED: 'Confirmed',
  PREORDER: 'Pre-order',
  DELIVERED: 'Delivered',
  CANCELLED: 'Cancelled',
};
