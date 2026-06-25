/**
 * Order Merger Service
 * Frontend-only merger for orders and salesOrders.
 * Merges e-commerce/retail orders (orders) with inventory overrides (salesOrders).
 */

const toMs = (ts: any): number => {
  if (!ts) return 0;
  if (typeof ts?.toDate === "function") return ts.toDate().getTime();
  if (ts && typeof ts === "object" && typeof ts.seconds === "number") return ts.seconds * 1000;
  if (ts instanceof Date) return ts.getTime();
  if (typeof ts === "number") return ts;
  const p = new Date(ts as string);
  return Number.isNaN(p.getTime()) ? Date.now() : p.getTime();
};

const getField = (obj: any, keys: string[]) => {
  for (const key of keys) {
    if (obj && obj[key] !== undefined && obj[key] !== null && obj[key] !== "") {
      return obj[key];
    }
  }
  return "";
};

const normalizeLines = (rawItems: any[]) => {
  return rawItems.map((item: any) => ({
    productId: item.productId || item.id || "",
    name: item.name || item.title || item.productName || "",
    sku: item.sku || item.productId || "",
    qty: Number(item.quantity ?? item.qty ?? 1) || 1,
    price: Number(item.price ?? item.unitPrice ?? 0),
    cost: Number(item.cost ?? item.costPrice ?? item.cost ?? 0),
    gstRate: Number(item.gstRate ?? item.gstPercent ?? item.gst ?? 0),
    discount: Number(item.discount ?? 0),
    mrp: item.mrp !== undefined ? Number(item.mrp) : undefined,
    description: item.description || "",
  }));
};

/**
 * Merges raw adminOrders (from 'orders') and inventory-specific salesOrders.
 * Values from salesOrders override values from orders.
 */
export const mergeOrders = (
  adminOrders: any[],
  salesOrders: any[],
  salons: any[] = [],
  adminCustomers: any[] = []
): any[] => {
  const map = new Map<string, any>();

  const resolveOrderNames = (o: any) => {
    const cid = o.salonId || o.customerId || o.userId || o.uid || "";
    const salonObj = salons.find((x: any) => x.id === cid);
    const appCust = adminCustomers.find((x: any) => x.id === cid);

    const ownerName =
      getField(salonObj, ["ownerName"]) ||
      getField(appCust, ["ownerName", "name", "customerName", "displayName"]) ||
      "";
    const resolvedSalonName =
      getField(salonObj, ["name"]) ||
      getField(appCust, ["salonName", "salon"]) ||
      o.salonName ||
      o.customerName ||
      "";
    const customerName =
      o.salonName ||
      getField(appCust, ["name", "customerName", "displayName", "ownerName"]) ||
      getField(salonObj, ["ownerName", "name"]) ||
      resolvedSalonName ||
      "";

    return {
      ownerName,
      resolvedSalonName,
      customerName,
    };
  };

  // 1. Add all adminOrders (from orders collection) first
  (adminOrders || []).forEach((o: any) => {
    const rawItems = Array.isArray(o.items) ? o.items : Array.isArray(o.lines) ? o.lines : [];
    const lines = normalizeLines(rawItems);
    const subtotal = lines.reduce((sum: number, l: any) => sum + l.price * l.qty, 0);
    const profit = lines.reduce((sum: number, l: any) => sum + (l.price - l.cost) * l.qty, 0);
    const { ownerName, resolvedSalonName, customerName } = resolveOrderNames(o);
    const rawSalonName =
      o.salonName ||
      o.contactDetails?.receiverName ||
      o.receiverName ||
      o.customerName ||
      o.customer?.name ||
      o.userName ||
      o.userId ||
      "-";
    const finalSalonName = resolvedSalonName || rawSalonName;

    // Capitalize status if present
    let rawStatus = o.status || o.orderStatus || "Pending";
    if (typeof rawStatus === "string" && rawStatus) {
      rawStatus = rawStatus
        .split(" ")
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
        .join(" ");
    }

    let rawPaymentStatus = o.paymentStatus || o.payment_status || "Pending";
    if (typeof rawPaymentStatus === "string" && rawPaymentStatus) {
      rawPaymentStatus = rawPaymentStatus
        .split(" ")
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
        .join(" ");
    }

    map.set(o.id, {
      ...o,
      id: o.id,
      orderNo: o.orderNo || o.orderId || o.code || o.number || o.id,
      salonName: finalSalonName,
      salonId: o.salonId || o.customerId || o.userId || o.uid || null,
      lines,
      subtotal,
      total: Number(o.total ?? o.amount ?? o.totalAmount ?? o.grandTotal ?? o.payableAmount ?? 0),
      profit,
      createdAt: toMs(o.createdAt || o.orderDate || o.date),
      updatedAt: toMs(o.updatedAt || o.createdAt || o.orderDate || o.date),
      status: rawStatus,
      channel: o.channel || o.source || "app",
      paymentStatus: rawPaymentStatus,
      expectedDelivery: o.expectedDelivery,
      ownerName,
      resolvedSalonName: finalSalonName,
      customerName: customerName || rawSalonName,
    });
  });

  // 2. Merge salesOrders on top of adminOrders
  (salesOrders || []).forEach((o: any) => {
    // Case A & B: Deletion markers
    if (o.isPermanentlyDeleted || o.isDeleted) {
      map.delete(o.id);
      return;
    }

    const existing = map.get(o.id);
    const rawItems = Array.isArray(o.items) ? o.items : Array.isArray(o.lines) ? o.lines : [];
    const lines = rawItems.length > 0 ? normalizeLines(rawItems) : existing ? existing.lines : [];
    const subtotal = lines.reduce((sum: number, l: any) => sum + l.price * l.qty, 0);
    const profit = lines.reduce((sum: number, l: any) => sum + (l.price - l.cost) * l.qty, 0);
    const { ownerName, resolvedSalonName, customerName } = resolveOrderNames(o);

    // Capitalize status & payment status
    let rawStatus = o.inventoryStatus || o.status || o.orderStatus || (existing ? existing.status : "Pending");
    if (typeof rawStatus === "string" && rawStatus) {
      rawStatus = rawStatus
        .split(" ")
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
        .join(" ");
    }

    let rawPaymentStatus =
      o.paymentStatus || o.payment_status || (existing ? existing.paymentStatus : "Pending");
    if (typeof rawPaymentStatus === "string" && rawPaymentStatus) {
      rawPaymentStatus = rawPaymentStatus
        .split(" ")
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
        .join(" ");
    }

    // Case C: Existing Order Override
    if (existing) {
      const merged = {
        ...existing,
        ...o,
        lines,
        subtotal,
        profit,
        createdAt: o.createdAt ? toMs(o.createdAt) : existing.createdAt,
        updatedAt: o.updatedAt ? toMs(o.updatedAt) : (existing.updatedAt ? toMs(existing.updatedAt) : (o.createdAt ? toMs(o.createdAt) : existing.createdAt)),
        status: rawStatus,
        paymentStatus: rawPaymentStatus,
      };

      if (!merged.id) merged.id = o.id;
      if (!merged.orderNo) merged.orderNo = o.orderNo || o.orderId || o.code || o.number || o.id;
      if (!merged.salonName) merged.salonName = resolvedSalonName || o.salonName || existing.salonName;
      if (!merged.salonId) merged.salonId = o.salonId || o.customerId || o.userId || o.uid || existing.salonId;
      if (!merged.channel) merged.channel = o.channel || o.source || existing.channel;

      map.set(o.id, merged);
    }
    // Case D: Inventory-Only Order (no original exists)
    else {
      const channel = o.channel || o.source || "manual";
      const isManual = channel === "manual" || channel === "phone" || channel === "whatsapp" || String(o.orderNo || o.id || "").startsWith("SO-");
      const isAdminDeleted = !isManual;

      const merged = {
        ...o,
        lines,
        subtotal,
        profit,
        createdAt: o.createdAt ? toMs(o.createdAt) : Date.now(),
        updatedAt: o.updatedAt ? toMs(o.updatedAt) : (o.createdAt ? toMs(o.createdAt) : Date.now()),
        status: rawStatus,
        paymentStatus: rawPaymentStatus,
        isAdminDeleted,
      };

      if (!merged.id) merged.id = o.id;
      if (!merged.orderNo) merged.orderNo = o.orderNo || o.orderId || o.code || o.number || o.id;
      if (!merged.salonName) merged.salonName = resolvedSalonName || o.salonName || "-";
      if (!merged.salonId) merged.salonId = o.salonId || o.customerId || o.userId || o.uid || null;
      if (!merged.channel) merged.channel = o.channel || o.source || "manual";

      map.set(o.id, merged);
    }
  });

  return Array.from(map.values());
};
