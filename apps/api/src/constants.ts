// Allowed values for the String-typed "enum" fields in the Prisma schema.
// Kept here (not in the DB) so the schema stays portable across SQLite/Postgres.

export const ROLES = ['ADMIN', 'MANAGER', 'STAFF'] as const;
export type Role = (typeof ROLES)[number];

export const MOVEMENT_TYPES = [
  'ADJUSTMENT',
  'RECEIPT',
  'SHIPMENT',
  'TRANSFER_IN',
  'TRANSFER_OUT',
] as const;
export type MovementType = (typeof MOVEMENT_TYPES)[number];

export const PO_STATUSES = [
  'DRAFT',
  'AWAITING_CONFIRMATION',
  'ORDERED',
  'PARTIALLY_RECEIVED',
  'RECEIVED',
  'CANCELLED',
  'DECLINED',
] as const;
export type PoStatus = (typeof PO_STATUSES)[number];

export const SHIPMENT_STATUSES = [
  'PENDING',
  'PICKING',
  'SHIPPED',
  'DELIVERED',
  'CANCELLED',
] as const;
export type ShipmentStatus = (typeof SHIPMENT_STATUSES)[number];
