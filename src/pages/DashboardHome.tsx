import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Package, IndianRupee, AlertTriangle, XCircle, TrendingUp, Calendar,
  ShoppingCart, Plus, Truck, FileDown, ClipboardList, Users,
} from "lucide-react";
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Line, LineChart,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { Card, StatCard, Button, PageHeader } from "@/components/ui/primitives";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { useDataStore } from "@/store/dataStore";
import { inr, num, fmtDate, exportCsv, daysAgo } from "@/lib/utils";
import {
  available, invValue, isLow, isOut, salesByDay, salesByMonth,
  topProducts, salonsRanked, movementByDay,
} from "@/lib/calc";

const palette = ["#0f172a", "#6366f1", "#10b981", "#f59e0b", "#f43f5e"];

function ChartCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Card className="p-5">
      <h3 className="mb-4 text-sm font-semibold text-slate-900 dark:text-white">{title}</h3>
      <div className="h-56">
        <ResponsiveContainer width="100%" height="100%">{children as React.ReactElement}</ResponsiveContainer>
      </div>
    </Card>
  );
}

const tip = {
  contentStyle: { borderRadius: 10, border: "1px solid #e2e8f0", fontSize: 12 },
};

export default function DashboardHome() {
  const navigate = useNavigate();
  const { products: invProducts, salesOrders: invSalesOrders, stockMovements, purchaseOrders } = useDataStore();
  const adminProducts = useDataStore((s: any) => s.adminProducts || []);
  const adminOrders = useDataStore((s: any) => s.adminOrders || []);

  // Merge inventory + admin products (inventory takes precedence by id)
  const products = useMemo(() => {
    const map = new Map<string, any>();
    adminProducts.forEach((p: any) => map.set(p.id, p));
    invProducts.forEach((p: any) => map.set(p.id, p));
    return Array.from(map.values());
  }, [invProducts, adminProducts]);

  // Normalize admin order timestamp to ms
  const toMs = (ts: any): number => {
    if (!ts) return 0;
    if (typeof ts?.toDate === "function") return ts.toDate().getTime();
    if (ts instanceof Date) return ts.getTime();
    if (typeof ts === "number") return ts;
    const p = new Date(ts as string);
    return Number.isNaN(p.getTime()) ? 0 : p.getTime();
  };

  // Merge inventory salesOrders + adminOrders
  const salesOrders = useMemo(() => {
    const map = new Map<string, any>();
    invSalesOrders.forEach((o: any) => map.set(o.id, o));
    adminOrders.forEach((o: any) => {
      if (!map.has(o.id)) {
        const rawItems = Array.isArray(o.items) ? o.items : Array.isArray(o.lines) ? o.lines : [];
        map.set(o.id, {
          ...o,
          // normalize lines so calc functions (topProducts etc.) work
          lines: rawItems.map((item: any) => ({
            productId: item.productId || item.id || "",
            name: item.name || item.title || item.productName || "",
            sku: item.sku || item.productId || "",
            qty: Number(item.quantity ?? item.qty ?? 1) || 1,
            price: Number(item.price ?? item.unitPrice ?? 0),
            cost: Number(item.cost ?? 0),
            gstRate: Number(item.gstRate ?? 0),
            discount: Number(item.discount ?? 0),
          })),
          total: Number(o.total ?? o.amount ?? o.totalAmount ?? o.grandTotal ?? o.payableAmount ?? 0),
          profit: Number(o.profit ?? 0),
          createdAt: toMs(o.createdAt || o.orderDate || o.date),
          status: o.status || o.orderStatus || "Pending",
          salonId: o.salonId || o.customerId || o.userId || o.uid || "",
          salonName: o.salonName || o.contactDetails?.receiverName || o.customerName || o.customer?.name || "",
        });
      }
    });
    return Array.from(map.values());
  }, [invSalesOrders, adminOrders]);

  const m = useMemo(() => {
    const active = products.filter((p) => p.status === "active");
    const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).getTime();
    const todayStart = new Date().setHours(0, 0, 0, 0);
    const valid = salesOrders.filter((o) => o.status !== "Cancelled");
    return {
      totalProducts: active.length,
      invValue: active.reduce((s, p) => s + invValue(p), 0),
      low: active.filter((p) => isLow(p) && available(p) > 0).length,
      out: active.filter((p) => isOut(p)).length,
      todaySales: valid.filter((o) => o.createdAt >= todayStart).reduce((s, o) => s + o.total, 0),
      monthRevenue: valid.filter((o) => o.createdAt >= monthStart).reduce((s, o) => s + o.total, 0),
      monthProfit: valid.filter((o) => o.createdAt >= monthStart).reduce((s, o) => s + o.profit, 0),
      pending: salesOrders.filter((o) => o.status === "Pending" || o.status === "Packed").length,
    };
  }, [products, salesOrders]);

  const weekly = salesByDay(salesOrders, 7);
  const monthly = salesByMonth(salesOrders, 6);
  const [minUnits, setMinUnits] = useState(0);
  const top = topProducts(salesOrders, 100).filter((p) => p.qty >= minUnits).slice(0, 8);
  const [salonBy, setSalonBy] = useState<"revenue" | "profit">("revenue");
  const [minSalon, setMinSalon] = useState(0);
  const salons = salonsRanked(salesOrders, {
    by: salonBy,
    minRevenue: salonBy === "revenue" ? minSalon : 0,
    minProfit: salonBy === "profit" ? minSalon : 0,
    limit: 6,
  });
  const movement = movementByDay(stockMovements, 7);
  const lowItems = products.filter((p) => isLow(p)).slice(0, 6);
  const recentOrders = [...salesOrders].sort((a, b) => b.createdAt - a.createdAt).slice(0, 5);
  const recentMoves = [...stockMovements].sort((a, b) => b.createdAt - a.createdAt).slice(0, 5);
  const recentPO = [...purchaseOrders].sort((a, b) => b.createdAt - a.createdAt).slice(0, 4);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Inventory Dashboard"
        subtitle="Live snapshot of stock, sales and profit."
        actions={
          <>
            <Button variant="secondary" onClick={() => navigate("/products")}><Plus className="h-4 w-4" /> Product</Button>
            <Button variant="secondary" onClick={() => navigate("/new-order")}><ClipboardList className="h-4 w-4" /> Manual Order</Button>
            <Button variant="secondary" onClick={() => navigate("/vendors")}><Users className="h-4 w-4" /> Vendor</Button>
            <Button variant="secondary" onClick={() => navigate("/purchase-orders")}><Truck className="h-4 w-4" /> Purchase Order</Button>
            <Button onClick={() => exportCsv(salesOrders.map((o) => ({ orderNo: o.orderNo, salon: o.salonName, total: o.total, profit: o.profit, status: o.status, date: fmtDate(o.createdAt) })), "sales-report")}>
              <FileDown className="h-4 w-4" /> Export
            </Button>
          </>
        }
      />

      {/* Metric cards */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard icon={Package} label="Total Products" value={num(m.totalProducts)} accent="bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200" />
        <StatCard icon={IndianRupee} label="Inventory Value" value={inr(m.invValue)} sub="at cost" accent="bg-indigo-50 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300" />
        <StatCard icon={AlertTriangle} label="Low Stock" value={num(m.low)} accent="bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300" />
        <StatCard icon={XCircle} label="Out of Stock" value={num(m.out)} accent="bg-rose-50 text-rose-700 dark:bg-rose-950 dark:text-rose-300" />
        <StatCard icon={ShoppingCart} label="Today's Sales" value={inr(m.todaySales)} accent="bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300" />
        <StatCard icon={Calendar} label="Monthly Revenue" value={inr(m.monthRevenue)} accent="bg-violet-50 text-violet-700 dark:bg-violet-950 dark:text-violet-300" />
        <StatCard icon={TrendingUp} label="Monthly Profit" value={inr(m.monthProfit)} accent="bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300" />
        <StatCard icon={ClipboardList} label="Pending Orders" value={num(m.pending)} accent="bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300" />
      </div>

      {/* Charts row 1 */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <ChartCard title="Weekly Sales">
          <BarChart data={weekly}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
            <XAxis dataKey="label" tick={{ fontSize: 11, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 11, fill: "#94a3b8" }} axisLine={false} tickLine={false} width={40} />
            <Tooltip {...tip} formatter={(v: number) => inr(v)} />
            <Bar dataKey="sales" fill="#6366f1" radius={[6, 6, 0, 0]} />
          </BarChart>
        </ChartCard>
        <ChartCard title="Monthly Profit Trend">
          <LineChart data={monthly}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
            <XAxis dataKey="label" tick={{ fontSize: 11, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 11, fill: "#94a3b8" }} axisLine={false} tickLine={false} width={40} />
            <Tooltip {...tip} formatter={(v: number) => inr(v)} />
            <Line type="monotone" dataKey="profit" stroke="#10b981" strokeWidth={2.5} dot={{ r: 3 }} />
          </LineChart>
        </ChartCard>
      </div>

      {/* Charts row 2 */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card className="p-5">
          <div className="mb-4 flex items-center justify-between gap-2">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-white">Top Selling Products</h3>
            <label className="flex items-center gap-1.5 text-xs text-slate-500">
              min units
              <input
                type="number"
                min={0}
                value={minUnits}
                onChange={(e) => setMinUnits(Math.max(0, Number(e.target.value)))}
                className="w-16 rounded-md border border-slate-200 px-2 py-1 text-right tabular-nums outline-none focus:border-slate-400 dark:border-slate-700 dark:bg-slate-800"
              />
            </label>
          </div>
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              {top.length ? (
                <BarChart data={top} layout="vertical" margin={{ left: 6, right: 12 }}>
                  <XAxis type="number" hide />
                  <YAxis type="category" dataKey="name" width={120} tick={{ fontSize: 10, fill: "#475569" }} axisLine={false} tickLine={false} />
                  <Tooltip {...tip} formatter={(v: number) => `${v} units`} />
                  <Bar dataKey="qty" radius={[0, 6, 6, 0]} barSize={16}>
                    {top.map((_, i) => <Cell key={i} fill={palette[i % palette.length]} />)}
                  </Bar>
                </BarChart>
              ) : (
                <div className="grid h-full place-items-center text-sm text-slate-400">No products sold ≥ {minUnits} units</div>
              )}
            </ResponsiveContainer>
          </div>
        </Card>
        <Card className="p-5">
          <div className="mb-4 flex items-center justify-between gap-2">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-white">Top Salon Customers</h3>
            <div className="flex items-center gap-2">
              <select value={salonBy} onChange={(e) => setSalonBy(e.target.value as "revenue" | "profit")} className="rounded-md border border-slate-200 px-2 py-1 text-xs outline-none dark:border-slate-700 dark:bg-slate-800">
                <option value="revenue">Revenue</option>
                <option value="profit">Profit</option>
              </select>
              <label className="flex items-center gap-1 text-xs text-slate-500">
                min ₹
                <input type="number" min={0} value={minSalon} onChange={(e) => setMinSalon(Math.max(0, Number(e.target.value)))} className="w-20 rounded-md border border-slate-200 px-2 py-1 text-right tabular-nums outline-none dark:border-slate-700 dark:bg-slate-800" />
              </label>
            </div>
          </div>
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              {salons.length ? (
                <BarChart data={salons} layout="vertical" margin={{ left: 6, right: 12 }}>
                  <XAxis type="number" hide />
                  <YAxis type="category" dataKey="name" width={120} tick={{ fontSize: 10, fill: "#475569" }} axisLine={false} tickLine={false} />
                  <Tooltip {...tip} formatter={(v: number) => inr(v)} />
                  <Bar dataKey={salonBy} radius={[0, 6, 6, 0]} barSize={16}>
                    {salons.map((_, i) => <Cell key={i} fill={palette[(i + 1) % palette.length]} />)}
                  </Bar>
                </BarChart>
              ) : (
                <div className="grid h-full place-items-center text-sm text-slate-400">No salons above ₹{minSalon} {salonBy}</div>
              )}
            </ResponsiveContainer>
          </div>
        </Card>
        <ChartCard title="Inventory Movement (7d)">
          <AreaChart data={movement}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
            <XAxis dataKey="label" tick={{ fontSize: 11, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 11, fill: "#94a3b8" }} axisLine={false} tickLine={false} width={32} />
            <Tooltip {...tip} />
            <Area type="monotone" dataKey="in" stackId="1" stroke="#10b981" fill="#10b98133" />
            <Area type="monotone" dataKey="out" stackId="2" stroke="#f43f5e" fill="#f43f5e33" />
          </AreaChart>
        </ChartCard>
      </div>

      {/* Tables */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card className="p-5">
          <h3 className="mb-3 text-sm font-semibold text-slate-900 dark:text-white">Recent Orders</h3>
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {recentOrders.map((o) => (
              <div key={o.id} className="flex items-center gap-3 py-2.5 text-sm">
                <span className="w-20 font-medium text-slate-900 dark:text-white">{o.orderNo}</span>
                <span className="min-w-0 flex-1 truncate text-slate-600 dark:text-slate-300">{o.salonName}</span>
                <span className="font-semibold tabular-nums text-slate-900 dark:text-white">{inr(o.total)}</span>
                <StatusBadge value={o.status} />
              </div>
            ))}
          </div>
        </Card>

        <Card className="p-5">
          <h3 className="mb-3 text-sm font-semibold text-slate-900 dark:text-white">Recent Stock Changes</h3>
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {recentMoves.map((mv) => (
              <div key={mv.id} className="flex items-center gap-3 py-2.5 text-sm">
                <StatusBadge value={mv.type} />
                <span className="min-w-0 flex-1 truncate text-slate-600 dark:text-slate-300">{mv.productName}</span>
                <span className={`font-semibold tabular-nums ${mv.qty >= 0 ? "text-emerald-600" : "text-rose-600"}`}>
                  {mv.qty > 0 ? "+" : ""}{mv.qty}
                </span>
              </div>
            ))}
          </div>
        </Card>

        <Card className="p-5">
          <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-white">
            <AlertTriangle className="h-4 w-4 text-rose-500" /> Low Stock Items
          </h3>
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {lowItems.map((p) => (
              <div key={p.id} className="flex items-center gap-3 py-2.5 text-sm">
                <span className="min-w-0 flex-1 truncate text-slate-700 dark:text-slate-200">{p.name}</span>
                <span className="text-xs text-slate-400">reorder {p.reorderLevel}</span>
                <span className="font-bold tabular-nums text-rose-600">{available(p)}</span>
              </div>
            ))}
            {!lowItems.length && <p className="py-3 text-sm text-slate-400">All items above reorder level.</p>}
          </div>
        </Card>

        <Card className="p-5">
          <h3 className="mb-3 text-sm font-semibold text-slate-900 dark:text-white">Recent Purchases</h3>
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {recentPO.map((po) => (
              <div key={po.id} className="flex items-center gap-3 py-2.5 text-sm">
                <span className="w-20 font-medium text-slate-900 dark:text-white">{po.poNo}</span>
                <span className="min-w-0 flex-1 truncate text-slate-600 dark:text-slate-300">{po.vendorName}</span>
                <span className="font-semibold tabular-nums text-slate-900 dark:text-white">{inr(po.total)}</span>
                <StatusBadge value={po.status} />
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}
