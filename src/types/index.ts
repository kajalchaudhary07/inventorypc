// =============================================================================
// Domain model — all Firestore document shapes live here.
// =============================================================================

export type EntityStatus = "active" | "archived";

export interface Product {
  id: string;
  name: string;
  sku: string;
  brand: string;
  category: string;
  imageUrl?: string;
  unit: string; // ml, pcs, box, kg...
  stock: number; // physical on hand
  reserved: number; // committed to open orders
  reorderLevel: number; // Odoo-style reordering rule trigger
  costPrice: number;
  sellingPrice: number; // What we're selling for
  originalPrice?: number; // MRP from ecommerce (for reference)
  gstRate: number; // %
  barcode?: string;
  vendorId?: string;
  vendorName?: string;
  groupId?: string; // belongs to an item group (variant)
  attributes?: Record<string, string>; // { Size: "250ml", Shade: "Black" }
  expiryTracking?: boolean;
  isInventoryOnly?: boolean; // true if only for inventory dashboard, not visible in app
  status: EntityStatus;
  createdAt: number;
  updatedAt: number;
}

export interface ItemGroup {
  id: string;
  name: string;
  brand: string;
  category: string;
  unit: string;
  attributes: { name: string; options: string[] }[];
  createdAt: number;
}

export interface Salon {
  id: string;
  name: string;
  ownerName: string;
  phone: string;
  email?: string;
  gstin?: string;
  address?: string;
  region?: string;
  branchNo?: string;
  description?: string;
  outstanding: number;
  totalPurchases: number;
  status?: string;
  tier?: string;
  type?: string;
  createdAt: number;
}

export interface Vendor {
  id: string;
  name: string;
  contactName: string;
  phone: string;
  email?: string;
  gstin?: string;
  address?: string;
  totalPurchased: number;
  outstanding: number;
  status?: string;
  category?: string;
  createdAt: number;
}

export interface OrderLine {
  productId: string;
  name: string; // editable per-invoice display name (does not change product master)
  description?: string; // optional per-line description shown on the invoice
  sku: string;
  qty: number;
  price: number; // unit selling price
  cost: number; // unit cost (for profit)
  gstRate: number; // %
  discount: number; // amount on the line
}

export interface ExtraCharge {
  id: string;
  label: string;
  amount: number;
}

export type SalesStatus =
  | "Placed"
  | "Confirmed"
  | "Processing"
  | "Packed"
  | "Dispatched"
  | "Delivered"
  | "Edited"
  | "Cancelled"
  | "Returned"
  | "Pending";
export type SalesChannel = "app" | "phone" | "whatsapp" | "manual";
export type PaymentStatus = "Paid" | "Unpaid" | "Partial";

export interface SalesOrder {
  id: string;
  orderNo: string;
  salonId: string;
  salonName: string;
  channel: SalesChannel;
  lines: OrderLine[];
  subtotal: number;
  gstTotal: number;
  discountTotal: number;
  total: number;
  profit: number;
  status: SalesStatus;
  inventoryStatus?: SalesStatus;
  paymentStatus: PaymentStatus;
  amountPaid?: number; // Persisted paid amount (Firestore)
  customerId?: string;
  userId?: string;
  uid?: string;
  createdAt: number;
  updatedAt?: number;
  // Editable-invoice extras (all optional for backward compatibility).
  extraCharges?: ExtraCharge[]; // custom rows below GST (surge, packaging, round-off…)
  extraChargesTotal?: number;
  invoiceNote?: string; // customer-facing note shown at invoice bottom
  expectedDelivery?: number; // admin-entered expected delivery date (timestamp)
  // Timestamps recorded as the order moves through its lifecycle. Used for
  // order-fulfillment time and delivery-success metrics.
  packedAt?: number;
  deliveredAt?: number;
  cancelledAt?: number;
  returnedAt?: number;
}

export type PurchaseStatus = "Draft" | "Sent" | "Partial" | "Received" | "Cancelled";

export interface PurchaseLine {
  productId: string;
  name: string;
  sku: string;
  qty: number;
  received: number;
  cost: number;
}

export interface PurchaseOrder {
  id: string;
  poNo: string;
  vendorId: string;
  vendorName: string;
  lines: PurchaseLine[];
  total: number;
  status: PurchaseStatus;
  amountPaid?: number; // Persisted paid amount (Firestore)
  expectedDate?: number;
  createdAt: number;
}

export type MovementType = "in" | "out" | "adjustment" | "damaged" | "expired" | "return";

export interface StockMovement {
  id: string;
  productId: string;
  productName: string;
  type: MovementType;
  qty: number; // positive in / negative out
  reason?: string;
  refNo?: string;
  balanceAfter: number;
  createdAt: number;
}

export interface ActivityLog {
  id: string;
  action: string;
  entity: string;
  entityId?: string;
  detail: string;
  user: string;
  createdAt: number;
}

export interface AppSettings {
  companyName: string;
  companyAddress: string;
  companyCity: string;
  companyState: string;
  companyPhone: string;
  companyEmail: string;
  companyWebsite: string;
  companyGstin: string;
  defaultGst: number;
  invoicePrefix: string;
  currencySymbol: string;
  enableBarcode: boolean;
  lowStockNotifications: boolean;
  expiryAlerts: boolean;
}

export type CollectionName =
  | "products"
  | "itemGroups"
  | "salons"
  | "vendors"
  | "stockMovements"
  | "purchaseOrders"
  | "salesOrders"
  | "activityLogs"
  | "pendingProducts";

export interface DetailFieldsConfig {
  amountPaid: boolean;
  amountToBePaid: boolean;
  paymentStatus: boolean;
  totalGst: boolean;
  gstColumn: boolean;
  source: boolean;
  placeOfSupply: boolean;
  delivery: boolean;
}

