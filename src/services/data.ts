import {
  collection,
  collectionGroup,
  deleteDoc,
  doc,
  getDoc,
  onSnapshot,
  setDoc,
  updateDoc,
} from "firebase/firestore";
import { db, isFirebaseConfigured } from "@/lib/firebase";
import { useDataStore } from "@/store/dataStore";
import { useAuthStore } from "@/store/authStore";
import { useUIStore } from "@/store/uiStore";
import { uid, inr } from "@/lib/utils";
import { orderTotals } from "@/lib/calc";
import type {
  ActivityLog,
  CollectionName,
  MovementType,
  OrderLine,
  Product,
  PurchaseOrder,
  SalesOrder,
  SalesStatus,
  StockMovement,
  DetailFieldsConfig,
} from "@/types";

const COLLECTIONS: CollectionName[] = [
  "products",
  "itemGroups",
  "salons",
  "vendors",
  "stockMovements",
  "purchaseOrders",
  "salesOrders",
  "activityLogs",
];

// Normalize variant docs from subcollection or inline product.variants array (admin dashboard).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function normalizeVariantEntry(v: any, index: number): any {
  if (!v || typeof v !== "object") return null;
  const name =
    v.name || v.shadeName || v.variantName || v.label ||
    (v.attribute && v.value ? `${v.attribute}: ${v.value}` : v.value);
  return {
    ...v,
    id: v.id || v.variantId || `variant_${index}`,
    name,
    sku: v.sku || v.variantSku || "",
    costPrice: v.costPrice ?? v.cost ?? 0,
    price: v.price ?? v.salePrice ?? v.sellingPrice ?? 0,
    originalPrice: v.originalPrice ?? v.mrp ?? v.regularPrice ?? 0,
    stock: v.stock ?? v.quantity ?? v.qty ?? 0,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function normalizeInlineVariants(raw: unknown): any[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((v, i) => normalizeVariantEntry(v, i))
    .filter(Boolean);
}

// Prefer subcollection variants; fall back to inline array on the product document.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function resolveProductVariants(productData: any, subcollection: any[] = []): any[] {
  const fromSub = subcollection.map((v, i) => normalizeVariantEntry(v, i)).filter(Boolean);
  if (fromSub.length > 0) return fromSub;
  return normalizeInlineVariants(
    productData?.variants ?? productData?.productVariants ?? productData?.variantList
  );
}

// Transform ecommerce product to inventory product
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function transformEcommerceProduct(ecomProduct: any): Product {
  return {
    id: ecomProduct.id || uid(),
    name: ecomProduct.name || "Unknown Product",
    sku: ecomProduct.sku || ecomProduct.id || "",
    brand: ecomProduct.brand || "N/A",
    category: ecomProduct.categoryName || ecomProduct.category || "Uncategorized",
    imageUrl: ecomProduct.image || ecomProduct.thumbnailUrl || ecomProduct.fullImageUrl,
    unit: ecomProduct.unit || "pcs", // Default unit if not specified
    stock: ecomProduct.stock || 0,
    reserved: 0, // Start at 0, will be managed by inventory
    reorderLevel: 10, // Default reorder level
    costPrice: 0, // Leave empty for manual entry - user will add their cost
    sellingPrice: ecomProduct.price || 0, // Current selling price from app
    gstRate: 18, // Default GST rate
    barcode: ecomProduct.barcode,
    vendorId: undefined,
    vendorName: undefined,
    groupId: ecomProduct.id, // For variant grouping if needed
    attributes: ecomProduct.size ? { Size: ecomProduct.size } : undefined,
    expiryTracking: false,
    isInventoryOnly: false, // Products from ecommerce should show in app
    status: "active" as const,
    createdAt: ecomProduct.createdAt || Date.now(),
    updatedAt: ecomProduct.updatedAt || Date.now(),
    // Store MRP for reference (not in original Product type, but we'll use originalPrice field)
    originalPrice: ecomProduct.originalPrice || 0,
  };
}

// Attach live Firestore listeners, or load dummy data in demo mode.
export function initData(): () => void {
  if (!isFirebaseConfigured || !db) {
    useDataStore.getState().loadSeed();
    return () => { };
  }
  const unsubs: (() => void)[] = [];

  // ─────────────────────────────────────────────────────────────
  // ADMIN DASHBOARD - CONTROLLED DATA (Read-only for Inventory)
  // ─────────────────────────────────────────────────────────────

  // Listen to admin products (app-facing products from admin dashboard)
  // Also fetch variants subcollection for each product
  const variantsMap: Record<string, any[]> = {};
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let rawAdminProducts: any[] = [];

  const publishAdminProducts = () => {
    const merged = rawAdminProducts.map((p) => ({
      ...p,
      variants: resolveProductVariants(p, variantsMap[p.id]),
    }));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (useDataStore.getState() as any).setCollection("adminProducts", merged);
  };

  unsubs.push(
    onSnapshot(collection(db!, "products"), (snap) => {
      rawAdminProducts = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      publishAdminProducts();
    })
  );

  // All variant subcollections (admin dashboard stores variants here)
  unsubs.push(
    onSnapshot(
      collectionGroup(db!, "variants"),
      (snap) => {
        Object.keys(variantsMap).forEach((k) => delete variantsMap[k]);
        snap.docs.forEach((d) => {
          const productId = d.ref.parent.parent?.id;
          if (!productId) return;
          if (!variantsMap[productId]) variantsMap[productId] = [];
          variantsMap[productId].push({ id: d.id, ...d.data() });
        });
        publishAdminProducts();
      },
      (err) => console.error("[variants] collectionGroup listener failed:", err)
    )
  );

  // Listen to inventory-only products (manual products - never shown in Flutter app)
  unsubs.push(
    onSnapshot(collection(db!, "inventoryProducts"), (snap) => {
      const rows = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      useDataStore.getState().setCollection("inventoryProducts", rows as any);
    })
  );

  // Listen to admin customers (users collection - app customers from admin dashboard)
  unsubs.push(
    onSnapshot(collection(db!, "users"), (snap) => {
      const adminCustomers = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      useDataStore.getState().setCollection("adminCustomers", adminCustomers as any);
    })
  );

  // Listen to admin orders (app orders from admin dashboard)
  unsubs.push(
    onSnapshot(collection(db!, "orders"), (snap) => {
      const adminOrders = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      useDataStore.getState().setCollection("adminOrders", adminOrders as any);
    })
  );

  // ─────────────────────────────────────────────────────────────
  // INVENTORY DASHBOARD - SPECIFIC COLLECTIONS
  // ─────────────────────────────────────────────────────────────

  // Listen to inventory-specific collections
  const inventoryCollections: CollectionName[] = [
    "itemGroups",
    "salons",
    "vendors",
    "stockMovements",
    "purchaseOrders",
    "salesOrders",
    "activityLogs",
  ];

  inventoryCollections.forEach((name) => {
    unsubs.push(
      onSnapshot(collection(db!, name), (snap) => {
        const rows = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        useDataStore.getState().setCollection(name as any, rows as any);
      })
    );
  });

  // Listen to settings doc
  unsubs.push(
    onSnapshot(doc(db!, "settings", "app"), (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        useUIStore.getState().setSettings(data as any);
      }
    })
  );

  useDataStore.setState({ loaded: true });
  return () => unsubs.forEach((u) => u());
}

// Save app settings to Firestore
export async function saveSettings(settings: Record<string, unknown>) {
  if (isFirebaseConfigured && db) {
    const clean = Object.fromEntries(
      Object.entries(settings).filter(([_, v]) => v !== undefined)
    );
    await setDoc(doc(db, "settings", "app"), clean, { merge: true });
  }
  // Also update local store (zustand persists to localStorage too)
  useUIStore.getState().setSettings(settings as any);
}

// Deeply remove undefined properties from objects and arrays so Firestore doesn't throw errors
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function cleanUndefinedDeep(obj: any): any {
  if (obj === null || obj === undefined) {
    return null;
  }
  if (Array.isArray(obj)) {
    return obj.map(cleanUndefinedDeep);
  }
  if (typeof obj === "object") {
    const proto = Object.getPrototypeOf(obj);
    if (proto === null || proto === Object.prototype) {
      const clean: Record<string, any> = {};
      for (const [key, val] of Object.entries(obj)) {
        if (val !== undefined) {
          clean[key] = cleanUndefinedDeep(val);
        }
      }
      return clean;
    }
  }
  return obj;
}

// Generic upsert / delete that target Firestore (live) or the in-memory store (demo).
export async function saveDoc<T extends { id: string }>(name: CollectionName, item: T) {
  if (isFirebaseConfigured && db) {
    const cleanItem = cleanUndefinedDeep(item);
    await setDoc(doc(db, name, item.id), cleanItem, { merge: true });
  } else {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const cur = (useDataStore.getState() as any)[name] as T[];
    const next = cur.some((x) => x.id === item.id)
      ? cur.map((x) => (x.id === item.id ? item : x))
      : [item, ...cur];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    useDataStore.getState().setCollection(name as any, next as any);
  }
}

export async function removeDoc(name: CollectionName, id: string) {
  if (isFirebaseConfigured && db) {
    await deleteDoc(doc(db, name, id));
  } else {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const cur = (useDataStore.getState() as any)[name] as { id: string }[];
    useDataStore
      .getState()
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .setCollection(name as any, cur.filter((x) => x.id !== id) as any);
  }
}

export function logActivity(action: string, entity: string, detail: string, entityId?: string) {
  const log: ActivityLog = {
    id: uid(),
    action,
    entity,
    detail,
    entityId,
    user: useAuthStore.getState().user?.email ?? "system",
    createdAt: Date.now(),
  };
  void saveDoc("activityLogs", log);
}

// Save payment amount for a sales order to Firestore
export async function saveOrderPayment(orderId: string, amountPaid: number) {
  const now = Date.now();
  // Save to salesOrders collection
  if (isFirebaseConfigured && db) {
    try {
      // Try updating salesOrders doc first
      await updateDoc(doc(db, "salesOrders", orderId), { amountPaid, updatedAt: now });
    } catch {
      // If salesOrders doc doesn't exist, create it with merge
      await setDoc(doc(db, "salesOrders", orderId), { amountPaid, updatedAt: now }, { merge: true });
    }


  }

  // Also update localStorage for backward compatibility
  try {
    const localPaymentsStr = localStorage.getItem("pc_order_payments");
    const localPayments = localPaymentsStr ? JSON.parse(localPaymentsStr) : {};
    localPayments[orderId] = amountPaid;
    localStorage.setItem("pc_order_payments", JSON.stringify(localPayments));
  } catch { /* ignore */ }

  // Update the local store so UI reflects immediately
  const state = useDataStore.getState() as any;
  const salesOrders = state.salesOrders || [];
  const exists = salesOrders.some((o: any) => o.id === orderId);
  const updatedSO = exists
    ? salesOrders.map((o: any) => o.id === orderId ? { ...o, amountPaid, updatedAt: now } : o)
    : [{ id: orderId, amountPaid, updatedAt: now }, ...salesOrders];
  state.setCollection("salesOrders", updatedSO);

  // Also update adminOrders in local state
  const adminOrders = state.adminOrders || [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const updatedAO = adminOrders.map((o: any) =>
    o.id === orderId ? { ...o, amountPaid, updatedAt: now } : o
  );
  state.setCollection("adminOrders", updatedAO);

  logActivity("Payment updated", "salesOrder", `Amount paid: ₹${amountPaid}`, orderId);
}

// Save payment amount for a purchase order to Firestore
export async function savePOPayment(poId: string, amountPaid: number) {
  if (isFirebaseConfigured && db) {
    try {
      await updateDoc(doc(db, "purchaseOrders", poId), { amountPaid });
    } catch {
      await setDoc(doc(db, "purchaseOrders", poId), { amountPaid }, { merge: true });
    }
  }

  // Also update localStorage for backward compatibility
  try {
    const localPaymentsStr = localStorage.getItem("pc_po_payments");
    const localPayments = localPaymentsStr ? JSON.parse(localPaymentsStr) : {};
    localPayments[poId] = amountPaid;
    localStorage.setItem("pc_po_payments", JSON.stringify(localPayments));
  } catch { /* ignore */ }

  // Update local store
  const purchaseOrders = useDataStore.getState().purchaseOrders;
  const updated = purchaseOrders.map((po) =>
    po.id === poId ? { ...po, amountPaid } : po
  );
  useDataStore.getState().setCollection("purchaseOrders", updated);

  logActivity("PO payment updated", "purchaseOrder", `Amount paid: ₹${amountPaid}`, poId);
}

// ---- Business operations -------------------------------------------------

export async function createSalesOrder(o: SalesOrder) {
  const orderWithUpdate = { ...o, updatedAt: o.updatedAt || o.createdAt || Date.now() };
  await saveDoc("salesOrders", orderWithUpdate);
  const salon = useDataStore.getState().salons.find((s) => s.id === o.salonId);
  if (salon) {
    await saveDoc("salons", {
      ...salon,
      totalPurchases: salon.totalPurchases + o.total,
      outstanding: salon.outstanding + (o.paymentStatus === "Paid" ? 0 : o.total),
    });
  }
  logActivity("Created order", "salesOrder", `${o.channel} order · ${o.salonName} · ${inr(o.total)}`, o.orderNo);
}
export async function setOrderStatus(order: SalesOrder, status: SalesStatus) {
  const now = Date.now();
  // Stamp the moment this status was first reached (don't overwrite existing).
  const stamp: Partial<SalesOrder> = { updatedAt: now };
  if (status === "Packed" && !order.packedAt) stamp.packedAt = now;
  if (status === "Delivered" && !order.deliveredAt) stamp.deliveredAt = now;
  if (status === "Cancelled" && !order.cancelledAt) stamp.cancelledAt = now;
  if (status === "Returned" && !order.returnedAt) stamp.returnedAt = now;

  if (isFirebaseConfigured && db) {
    await setDoc(doc(db, "salesOrders", order.id), { inventoryStatus: status, ...stamp }, { merge: true });

    // Sync to 'orders' collection if it is an app order (channel is 'app' or starts with 'PC')
    const channel = order.channel || (order as any).source || "manual";
    const isAppOrder = channel === "app" || 
                       String(order.orderNo || "").startsWith("PC") || 
                       String(order.id || "").startsWith("PC");
    if (isAppOrder) {
      try {
        await updateDoc(doc(db, "orders", order.id), {
          status: status,
          orderStatus: status,
          updatedAt: now,
        });
      } catch (err) {
        console.warn(`Failed to update status in 'orders' via updateDoc, trying setDoc:`, err);
        try {
          await setDoc(doc(db, "orders", order.id), {
            status: status,
            orderStatus: status,
            updatedAt: now,
          }, { merge: true });
        } catch (err2) {
          console.error(`Failed to update status in 'orders' collection:`, err2);
        }
      }
    }
  }

  // Update the local store so UI reflects immediately
  const state = useDataStore.getState() as any;
  const salesOrders = state.salesOrders || [];
  const exists = salesOrders.some((o: any) => o.id === order.id);
  const updatedSO = exists
    ? salesOrders.map((o: any) => o.id === order.id ? { ...o, status, inventoryStatus: status, ...stamp } : o)
    : [{ id: order.id, status, inventoryStatus: status, ...stamp }, ...salesOrders];
  state.setCollection("salesOrders", updatedSO);

  const channel = order.channel || (order as any).source || "manual";
  const isAppOrder = channel === "app" || 
                     String(order.orderNo || "").startsWith("PC") || 
                     String(order.id || "").startsWith("PC");
  if (isAppOrder) {
    const adminOrders = state.adminOrders || [];
    const updatedAO = adminOrders.map((o: any) =>
      o.id === order.id ? { ...o, status, orderStatus: status, updatedAt: now } : o
    );
    state.setCollection("adminOrders", updatedAO);
  }



  // Handle stock transitions based on decremented status groups
  const DECREMENTED_STATUSES = ["Delivered", "Cancelled"];
  const wasDecremented = DECREMENTED_STATUSES.includes(order.status);
  const isDecremented = DECREMENTED_STATUSES.includes(status);

  if (isDecremented && !wasDecremented) {
    // Transition from non-decremented to decremented -> Decrement stock
    for (const line of order.lines) {
      const [pId, vId] = line.productId.split("__");
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const state = useDataStore.getState() as any;
      const adminProducts = state.adminProducts || [];
      const inventoryProducts = state.inventoryProducts || [];
      const p = adminProducts.find((x: any) => x.id === pId) || inventoryProducts.find((x: any) => x.id === pId);
      if (!p) continue;

      await adjustStock(p, "out", -line.qty, `Sale (Order ${order.orderNo})`, vId);
    }
  } else if (!isDecremented && wasDecremented) {
    // Transition from decremented to non-decremented -> Increment stock back
    const type: MovementType = status === "Returned" ? "return" : "in";
    const reason = status === "Returned" ? `Customer return (Order ${order.orderNo})` : `Order reverted to ${status} (Order ${order.orderNo})`;

    for (const line of order.lines) {
      const [pId, vId] = line.productId.split("__");
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const state = useDataStore.getState() as any;
      const adminProducts = state.adminProducts || [];
      const inventoryProducts = state.inventoryProducts || [];
      const p = adminProducts.find((x: any) => x.id === pId) || inventoryProducts.find((x: any) => x.id === pId);
      if (!p) continue;

      await adjustStock(p, type, line.qty, reason, vId);
    }
  }

  logActivity("Order status", "salesOrder", `${order.orderNo} → ${status}`, order.orderNo);
}

export async function adjustStock(
  product: Product,
  type: MovementType,
  signedQty: number,
  reason: string,
  variantId?: string
) {
  if (variantId) {
    const variants = (product as any).variants || [];
    const variant = variants.find((v: any) => v.id === variantId);
    if (variant) {
      const newStock = (variant.stock ?? 0) + signedQty;
      await updateVariantField(product.id, variantId, "stock", newStock);
      await saveDoc<StockMovement>("stockMovements", {
        id: uid(),
        productId: `${product.id}__${variantId}`,
        productName: `${product.name} - ${variant.name || variant.shadeName || variant.value || variantId}`,
        type,
        qty: signedQty,
        reason,
        balanceAfter: newStock,
        createdAt: Date.now(),
      });
      logActivity("Stock adjustment", "variant", `${product.sku} (${variant.sku || variantId}): ${signedQty > 0 ? "+" : ""}${signedQty} (${reason})`, product.sku);
    }
  } else {
    const newStock = (product.stock ?? 0) + signedQty;
    if ((product as any).isInventoryOnly || (product as any).source === "manual") {
      await saveInventoryProduct({ ...product, stock: newStock, updatedAt: Date.now() });
    } else {
      await saveDoc<Product>("products", { ...product, stock: newStock, updatedAt: Date.now() });
    }
    await saveDoc<StockMovement>("stockMovements", {
      id: uid(),
      productId: product.id,
      productName: product.name,
      type,
      qty: signedQty,
      reason,
      balanceAfter: newStock,
      createdAt: Date.now(),
    });
    logActivity("Stock adjustment", "product", `${product.sku}: ${signedQty > 0 ? "+" : ""}${signedQty} (${reason})`, product.sku);
  }
}

// Receive (fully or partially) lines of a purchase order; adds stock + movements.
export async function receivePurchase(po: PurchaseOrder, receipts: Record<string, number>) {
  const lines = po.lines.map((l) => ({
    ...l,
    received: Math.min(l.qty, l.received + (receipts[l.productId] || 0)),
  }));
  for (const l of po.lines) {
    const add = receipts[l.productId] || 0;
    if (add <= 0) continue;
    const p = useDataStore.getState().products.find((x) => x.id === l.productId);
    if (!p) continue;
    const newStock = p.stock + add;
    await saveDoc<Product>("products", { ...p, stock: newStock, costPrice: l.cost, updatedAt: Date.now() });
    await saveDoc<StockMovement>("stockMovements", {
      id: uid(),
      productId: p.id,
      productName: p.name,
      type: "in",
      qty: add,
      reason: "PO receipt",
      refNo: po.poNo,
      balanceAfter: newStock,
      createdAt: Date.now(),
    });
  }
  const fully = lines.every((l) => l.received >= l.qty);
  const some = lines.some((l) => l.received > 0);
  const status: PurchaseOrder["status"] = fully ? "Received" : some ? "Partial" : po.status;
  await saveDoc("purchaseOrders", { ...po, lines, status });
  logActivity("Received PO", "purchaseOrder", `${po.poNo} — ${status}`, po.poNo);
}

// Apply edited invoice (lines, extra charges, note) back to a sales order,
// recomputing all totals & profit. Optionally also push the new price/cost onto
// the product master records (the "ask each time" choice from the invoice screen).
export async function updateOrderPricing(
  order: SalesOrder,
  lines: OrderLine[],
  updateMaster: boolean,
  extras?: { extraCharges?: { id: string; label: string; amount: number }[]; invoiceNote?: string; deliveryEnabled?: boolean; detailFields?: DetailFieldsConfig }
) {
  const extraCharges = extras?.extraCharges ?? order.extraCharges ?? [];
  const totals = orderTotals(lines, extraCharges);

  const items = lines.map((l) => ({
    productId: l.productId,
    id: l.productId,
    name: l.name,
    title: l.name,
    productName: l.name,
    sku: l.sku,
    qty: l.qty,
    quantity: l.qty,
    price: l.price,
    unitPrice: l.price,
    cost: l.cost,
    costPrice: l.cost,
    gstRate: l.gstRate,
    gstPercent: l.gstRate,
    gst: l.gstRate,
    discount: l.discount,
  }));

  const updatedOrder = {
    ...order,
    lines,
    items,
    ...totals,
    extraCharges,
    deliveryEnabled: extras?.deliveryEnabled !== undefined ? extras.deliveryEnabled : (order.deliveryEnabled ?? false),
    detailFields: extras?.detailFields ?? order.detailFields ?? null,
    invoiceNote: extras?.invoiceNote ?? order.invoiceNote ?? "",
    updatedAt: Date.now(),
  };
  await saveDoc("salesOrders", updatedOrder);

  // Update the local store so UI reflects immediately
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const state = useDataStore.getState() as any;
  const salesOrders = state.salesOrders || [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const updatedSO = salesOrders.map((o: any) =>
    o.id === order.id ? { ...o, ...updatedOrder } : o
  );
  state.setCollection("salesOrders", updatedSO);

  // Also update adminOrders in local state
  const adminOrders = state.adminOrders || [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const updatedAO = adminOrders.map((o: any) =>
    o.id === order.id ? { ...o, ...updatedOrder } : o
  );
  state.setCollection("adminOrders", updatedAO);



  if (updateMaster) {
    for (const l of lines) {
      const [pId, vId] = l.productId.split("__");

      if (vId) {
        // Variant product: update variant's price and cost
        // Let's find the product in adminProducts
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const adminProd = ((useDataStore.getState() as any).adminProducts || []).find((x: any) => x.id === pId);
        if (adminProd) {
          const variant = (adminProd.variants || []).find((v: any) => v.id === vId);
          if (variant) {
            const variantPrice = variant.price ?? variant.sellingPrice ?? 0;
            const variantCost = variant.costPrice ?? variant.cost ?? 0;
            if (Number(variantPrice) !== l.price) {
              await updateVariantField(pId, vId, "price", l.price);
            }
            if (Number(variantCost) !== l.cost) {
              await updateVariantField(pId, vId, "costPrice", l.cost);
            }
          }
          continue;
        }

        // Let's find the product in inventoryProducts
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const invProd = ((useDataStore.getState() as any).inventoryProducts || []).find((x: any) => x.id === pId);
        if (invProd) {
          const variants = invProd.variants || [];
          const updatedVariants = variants.map((v: any) => {
            if (v.id === vId) {
              return { ...v, price: l.price, costPrice: l.cost, cost: l.cost, sellingPrice: l.price };
            }
            return v;
          });
          await saveInventoryProduct({ ...invProd, variants: updatedVariants, updatedAt: Date.now() });
        }
      } else {
        // Simple product: update simple product's price and cost
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const adminProd = ((useDataStore.getState() as any).adminProducts || []).find((x: any) => x.id === pId);
        if (adminProd) {
          if (Number(adminProd.sellingPrice ?? 0) !== l.price || Number(adminProd.costPrice ?? 0) !== l.cost) {
            await saveDoc("products", { ...adminProd, sellingPrice: l.price, costPrice: l.cost, updatedAt: Date.now() });
          }
          continue;
        }

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const invProd = ((useDataStore.getState() as any).inventoryProducts || []).find((x: any) => x.id === pId);
        if (invProd) {
          if (Number(invProd.sellingPrice ?? 0) !== l.price || Number(invProd.costPrice ?? 0) !== l.cost) {
            await saveInventoryProduct({ ...invProd, sellingPrice: l.price, costPrice: l.cost, updatedAt: Date.now() });
          }
        }
      }
    }
  }
  logActivity(
    "Edited invoice",
    "salesOrder",
    `${order.orderNo} updated${updateMaster ? " + product master updated" : ""}`,
    order.orderNo
  );
}

// ─── App Customers & Orders (Controlled by Admin Dashboard) ────────────

// Get all app customers (from users collection)
export function getAppCustomers() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (useDataStore.getState() as any).customers || [];
}

// Get all app orders (from orders collection)
export function getAppOrders() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (useDataStore.getState() as any).appOrders || [];
}

// Get a specific app customer by ID
export function getAppCustomerById(customerId: string) {
  const customers = getAppCustomers();
  return customers.find((c: any) => c.id === customerId);
}

// Get a specific app order by ID
export function getAppOrderById(orderId: string) {
  const orders = getAppOrders();
  return orders.find((o: any) => o.id === orderId);
}

// Get orders for a specific customer
export function getAppOrdersByCustomer(customerId: string) {
  const orders = getAppOrders();
  return orders.filter((o: any) =>
    o.userId === customerId ||
    o.uid === customerId ||
    o.customerId === customerId
  );
}

// Get summary stats for app orders
export function getAppOrdersStats() {
  const orders = getAppOrders();
  const totalOrders = orders.length;
  const totalRevenue = orders.reduce((sum: number, o: any) => sum + (Number(o.amount) || 0), 0);
  const totalCustomers = new Set(
    orders.map((o: any) => o.userId || o.uid || o.customerId)
  ).size;

  const ordersByStatus = orders.reduce((acc: any, o: any) => {
    const status = (o.orderStatus || o.status || "pending").toLowerCase();
    acc[status] = (acc[status] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  return {
    totalOrders,
    totalRevenue,
    totalCustomers,
    ordersByStatus,
  };
}

// Get summary stats for app customers
export function getAppCustomersStats() {
  const customers = getAppCustomers();
  const totalCustomers = customers.length;
  const orders = getAppOrders();

  const customersByStatus = customers.reduce((acc: any, c: any) => {
    const status = c.status || "active";
    acc[status] = (acc[status] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const customersWithOrders = new Set(
    orders.map((o: any) => o.userId || o.uid || o.customerId)
  ).size;

  return {
    totalCustomers,
    customersWithOrders,
    customersWithoutOrders: totalCustomers - customersWithOrders,
    customersByStatus,
  };
}

// ─── Admin Dashboard Data (Read-only in Inventory) ────────────

export function getAdminProducts() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (useDataStore.getState() as any).adminProducts || [];
}

export function getAdminCustomers() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (useDataStore.getState() as any).adminCustomers || [];
}

export function getAdminOrders() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (useDataStore.getState() as any).adminOrders || [];
}

export function getAdminProductById(productId: string) {
  const products = getAdminProducts();
  return products.find((p: any) => p.id === productId);
}

export function getAdminCustomerById(customerId: string) {
  const customers = getAdminCustomers();
  return customers.find((c: any) => c.id === customerId);
}

export function getAdminOrderById(orderId: string) {
  const orders = getAdminOrders();
  return orders.find((o: any) => o.id === orderId);
}

export function getAdminOrdersByCustomer(customerId: string) {
  const orders = getAdminOrders();
  return orders.filter((o: any) =>
    o.userId === customerId ||
    o.uid === customerId ||
    o.customerId === customerId
  );
}

export function getAdminOrdersStats() {
  const orders = getAdminOrders();
  const totalOrders = orders.length;
  const totalRevenue = orders.reduce((sum: number, o: any) => sum + (Number(o.amount) || 0), 0);
  const totalCustomers = new Set(
    orders.map((o: any) => o.userId || o.uid || o.customerId)
  ).size;

  const ordersByStatus = orders.reduce((acc: any, o: any) => {
    const status = (o.orderStatus || o.status || "pending").toLowerCase();
    acc[status] = (acc[status] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  return {
    totalOrders,
    totalRevenue,
    totalCustomers,
    ordersByStatus,
  };
}

export function getAdminCustomersStats() {
  const customers = getAdminCustomers();
  const totalCustomers = customers.length;
  const orders = getAdminOrders();

  const customersByStatus = customers.reduce((acc: any, c: any) => {
    const status = c.status || "active";
    acc[status] = (acc[status] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const customersWithOrders = new Set(
    orders.map((o: any) => o.userId || o.uid || o.customerId)
  ).size;

  return {
    totalCustomers,
    customersWithOrders,
    customersWithoutOrders: totalCustomers - customersWithOrders,
    customersByStatus,
  };
}

// ─── Inventory-only Products (NOT shown in Flutter app) ────────────────────

export function getInventoryProducts() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (useDataStore.getState() as any).inventoryProducts || [];
}

export async function saveInventoryProduct(product: Record<string, any>) {
  const id = product.id || uid();
  const item = {
    ...product,
    id,
    isInventoryOnly: true,
    createdAt: product.createdAt || Date.now(),
    updatedAt: Date.now(),
  };
  // Saves to "inventoryProducts" collection — NEVER touches "products" collection
  // so it will NEVER appear in the Flutter app
  if (isFirebaseConfigured && db) {
    const clean = Object.fromEntries(
      Object.entries(item).filter(([_, v]) => v !== undefined)
    );
    await setDoc(doc(db, "inventoryProducts", id), clean, { merge: true });
  } else {
    const cur = getInventoryProducts();
    const next = cur.some((x: any) => x.id === id)
      ? cur.map((x: any) => (x.id === id ? item : x))
      : [item, ...cur];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (useDataStore.getState() as any).setCollection("inventoryProducts", next);
  }
  logActivity("Created inventory product", "inventoryProduct", (item as any).name || id, id);
}

export async function deleteInventoryProduct(id: string) {
  if (isFirebaseConfigured && db) {
    await deleteDoc(doc(db, "inventoryProducts", id));
  } else {
    const cur = getInventoryProducts();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (useDataStore.getState() as any).setCollection("inventoryProducts", cur.filter((x: any) => x.id !== id));
  }
  logActivity("Deleted inventory product", "inventoryProduct", id, id);
}

// ─── Update a single field on an admin product (products collection) ────────

export async function updateProductField(
  productId: string,
  field: string,
  value: number | string,
) {
  if (isFirebaseConfigured && db) {
    await updateDoc(doc(db, "products", productId), { [field]: value });
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const state = useDataStore.getState() as any;
  const updated = (state.adminProducts || []).map((p: any) =>
    p.id === productId ? { ...p, [field]: value } : p
  );
  state.setCollection("adminProducts", updated);
}

// ─── Update a field on an inventory-only product ────────────────────────────

export async function updateInventoryProductField(
  productId: string,
  field: string,
  value: number | string,
) {
  if (isFirebaseConfigured && db) {
    await updateDoc(doc(db, "inventoryProducts", productId), { [field]: value });
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const state = useDataStore.getState() as any;
  const updated = (state.inventoryProducts || []).map((p: any) =>
    p.id === productId ? { ...p, [field]: value } : p
  );
  state.setCollection("inventoryProducts", updated);
}

export async function updateVariantField(
  productId: string,
  variantId: string,
  field: string,
  value: number | string,
) {
  const payload: Record<string, any> =
    field === "mrp"
      ? { originalPrice: value, mrp: value }
      : field === "costPrice"
        ? { costPrice: value, cost: value }
        : { [field]: value };

  if (isFirebaseConfigured && db) {
    try {
      await updateDoc(doc(db, "products", productId, "variants", variantId), payload as any);
    } catch {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const state = useDataStore.getState() as any;
      const product = (state.adminProducts || []).find((p: any) => p.id === productId);
      if (!product) return;
      const updatedVariants = (product.variants || []).map((v: any) =>
        v.id === variantId ? { ...v, ...payload } : v
      );
      await updateDoc(doc(db, "products", productId), { variants: updatedVariants });
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const state = useDataStore.getState() as any;
  const updated = (state.adminProducts || []).map((p: any) =>
    p.id === productId
      ? {
        ...p,
        variants: (p.variants || []).map((v: any) =>
          v.id === variantId ? { ...v, ...payload } : v
        ),
      }
      : p
  );
  state.setCollection("adminProducts", updated);
}
