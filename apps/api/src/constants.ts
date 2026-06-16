// Allowed values for the String-typed "enum" fields in the Prisma schema.
// Kept here (not in the DB) so the schema stays portable across SQLite/Postgres.

export const ROLES = ['ADMIN', 'MANAGER', 'STAFF', 'DRIVER'] as const;
export type Role = (typeof ROLES)[number];

// Roles a product can be hidden from. Admins always retain access, so they're
// never hideable.
export const HIDEABLE_ROLES = ['MANAGER', 'STAFF'] as const;
export type HideableRole = (typeof HIDEABLE_ROLES)[number];

export const MOVEMENT_TYPES = [
  'ADJUSTMENT',
  'RECEIPT',
  'DELIVERY',
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

// Who may see a product. COMPANY = everyone; RESTRICTED = only the users listed in
// ProductVisibility; BY_ROLE = hidden from the roles listed in ProductHiddenRole;
// ADMINS_ONLY = hidden from all employees. Admins always see every product.
export const PRODUCT_VISIBILITIES = ['COMPANY', 'RESTRICTED', 'BY_ROLE', 'ADMINS_ONLY'] as const;
export type ProductVisibility = (typeof PRODUCT_VISIBILITIES)[number];

// Order lifecycle: placed (UNCONFIRMED) → CONFIRMED (stored for viewing) →
// PREORDER (adjust discounts / add-remove products) → DELIVERED (stock deducted)
// or CANCELLED. Editing line items is allowed while UNCONFIRMED or PREORDER.
export const ORDER_STATUSES = [
  'UNCONFIRMED',
  'CONFIRMED',
  'PREORDER',
  'DELIVERED',
  'CANCELLED',
] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];
