export type Role = 'ADMIN' | 'MANAGER' | 'STAFF' | 'DRIVER';

export type ProductVisibility = 'COMPANY' | 'RESTRICTED' | 'BY_ROLE' | 'ADMINS_ONLY';

// Non-admin roles a product can be hidden from (admins always retain access).
export type HideableRole = 'MANAGER' | 'STAFF';

export interface User {
  id: string;
  email: string;
  name: string;
  role: Role;
  companyId: string;
  companyName?: string;
}

export interface ManagedUser {
  id: string;
  email: string;
  name: string;
  role: Role;
  isActive: boolean;
  createdAt: string;
}

export interface Product {
  id: string;
  sku: string;
  name: string;
  description?: string | null;
  category?: string | null;
  unit: string;
  barcode?: string | null;
  unitCost: number;
  unitPrice: number;
  reorderPoint: number;
  reorderQty: number;
  isActive: boolean;
  supplierId?: string | null;
  supplier?: { id: string; name: string } | null;
  totalStock?: number;
  // Visibility mode, the users allowed when RESTRICTED, and the roles hidden when
  // BY_ROLE (admins always see all).
  visibility?: ProductVisibility;
  visibleTo?: { userId: string }[];
  hiddenRoles?: { role: HideableRole }[];
}

export interface Warehouse {
  id: string;
  code: string;
  name: string;
  address?: string | null;
  isActive: boolean;
}

export interface Supplier {
  id: string;
  name: string;
  contactName?: string | null;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
  notes?: string | null;
  isActive: boolean;
  _count?: { products: number; purchaseOrders: number };
  products?: { id: string; sku: string; name: string }[];
}

export interface WarehouseDetail extends Warehouse {
  metrics: { skuCount: number; unitsOnHand: number; inventoryValue: number; openPoCount: number };
  stock: { productId: string; sku: string; name: string; unit: string; quantity: number }[];
  recentMovements: {
    id: string;
    type: string;
    quantity: number;
    reason?: string | null;
    reference?: string | null;
    createdAt: string;
    product: { sku: string; name: string };
    user?: { name: string } | null;
  }[];
}

export interface StockLevel {
  id: string;
  productId: string;
  warehouseId: string;
  quantity: number;
  product: {
    id: string;
    sku: string;
    name: string;
    unit: string;
    reorderPoint: number;
    supplier?: { id: string; name: string } | null;
  };
  warehouse: { id: string; code: string; name: string };
}

export interface Movement {
  id: string;
  type: string;
  quantity: number;
  reason?: string | null;
  reference?: string | null;
  createdAt: string;
  product: { sku: string; name: string };
  warehouse: { code: string; name?: string };
  user?: { name: string } | null;
}

export type PoStatus =
  | 'DRAFT'
  | 'AWAITING_CONFIRMATION'
  | 'ORDERED'
  | 'PARTIALLY_RECEIVED'
  | 'RECEIVED'
  | 'CANCELLED'
  | 'DECLINED';

export interface PoItem {
  id: string;
  productId: string;
  quantity: number;
  unitCost: number;
  receivedQty: number;
  product?: { id: string; sku: string; name: string; unit: string };
}

export interface PoReceiptHistory {
  id: string;
  quantity: number;
  createdAt: string;
  product: { id: string; sku: string; name: string; unit: string };
  warehouse: { id: string; code: string; name: string };
  user?: { name: string } | null;
}

export interface PurchaseOrder {
  id: string;
  number: string;
  status: PoStatus;
  supplierId: string;
  warehouseId?: string | null;
  notes?: string | null;
  orderedAt?: string | null;
  expectedAt?: string | null;
  nextExpectedAt?: string | null;
  createdAt: string;
  supplier?: { id: string; name: string } | null;
  warehouse?: { id: string; code: string; name: string } | null;
  createdBy?: { name: string } | null;
  items?: PoItem[];
  receiptHistory?: PoReceiptHistory[];
  itemCount?: number;
  total?: number;
}

export type OrderStatus = 'UNCONFIRMED' | 'CONFIRMED' | 'PREORDER' | 'DELIVERED' | 'CANCELLED';

export interface Route {
  id: string;
  name: string;
  code?: string | null;
  notes?: string | null;
  isActive: boolean;
  driverId?: string | null;
  driver?: { id: string; name: string; email?: string } | null;
  customers?: { id: string; name: string; address?: string | null; isActive: boolean }[];
  orders?: {
    id: string;
    number: string;
    status: OrderStatus;
    createdAt: string;
    customer?: { id: string; name: string };
  }[];
  _count?: { customers: number; orders: number };
}

export interface Customer {
  id: string;
  name: string;
  contactName?: string | null;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
  notes?: string | null;
  isActive: boolean;
  routeId?: string | null;
  route?: { id: string; name: string } | null;
  _count?: { orders: number };
  orders?: { id: string; number: string; status: OrderStatus; createdAt: string }[];
}

export interface OrderItem {
  id: string;
  productId: string;
  quantity: number;
  unitPrice: number;
  discount: number; // percent off this line (0–100)
  product?: { id: string; sku: string; name: string; unit: string };
}

export interface Order {
  id: string;
  number: string;
  status: OrderStatus;
  notes?: string | null;
  warehouseId?: string | null;
  confirmedAt?: string | null;
  deliveredAt?: string | null;
  createdAt: string;
  customerId: string;
  customer?: { id: string; name: string; address?: string | null } | null;
  routeId?: string | null;
  route?: { id: string; name: string; driver?: { id: string; name: string } | null } | null;
  warehouse?: { id: string; code: string; name: string } | null;
  createdBy?: { name: string } | null;
  items?: OrderItem[];
  itemCount?: number;
  total?: number;
}

export interface CentralizationGroup {
  route: { id: string; name: string; code?: string | null } | null;
  driver: { id: string; name: string } | null;
  orderCount: number;
  totalUnits: number;
  stops: { customerId: string; customerName: string; address?: string | null; orderCount: number }[];
  merchandise: { productId: string; sku: string; name: string; unit: string; quantity: number }[];
}

export interface Centralization {
  statuses: string[];
  groups: CentralizationGroup[];
}

export interface DashboardData {
  counts: { products: number; warehouses: number; suppliers: number; lowStock: number };
  totalUnits: number;
  stockValue: number;
  lowStock: { id: string; sku: string; name: string; totalStock: number; reorderPoint: number; reorderQty: number }[];
  recentMovements: Movement[];
}
