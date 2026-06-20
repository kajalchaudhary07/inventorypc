import type { OrderLine, Product, SalesOrder, StockMovement } from "@/types";

export const available = (p: Product) => p.stock - p.reserved;
export const margin = (p: Product) =>
  p.sellingPrice > 0 ? ((p.sellingPrice - p.costPrice) / p.sellingPrice) * 100 : 0;
export const profitPerUnit = (p: Product) => p.sellingPrice - p.costPrice;
export const invValue = (p: Product) => p.stock * p.costPrice;
export const isLow = (p: Product) => p.reorderLevel > 0 && available(p) <= p.reorderLevel;
export const isOut = (p: Product) => available(p) <= 0;

// ---- Order line / order totals (GST-inclusive style, India) -------------
export function lineNet(l: OrderLine) {
  return l.price * l.qty - l.discount;
}
export function lineGst(l: OrderLine) {
  return (lineNet(l) * l.gstRate) / 100;
}
export function lineProfit(l: OrderLine) {
  return (l.price - l.cost) * l.qty - l.discount;
}
export function orderTotals(lines: OrderLine[], extraCharges: { amount: number }[] = []) {
  const subtotal = lines.reduce((s, l) => s + l.price * l.qty, 0);
  const discountTotal = lines.reduce((s, l) => s + l.discount, 0);
  const gstTotal = lines.reduce((s, l) => s + lineGst(l), 0);
  const profit = lines.reduce((s, l) => s + lineProfit(l), 0);
  const extraChargesTotal = extraCharges.reduce((s, c) => s + (Number(c.amount) || 0), 0);
  const total = subtotal - discountTotal + gstTotal + extraChargesTotal;
  return { subtotal, discountTotal, gstTotal, profit, extraChargesTotal, total };
}

// ---- Analytics aggregations --------------------------------------------
export function salesByDay(orders: SalesOrder[], days = 7) {
  const out: { label: string; sales: number; profit: number }[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - i);
    const start = d.getTime();
    const end = start + 86400000;
    const dayOrders = orders.filter(
      (o) => o.createdAt >= start && o.createdAt < end && o.status !== "Cancelled"
    );
    out.push({
      label: d.toLocaleDateString("en-IN", { weekday: "short" }),
      sales: dayOrders.reduce((s, o) => s + o.total, 0),
      profit: dayOrders.reduce((s, o) => s + o.profit, 0),
    });
  }
  return out;
}

export function salesByMonth(orders: SalesOrder[], months = 6) {
  const out: { label: string; sales: number; profit: number }[] = [];
  const now = new Date();
  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const start = d.getTime();
    const end = new Date(d.getFullYear(), d.getMonth() + 1, 1).getTime();
    const mo = orders.filter(
      (o) => o.createdAt >= start && o.createdAt < end && o.status !== "Cancelled"
    );
    out.push({
      label: d.toLocaleDateString("en-IN", { month: "short" }),
      sales: mo.reduce((s, o) => s + o.total, 0),
      profit: mo.reduce((s, o) => s + o.profit, 0),
    });
  }
  return out;
}

export function topProducts(orders: SalesOrder[], limit = 5) {
  const map = new Map<string, { name: string; qty: number; revenue: number }>();
  orders
    .filter((o) => o.status !== "Cancelled")
    .forEach((o) =>
      (o.lines || []).forEach((l) => {
        const cur = map.get(l.productId) || { name: l.name, qty: 0, revenue: 0 };
        cur.qty += l.qty;
        cur.revenue += l.price * l.qty;
        map.set(l.productId, cur);
      })
    );
  return [...map.values()].sort((a, b) => b.qty - a.qty).slice(0, limit);
}

export function topSalons(orders: SalesOrder[], limit = 5) {
  const map = new Map<string, { name: string; revenue: number }>();
  orders
    .filter((o) => o.status !== "Cancelled")
    .forEach((o) => {
      const cur = map.get(o.salonId) || { name: o.salonName, revenue: 0 };
      cur.revenue += o.total;
      map.set(o.salonId, cur);
    });
  return [...map.values()].sort((a, b) => b.revenue - a.revenue).slice(0, limit);
}

// Per-salon revenue AND profit, with optional min thresholds, sorted by a chosen
// metric. Used by the dashboard Top Salon Customers card.
export function salonsRanked(
  orders: SalesOrder[],
  opts: { by: "revenue" | "profit"; minRevenue?: number; minProfit?: number; limit?: number } = { by: "revenue" }
) {
  const { by, minRevenue = 0, minProfit = 0, limit = 5 } = opts;
  const map = new Map<string, { name: string; revenue: number; profit: number }>();
  orders
    .filter((o) => o.status !== "Cancelled")
    .forEach((o) => {
      const cur = map.get(o.salonId) || { name: o.salonName, revenue: 0, profit: 0 };
      cur.revenue += o.total;
      cur.profit += o.profit;
      map.set(o.salonId, cur);
    });
  return [...map.values()]
    .filter((s) => s.revenue >= minRevenue && s.profit >= minProfit)
    .sort((a, b) => (by === "profit" ? b.profit - a.profit : b.revenue - a.revenue))
    .slice(0, limit);
}

export function movementByDay(moves: StockMovement[], days = 7) {
  const out: { label: string; in: number; out: number }[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - i);
    const start = d.getTime();
    const end = start + 86400000;
    const dayMoves = moves.filter((m) => m.createdAt >= start && m.createdAt < end);
    out.push({
      label: d.toLocaleDateString("en-IN", { weekday: "short" }),
      in: dayMoves.filter((m) => m.qty > 0).reduce((s, m) => s + m.qty, 0),
      out: dayMoves.filter((m) => m.qty < 0).reduce((s, m) => s + Math.abs(m.qty), 0),
    });
  }
  return out;
}

// Fast / slow / dead stock classification from sales velocity
export function stockVelocity(products: Product[], orders: SalesOrder[]) {
  const sold = new Map<string, number>();
  orders
    .filter((o) => o.status !== "Cancelled" && o.createdAt >= Date.now() - 30 * 86400000)
    .forEach((o) => (o.lines || []).forEach((l) => sold.set(l.productId, (sold.get(l.productId) || 0) + l.qty)));
  return products.map((p) => {
    const q = sold.get(p.id) || 0;
    let band: "fast" | "slow" | "dead" = "dead";
    if (q >= 20) band = "fast";
    else if (q > 0) band = "slow";
    return { product: p, sold: q, band };
  });
}
