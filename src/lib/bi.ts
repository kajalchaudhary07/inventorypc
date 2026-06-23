import type { Product, Salon, SalesOrder } from "@/types";

const DAY = 86400000;
const valid = (orders: SalesOrder[]) => orders.filter((o) => o.status !== "Cancelled");
const inWindow = (o: SalesOrder, start: number, end: number) => o.createdAt >= start && o.createdAt < end;

// ---- Period helpers ------------------------------------------------------
export function periodBounds(daysBack: number) {
  const end = Date.now();
  const start = end - daysBack * DAY;
  const prevStart = start - daysBack * DAY;
  return { start, end, prevStart, prevEnd: start };
}

// A selectable analytics range. `from`/`to` are timestamps; "all" means no bound.
export type Range = { kind: "all" } | { kind: "window"; from: number; to: number };

export function filterByRange(orders: SalesOrder[], range: Range): SalesOrder[] {
  if (range.kind === "all") return orders;
  return orders.filter((o) => o.createdAt >= range.from && o.createdAt <= range.to);
}

// Sales growth for an explicit window vs the immediately preceding equal window.
export function growthBetween(orders: SalesOrder[], from: number, to: number) {
  const span = to - from;
  const cur = valid(orders).filter((o) => o.createdAt >= from && o.createdAt <= to).reduce((s, o) => s + o.total, 0);
  const prev = valid(orders)
    .filter((o) => o.createdAt >= from - span && o.createdAt < from)
    .reduce((s, o) => s + o.total, 0);
  if (prev === 0) return cur > 0 ? 100 : 0;
  return ((cur - prev) / prev) * 100;
}

// ---- Headline KPIs -------------------------------------------------------
export function totalSales(orders: SalesOrder[]) {
  return valid(orders).reduce((s, o) => s + o.total, 0);
}

export function grossProfit(orders: SalesOrder[]) {
  return valid(orders).reduce((s, o) => s + o.profit, 0);
}

// GMV counts ALL orders incl. cancelled/returned (gross merchandise pushed through).
export function gmv(orders: SalesOrder[]) {
  return orders.reduce((s, o) => s + o.total, 0);
}

export function ordersCount(orders: SalesOrder[]) {
  return valid(orders).length;
}

export function averageOrderValue(orders: SalesOrder[]) {
  const v = valid(orders);
  return v.length ? v.reduce((s, o) => s + o.total, 0) / v.length : 0;
}

// Sales growth %: current window vs the preceding equal window.
export function salesGrowth(orders: SalesOrder[], daysBack = 30) {
  const { start, end, prevStart, prevEnd } = periodBounds(daysBack);
  const cur = valid(orders).filter((o) => inWindow(o, start, end)).reduce((s, o) => s + o.total, 0);
  const prev = valid(orders).filter((o) => inWindow(o, prevStart, prevEnd)).reduce((s, o) => s + o.total, 0);
  if (prev === 0) return cur > 0 ? 100 : 0;
  return ((cur - prev) / prev) * 100;
}

// ---- Order quality -------------------------------------------------------
export function returnRate(orders: SalesOrder[]) {
  if (!orders.length) return 0;
  return (orders.filter((o) => o.status === "Returned").length / orders.length) * 100;
}

export function cancelledCount(orders: SalesOrder[]) {
  return orders.filter((o) => o.status === "Cancelled").length;
}

export function deliverySuccessRate(orders: SalesOrder[]) {
  const attempted = orders.filter((o) => !["Pending", "Placed", "Confirmed", "Processing", "Packed"].includes(o.status));
  if (!attempted.length) return 0;
  const delivered = orders.filter((o) => o.status === "Delivered").length;
  return (delivered / attempted.length) * 100;
}

// Average hours from order creation to delivery (only delivered orders w/ stamp).
export function avgFulfillmentHours(orders: SalesOrder[]) {
  const done = orders.filter((o) => o.deliveredAt);
  if (!done.length) return 0;
  const totalHrs = done.reduce((s, o) => s + (o.deliveredAt! - o.createdAt) / 3600000, 0);
  return totalHrs / done.length;
}

// ---- Channel split -------------------------------------------------------
export function channelSplit(orders: SalesOrder[]) {
  const v = valid(orders);
  const app = v.filter((o) => o.channel === "app");
  const manual = v.filter((o) => o.channel !== "app"); // phone, whatsapp, manual
  return [
    { name: "App", orders: app.length, revenue: app.reduce((s, o) => s + o.total, 0) },
    { name: "Manual", orders: manual.length, revenue: manual.reduce((s, o) => s + o.total, 0) },
  ];
}

// ---- Profit breakdowns ---------------------------------------------------
export function profitByProduct(orders: SalesOrder[], limit = 8) {
  const map = new Map<string, { name: string; profit: number }>();
  valid(orders).forEach((o) =>
    o.lines.forEach((l) => {
      const cur = map.get(l.productId) || { name: l.name, profit: 0 };
      cur.profit += (l.price - l.cost) * l.qty - l.discount;
      map.set(l.productId, cur);
    })
  );
  return [...map.values()].sort((a, b) => b.profit - a.profit).slice(0, limit);
}

export function profitBySalon(orders: SalesOrder[], limit = 8) {
  const map = new Map<string, { name: string; profit: number }>();
  valid(orders).forEach((o) => {
    const cur = map.get(o.salonId) || { name: o.salonName, profit: 0 };
    cur.profit += o.profit;
    map.set(o.salonId, cur);
  });
  return [...map.values()].sort((a, b) => b.profit - a.profit).slice(0, limit);
}

export function topCategories(orders: SalesOrder[], products: Product[], limit = 6) {
  const cat = new Map<string, string>(products.map((p) => [p.id, p.category]));
  const map = new Map<string, number>();
  valid(orders).forEach((o) =>
    o.lines.forEach((l) => {
      const c = cat.get(l.productId) ?? "Other";
      map.set(c, (map.get(c) || 0) + l.price * l.qty);
    })
  );
  return [...map.entries()].map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value).slice(0, limit);
}

// ---- Customer / salon health --------------------------------------------
const RECENT = 60; // a salon is "active" if it ordered within this many days
const CHURN = 90; // "churned" if last order older than this

export function salonStats(orders: SalesOrder[], salons: Salon[]) {
  const lastOrder = new Map<string, number>();
  const orderCount = new Map<string, number>();
  valid(orders).forEach((o) => {
    lastOrder.set(o.salonId, Math.max(lastOrder.get(o.salonId) || 0, o.createdAt));
    orderCount.set(o.salonId, (orderCount.get(o.salonId) || 0) + 1);
  });
  const now = Date.now();
  let active = 0,
    churned = 0,
    repeat = 0;
  salons.forEach((s) => {
    const last = lastOrder.get(s.id);
    const count = orderCount.get(s.id) || 0;
    if (count >= 2) repeat++;
    if (last && now - last <= RECENT * DAY) active++;
    else if (last && now - last > CHURN * DAY) churned++;
  });
  const withOrders = [...orderCount.keys()].length;
  return {
    active,
    churned,
    repeat,
    repeatRate: withOrders ? (repeat / withOrders) * 100 : 0,
  };
}

// New salons added per month (growth), last N months.
export function newSalonGrowth(salons: Salon[], months = 6) {
  const out: { label: string; count: number }[] = [];
  const now = new Date();
  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const start = d.getTime();
    const end = new Date(d.getFullYear(), d.getMonth() + 1, 1).getTime();
    out.push({
      label: d.toLocaleDateString("en-IN", { month: "short" }),
      count: salons.filter((s) => s.createdAt >= start && s.createdAt < end).length,
    });
  }
  return out;
}

// Monthly Active Salons: distinct salons that ordered in each of the last N months.
export function monthlyActiveSalons(orders: SalesOrder[], months = 6) {
  const out: { label: string; salons: number }[] = [];
  const now = new Date();
  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const start = d.getTime();
    const end = new Date(d.getFullYear(), d.getMonth() + 1, 1).getTime();
    const set = new Set(valid(orders).filter((o) => inWindow(o, start, end)).map((o) => o.salonId));
    out.push({ label: d.toLocaleDateString("en-IN", { month: "short" }), salons: set.size });
  }
  return out;
}

// Repeat revenue %: share of revenue from salons with 2+ valid orders.
export function repeatRevenuePct(orders: SalesOrder[]) {
  const v = valid(orders);
  const count = new Map<string, number>();
  v.forEach((o) => count.set(o.salonId, (count.get(o.salonId) || 0) + 1));
  const total = v.reduce((s, o) => s + o.total, 0);
  if (!total) return 0;
  const repeatRev = v.filter((o) => (count.get(o.salonId) || 0) >= 2).reduce((s, o) => s + o.total, 0);
  return (repeatRev / total) * 100;
}

// ---- Region & payments ---------------------------------------------------
export function regionSales(orders: SalesOrder[], salons: Salon[]) {
  const region = new Map<string, string>(salons.map((s) => [s.id, s.region || "Unspecified"]));
  const map = new Map<string, number>();
  valid(orders).forEach((o) => {
    const r = region.get(o.salonId) ?? "Unspecified";
    map.set(r, (map.get(r) || 0) + o.total);
  });
  return [...map.entries()].map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
}

export function paymentSplit(orders: SalesOrder[]) {
  const v = valid(orders);
  const paid = v.filter((o) => o.paymentStatus === "Paid");
  const credit = v.filter((o) => o.paymentStatus !== "Paid"); // Unpaid + Partial
  return {
    paidRevenue: paid.reduce((s, o) => s + o.total, 0),
    creditRevenue: credit.reduce((s, o) => s + o.total, 0),
    paidCount: paid.length,
    creditCount: credit.length,
  };
}

export function outstandingTotal(salons: Salon[]) {
  return salons.reduce((s, x) => s + x.outstanding, 0);
}

// Cash-flow trend: paid revenue collected per month (proxy for inflow).
export function cashFlowTrend(orders: SalesOrder[], months = 6) {
  const out: { label: string; inflow: number }[] = [];
  const now = new Date();
  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const start = d.getTime();
    const end = new Date(d.getFullYear(), d.getMonth() + 1, 1).getTime();
    const inflow = valid(orders)
      .filter((o) => o.paymentStatus === "Paid" && inWindow(o, start, end))
      .reduce((s, o) => s + o.total, 0);
    out.push({ label: d.toLocaleDateString("en-IN", { month: "short" }), inflow });
  }
  return out;
}

// ---- BI salon report export rows ----------------------------------------
export type SalonExportMetric = "Revenue" | "Profit";
export interface SalonExportRow {
  "Sr No": number;
  "Salon Name": string;
  "Branch No": string;
  City: string;
  Address: string;
  Revenue?: number;
  Profit?: number;
}

// Build per-salon rows (revenue or profit) for Excel/CSV/PDF export.
// Pulls Branch No / City / Address from the salon master; "-" when missing.
export function buildSalonExportRows(
  orders: SalesOrder[],
  salons: Salon[],
  metric: SalonExportMetric
): SalonExportRow[] {
  const salonById = new Map<string, Salon>(salons.map((s) => [s.id, s]));
  const grouped = new Map<string, { salonId: string; salonName: string; revenue: number; profit: number }>();

  valid(orders).forEach((o) => {
    const key = o.salonId || o.salonName;
    const cur = grouped.get(key) || { salonId: o.salonId, salonName: o.salonName, revenue: 0, profit: 0 };
    cur.revenue += o.total;
    cur.profit += o.profit;
    if (!cur.salonName && o.salonName) cur.salonName = o.salonName;
    grouped.set(key, cur);
  });

  const rows = [...grouped.values()]
    .map((g) => {
      const salon = salonById.get(g.salonId);
      return {
        salonName: salon?.name || g.salonName || "Unknown Salon",
        branchNo: salon?.branchNo?.trim() ? salon.branchNo : "-",
        city: salon?.region?.trim() ? salon.region : "-",
        address: salon?.address?.trim() ? salon.address : "-",
        metricValue: metric === "Revenue" ? g.revenue : g.profit,
      };
    })
    .sort((a, b) => b.metricValue - a.metricValue);

  return rows.map((r, idx) => ({
    "Sr No": idx + 1,
    "Salon Name": r.salonName,
    "Branch No": r.branchNo,
    City: r.city,
    Address: r.address,
    [metric]: Number(r.metricValue.toFixed(2)),
  }));
}
