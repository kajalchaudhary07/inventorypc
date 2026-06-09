import type {
  ActivityLog,
  ItemGroup,
  Product,
  PurchaseOrder,
  Salon,
  SalesOrder,
  StockMovement,
  Vendor,
} from "@/types";
import { daysAgo, uid } from "./utils";

const now = Date.now();

export const seedVendors: Vendor[] = [
  { id: "v1", name: "GlowSource Distributors", contactName: "Rakesh Mehta", phone: "9820011223", email: "sales@glowsource.in", gstin: "27AABCG1234M1Z5", address: "Andheri, Mumbai", totalPurchased: 458000, outstanding: 32000, createdAt: daysAgo(220) },
  { id: "v2", name: "Pro Beauty Wholesale", contactName: "Sneha Kapoor", phone: "9810044556", email: "orders@probeauty.in", gstin: "07AAACP4321Q1Z2", address: "Karol Bagh, Delhi", totalPurchased: 312000, outstanding: 0, createdAt: daysAgo(180) },
  { id: "v3", name: "Salon Supply Co.", contactName: "Imran Shaikh", phone: "9833077889", gstin: "27AADCS9876R1Z1", address: "Pune", totalPurchased: 197500, outstanding: 14500, createdAt: daysAgo(140) },
];

export const seedSalons: Salon[] = [
  { id: "s1", name: "Mirror Mirror Salon", ownerName: "Priya Nair", phone: "9876500011", gstin: "27AAEPN1234C1Z9", address: "Bandra, Mumbai", region: "Mumbai", branchNo: "B-1", outstanding: 8400, totalPurchases: 142000, createdAt: daysAgo(200) },
  { id: "s2", name: "Sharp Cuts Studio", ownerName: "Arjun Verma", phone: "9876500022", address: "Powai, Mumbai", region: "Mumbai", branchNo: "B-2", outstanding: 0, totalPurchases: 96500, createdAt: daysAgo(160) },
  { id: "s3", name: "Glamour House", ownerName: "Fatima Sheikh", phone: "9876500033", gstin: "27AADPS5678D1Z3", address: "Thane", region: "Thane", branchNo: "B-1", outstanding: 21500, totalPurchases: 188000, createdAt: daysAgo(190) },
  { id: "s4", name: "Urban Roots Salon", ownerName: "Kabir Singh", phone: "9876500044", address: "Vashi, Navi Mumbai", region: "Navi Mumbai", outstanding: 3200, totalPurchases: 67000, createdAt: daysAgo(95) },
];

export const seedProducts: Product[] = [
  { id: "p1", name: "L'Oréal Pro Shampoo 250ml", sku: "SHM-250-LOR", brand: "L'Oréal", category: "Shampoo", unit: "bottle", stock: 240, reserved: 30, reorderLevel: 50, costPrice: 180, sellingPrice: 320, gstRate: 18, vendorId: "v1", vendorName: "GlowSource Distributors", expiryTracking: true, status: "active", createdAt: daysAgo(150), updatedAt: daysAgo(3), imageUrl: "" },
  { id: "p2", name: "Schwarzkopf Hair Color - Black", sku: "CLR-BLK-SCH", brand: "Schwarzkopf", category: "Hair Color", unit: "tube", stock: 38, reserved: 12, reorderLevel: 40, costPrice: 95, sellingPrice: 190, gstRate: 18, vendorId: "v2", vendorName: "Pro Beauty Wholesale", expiryTracking: true, status: "active", createdAt: daysAgo(120), updatedAt: daysAgo(1) },
  { id: "p3", name: "Wella Conditioner 500ml", sku: "CND-500-WEL", brand: "Wella", category: "Conditioner", unit: "bottle", stock: 6, reserved: 4, reorderLevel: 25, costPrice: 260, sellingPrice: 460, gstRate: 18, vendorId: "v1", vendorName: "GlowSource Distributors", status: "active", createdAt: daysAgo(100), updatedAt: daysAgo(2) },
  { id: "p4", name: "Matrix Hair Serum 100ml", sku: "SRM-100-MTX", brand: "Matrix", category: "Serum", unit: "bottle", stock: 0, reserved: 0, reorderLevel: 20, costPrice: 210, sellingPrice: 399, gstRate: 18, vendorId: "v3", vendorName: "Salon Supply Co.", status: "active", createdAt: daysAgo(80), updatedAt: daysAgo(5) },
  { id: "p5", name: "Beardo Beard Oil 50ml", sku: "OIL-50-BRD", brand: "Beardo", category: "Beard Care", unit: "bottle", stock: 130, reserved: 10, reorderLevel: 30, costPrice: 120, sellingPrice: 249, gstRate: 18, vendorId: "v2", vendorName: "Pro Beauty Wholesale", status: "active", createdAt: daysAgo(70), updatedAt: daysAgo(4) },
  { id: "p6", name: "Disposable Razor (Pack of 10)", sku: "RZR-10-GEN", brand: "Generic", category: "Tools", unit: "pack", stock: 420, reserved: 0, reorderLevel: 100, costPrice: 45, sellingPrice: 99, gstRate: 12, vendorId: "v3", vendorName: "Salon Supply Co.", status: "active", createdAt: daysAgo(60), updatedAt: daysAgo(6) },
  { id: "p7", name: "Keratin Treatment Kit", sku: "KIT-KER-PRO", brand: "GK Pro", category: "Treatment", unit: "kit", stock: 18, reserved: 6, reorderLevel: 15, costPrice: 850, sellingPrice: 1499, gstRate: 18, vendorId: "v1", vendorName: "GlowSource Distributors", expiryTracking: true, status: "active", createdAt: daysAgo(50), updatedAt: daysAgo(1) },
  { id: "p8", name: "Hair Spa Cream 1kg", sku: "SPA-1KG-LOR", brand: "L'Oréal", category: "Treatment", unit: "jar", stock: 64, reserved: 8, reorderLevel: 20, costPrice: 540, sellingPrice: 920, gstRate: 18, vendorId: "v1", vendorName: "GlowSource Distributors", status: "active", createdAt: daysAgo(40), updatedAt: daysAgo(2) },
];

export const seedItemGroups: ItemGroup[] = [
  {
    id: "g1",
    name: "Schwarzkopf Hair Color",
    brand: "Schwarzkopf",
    category: "Hair Color",
    unit: "tube",
    attributes: [{ name: "Shade", options: ["Black", "Brown", "Blonde", "Burgundy"] }],
    createdAt: daysAgo(120),
  },
];

const order = (
  i: number,
  salon: Salon,
  channel: SalesOrder["channel"],
  status: SalesOrder["status"],
  ageDays: number,
  lines: SalesOrder["lines"]
): SalesOrder => {
  const subtotal = lines.reduce((s, l) => s + l.price * l.qty, 0);
  const discountTotal = lines.reduce((s, l) => s + l.discount, 0);
  const gstTotal = lines.reduce((s, l) => s + ((l.price * l.qty - l.discount) * l.gstRate) / 100, 0);
  const profit = lines.reduce((s, l) => s + (l.price - l.cost) * l.qty - l.discount, 0);
  const createdAt = daysAgo(ageDays);
  // Simulate a realistic fulfillment timeline for delivered/packed/etc. orders.
  const hrs = (h: number) => createdAt + h * 3600000;
  const packedAt = status === "Packed" || status === "Delivered" || status === "Returned" ? hrs(6 + (i % 5) * 3) : undefined;
  const deliveredAt = status === "Delivered" || status === "Returned" ? hrs(24 + (i % 4) * 12) : undefined;
  const cancelledAt = status === "Cancelled" ? hrs(3) : undefined;
  const returnedAt = status === "Returned" ? hrs(72) : undefined;
  return {
    id: "o" + i,
    orderNo: "SO-" + (1000 + i),
    salonId: salon.id,
    salonName: salon.name,
    channel,
    lines,
    subtotal,
    discountTotal,
    gstTotal,
    profit,
    total: subtotal - discountTotal + gstTotal,
    status,
    paymentStatus: status === "Delivered" ? "Paid" : status === "Cancelled" ? "Unpaid" : "Partial",
    createdAt,
    packedAt,
    deliveredAt,
    cancelledAt,
    returnedAt,
  };
};

const L = (p: Product, qty: number, discount = 0) => ({
  productId: p.id,
  name: p.name,
  sku: p.sku,
  qty,
  price: p.sellingPrice,
  cost: p.costPrice,
  gstRate: p.gstRate,
  discount,
});

export const seedSalesOrders: SalesOrder[] = [
  order(1, seedSalons[0], "app", "Delivered", 1, [L(seedProducts[0], 12), L(seedProducts[4], 6)]),
  order(2, seedSalons[1], "whatsapp", "Pending", 0, [L(seedProducts[1], 10, 50)]),
  order(3, seedSalons[2], "phone", "Packed", 0, [L(seedProducts[6], 4), L(seedProducts[7], 5)]),
  order(4, seedSalons[3], "manual", "Delivered", 2, [L(seedProducts[5], 8)]),
  order(5, seedSalons[0], "app", "Delivered", 3, [L(seedProducts[0], 20, 200)]),
  order(6, seedSalons[2], "app", "Returned", 4, [L(seedProducts[2], 5)]),
  order(7, seedSalons[1], "phone", "Delivered", 5, [L(seedProducts[7], 10), L(seedProducts[4], 4)]),
  order(8, seedSalons[3], "whatsapp", "Cancelled", 6, [L(seedProducts[5], 3)]),
  order(9, seedSalons[0], "app", "Delivered", 12, [L(seedProducts[0], 15), L(seedProducts[6], 8)]),
  order(10, seedSalons[2], "manual", "Delivered", 40, [L(seedProducts[7], 12)]),
];

export const seedPurchaseOrders: PurchaseOrder[] = [
  {
    id: "po1",
    poNo: "PO-2001",
    vendorId: "v1",
    vendorName: "GlowSource Distributors",
    lines: [
      { productId: "p1", name: seedProducts[0].name, sku: seedProducts[0].sku, qty: 200, received: 200, cost: 180 },
      { productId: "p3", name: seedProducts[2].name, sku: seedProducts[2].sku, qty: 50, received: 50, cost: 260 },
    ],
    total: 200 * 180 + 50 * 260,
    status: "Received",
    createdAt: daysAgo(20),
  },
  {
    id: "po2",
    poNo: "PO-2002",
    vendorId: "v2",
    vendorName: "Pro Beauty Wholesale",
    lines: [{ productId: "p2", name: seedProducts[1].name, sku: seedProducts[1].sku, qty: 100, received: 40, cost: 95 }],
    total: 100 * 95,
    status: "Partial",
    expectedDate: daysAgo(-5),
    createdAt: daysAgo(6),
  },
  {
    id: "po3",
    poNo: "PO-2003",
    vendorId: "v3",
    vendorName: "Salon Supply Co.",
    lines: [{ productId: "p4", name: seedProducts[3].name, sku: seedProducts[3].sku, qty: 60, received: 0, cost: 210 }],
    total: 60 * 210,
    status: "Sent",
    expectedDate: daysAgo(-3),
    createdAt: daysAgo(3),
  },
];

export const seedStockMovements: StockMovement[] = [
  { id: uid(), productId: "p1", productName: seedProducts[0].name, type: "in", qty: 200, reason: "PO received", refNo: "PO-2001", balanceAfter: 240, createdAt: daysAgo(20) },
  { id: uid(), productId: "p1", productName: seedProducts[0].name, type: "out", qty: -12, reason: "Sale", refNo: "SO-1001", balanceAfter: 228, createdAt: daysAgo(1) },
  { id: uid(), productId: "p2", productName: seedProducts[1].name, type: "in", qty: 40, reason: "Partial receipt", refNo: "PO-2002", balanceAfter: 38, createdAt: daysAgo(6) },
  { id: uid(), productId: "p3", productName: seedProducts[2].name, type: "damaged", qty: -3, reason: "Leaked in transit", balanceAfter: 6, createdAt: daysAgo(2) },
  { id: uid(), productId: "p7", productName: seedProducts[6].name, type: "adjustment", qty: -2, reason: "Stock count correction", balanceAfter: 18, createdAt: daysAgo(4) },
  { id: uid(), productId: "p4", productName: seedProducts[3].name, type: "expired", qty: -5, reason: "Past expiry", balanceAfter: 0, createdAt: daysAgo(5) },
];

export const seedActivityLogs: ActivityLog[] = [
  { id: uid(), action: "Created order", entity: "salesOrder", entityId: "SO-1002", detail: "WhatsApp order from Sharp Cuts Studio", user: "admin@salon.com", createdAt: daysAgo(0) },
  { id: uid(), action: "Received PO", entity: "purchaseOrder", entityId: "PO-2002", detail: "Partially received 40/100 units", user: "admin@salon.com", createdAt: daysAgo(6) },
  { id: uid(), action: "Price change", entity: "product", entityId: "SRM-100-MTX", detail: "Selling price 379 → 399", user: "admin@salon.com", createdAt: daysAgo(5) },
  { id: uid(), action: "Stock adjustment", entity: "product", entityId: "KIT-KER-PRO", detail: "Adjusted -2 (count correction)", user: "admin@salon.com", createdAt: daysAgo(4) },
];
