export type Role = 'ADMIN' | 'MANAGER' | 'STAFF';

export interface User {
  id: string;
  email: string;
  name: string;
  role: Role;
  companyId: string;
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

export interface PurchaseOrder {
  id: string;
  number: string;
  status: PoStatus;
  supplierId: string;
  warehouseId?: string | null;
  notes?: string | null;
  orderedAt?: string | null;
  expectedAt?: string | null;
  createdAt: string;
  supplier?: { id: string; name: string } | null;
  warehouse?: { id: string; code: string; name: string } | null;
  createdBy?: { name: string } | null;
  items?: PoItem[];
  itemCount?: number;
  total?: number;
}

export interface DashboardData {
  counts: { products: number; warehouses: number; suppliers: number; lowStock: number };
  totalUnits: number;
  stockValue: number;
  lowStock: { id: string; sku: string; name: string; totalStock: number; reorderPoint: number; reorderQty: number }[];
  recentMovements: Movement[];
}
