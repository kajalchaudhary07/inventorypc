import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Package, IndianRupee, AlertTriangle, XCircle, TrendingUp, Calendar,
  ShoppingCart, Plus, Truck, FileDown, ClipboardList, Users
} from "lucide-react";
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Line, LineChart,
  ResponsiveContainer, Tooltip, XAxis, YAxis
} from "recharts";
import { Card, StatCard, Button, PageHeader, Input, Badge } from "@/components/ui/primitives";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { Modal } from "@/components/ui/Modal";
import { useDataStore } from "@/store/dataStore";
import { inr, num, fmtDate, exportCsv, daysAgo } from "@/lib/utils";
import {
  available, invValue, isLow, isOut, salesByDay, salesByMonth,
  topProducts, salonsRanked, movementByDay
} from "@/lib/calc";
import { getMergedProducts } from "@/services/productOverrides";
import { mergeOrders } from "@/services/orderMerger";

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
  const { products: rawInvProducts, salesOrders: rawInvSalesOrders, stockMovements, purchaseOrders: rawPurchaseOrders, salons: rawSalons } = useDataStore();
  const rawAdminProducts = useDataStore((s: any) => s.adminProducts || []);
  const rawInventoryProducts = useDataStore((s: any) => s.inventoryProducts || []);
  const rawAdminOrders = useDataStore((s: any) => s.adminOrders || []);
  const rawAdminCustomers = useDataStore((s: any) => s.adminCustomers || []);

  const invProducts = useMemo(() => rawInvProducts.filter((p: any) => p.isDeleted !== true), [rawInvProducts]);
  const adminProducts = useMemo(() => rawAdminProducts.filter((p: any) => p.isDeleted !== true), [rawAdminProducts]);
  const inventoryProducts = useMemo(() => rawInventoryProducts.filter((p: any) => p.isDeleted !== true), [rawInventoryProducts]);
  const adminOrders = useMemo(() => rawAdminOrders.filter((o: any) => o.isDeleted !== true), [rawAdminOrders]);
  const dbSalons = useMemo(() => rawSalons.filter((s: any) => s.isDeleted !== true), [rawSalons]);
  const adminCustomers = useMemo(() => rawAdminCustomers.filter((c: any) => c.isDeleted !== true), [rawAdminCustomers]);
  const purchaseOrders = useMemo(() => rawPurchaseOrders.filter((po: any) => po.isDeleted !== true), [rawPurchaseOrders]);

  const [showValuationModal, setShowValuationModal] = useState(false);
  const [showMonthlyOrdersModal, setShowMonthlyOrdersModal] = useState(false);
  const [showTopProductsModal, setShowTopProductsModal] = useState(false);
  const [searchValuation, setSearchValuation] = useState("");
  const [searchOrders, setSearchOrders] = useState("");
  const [searchTopProducts, setSearchTopProducts] = useState("");

  const mergedAdminProducts = useMemo(() => getMergedProducts(adminProducts), [adminProducts]);

  // Merge inventory + admin products (inventory/manual takes precedence by id)
  const products = useMemo(() => {
    const map = new Map<string, any>();
    invProducts.forEach((p: any) => map.set(p.id, p));
    mergedAdminProducts.forEach((p: any) => map.set(p.id, p));
    inventoryProducts.forEach((p: any) => map.set(p.id, p));
    return Array.from(map.values()).map((p) => ({
      ...p,
      stock: Number(p.stock ?? 0),
      reserved: Number(p.reserved ?? 0),
      costPrice: Number(p.costPrice ?? p.cost ?? 0),
      sellingPrice: Number(p.sellingPrice ?? p.price ?? 0),
      reorderLevel: Number(p.reorderLevel ?? p.reorderTriggerValue ?? 10),
      status: p.status || "active",
    }));
  }, [invProducts, mergedAdminProducts, inventoryProducts]);

  // Merge inventory salesOrders + adminOrders using the orderMerger service.
  const salesOrders = useMemo(() => {
    return mergeOrders(adminOrders, rawInvSalesOrders, dbSalons, adminCustomers);
  }, [adminOrders, rawInvSalesOrders, dbSalons, adminCustomers]);

  const activeProducts = useMemo(() => {
    return products
      .filter((p) => p.status === "active")
      .map((p) => ({
        ...p,
        totalVal: p.stock * p.costPrice,
      }))
      .filter((p) => {
        const q = searchValuation.trim().toLowerCase();
        const name = (p.name || "").toLowerCase();
        const sku = (p.sku || "").toLowerCase();
        const category = (p.category || "").toLowerCase();
        return name.includes(q) || sku.includes(q) || category.includes(q);
      })
      .sort((a, b) => b.totalVal - a.totalVal);
  }, [products, searchValuation]);

  const monthStart = useMemo(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1).getTime(), []);

  const monthlyOrdersFiltered = useMemo(() => {
    return salesOrders
      .filter((o) => o.createdAt >= monthStart && o.status !== "Cancelled")
      .filter((o) => {
        const q = searchOrders.trim().toLowerCase();
        const orderNo = (o.orderNo || "").toLowerCase();
        const salonName = (o.salonName || "").toLowerCase();
        return orderNo.includes(q) || salonName.includes(q);
      })
      .sort((a, b) => b.createdAt - a.createdAt);
  }, [salesOrders, monthStart, searchOrders]);

  const topProductsByChannel = useMemo(() => {
    const map = new Map<string, {
      id: string;
      name: string;
      appQty: number;
      manualQty: number;
      whatsappQty: number;
      phoneQty: number;
      totalQty: number;
      totalValue: number;
    }>();

    // Sum quantities and value by channel
    salesOrders
      .filter((o) => o.status !== "Cancelled")
      .forEach((o) => {
        const channel = (o.channel || "app").toLowerCase();
        (o.lines || []).forEach((l: any) => {
          const cur = map.get(l.productId) || {
            id: l.productId,
            name: l.name,
            appQty: 0,
            manualQty: 0,
            whatsappQty: 0,
            phoneQty: 0,
            totalQty: 0,
            totalValue: 0,
          };
          
          const lineQty = Number(l.qty) || 0;
          const lineVal = lineQty * (Number(l.price) || 0) - (Number(l.discount) || 0);

          if (channel === "app") cur.appQty += lineQty;
          else if (channel === "manual") cur.manualQty += lineQty;
          else if (channel === "whatsapp") cur.whatsappQty += lineQty;
          else if (channel === "phone") cur.phoneQty += lineQty;
          else cur.appQty += lineQty;

          cur.totalQty += lineQty;
          cur.totalValue += lineVal;
          map.set(l.productId, cur);
        });
      });

    return Array.from(map.values())
      .sort((a, b) => b.totalValue - a.totalValue);
  }, [salesOrders]);

  const filteredTopProducts = useMemo(() => {
    return topProductsByChannel.filter((p) => {
      const q = searchTopProducts.trim().toLowerCase();
      return p.name.toLowerCase().includes(q);
    });
  }, [topProductsByChannel, searchTopProducts]);

  const m = useMemo(() => {
    const active = products.filter((p) => p.status !== "archived");
    const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).getTime();
    const todayStart = new Date().setHours(0, 0, 0, 0);
    const valid = salesOrders.filter((o) => o.status !== "Cancelled");
    return {
      totalProducts: active.length,
      invValue: active.reduce((s, p) => s + invValue(p), 0),
      low: active.filter((p) => isLow(p)).length,
      out: active.filter((p) => isOut(p)).length,
      todaySales: valid.filter((o) => o.createdAt >= todayStart).reduce((s, o) => s + o.total, 0),
      monthRevenue: valid.filter((o) => o.createdAt >= monthStart).reduce((s, o) => s + o.total, 0),
      monthProfit: valid.filter((o) => o.createdAt >= monthStart).reduce((s, o) => s + o.profit, 0),
      pending: salesOrders.filter((o) => !["Delivered", "Cancelled", "Returned"].includes(o.status)).length,
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
  const lowItems = products.filter((p) => p.status !== "archived" && isLow(p)).slice(0, 6);
  const recentPO = [...purchaseOrders].sort((a, b) => b.createdAt - a.createdAt).slice(0, 4);
  const recentOrders = [...salesOrders].sort((a, b) => b.createdAt - a.createdAt).slice(0, 5);
  const recentMoves = [...stockMovements].sort((a, b) => b.createdAt - a.createdAt).slice(0, 5);

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
        
        <button
          onClick={() => setShowValuationModal(true)}
          className="text-left w-full block transition-all hover:scale-[1.02] hover:shadow-md rounded-xl outline-none focus:ring-2 focus:ring-indigo-500"
        >
          <StatCard icon={IndianRupee} label="Inventory Value ⓘ" value={inr(m.invValue)} sub="at cost (click to break down)" accent="bg-indigo-50 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300" />
        </button>

        <StatCard icon={AlertTriangle} label="Low Stock" value={num(m.low)} accent="bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300" />
        <StatCard icon={XCircle} label="Out of Stock" value={num(m.out)} accent="bg-rose-50 text-rose-700 dark:bg-rose-950 dark:text-rose-300" />
        <StatCard icon={ShoppingCart} label="Today's Sales" value={inr(m.todaySales)} accent="bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300" />
        
        <button
          onClick={() => setShowMonthlyOrdersModal(true)}
          className="text-left w-full block transition-all hover:scale-[1.02] hover:shadow-md rounded-xl outline-none focus:ring-2 focus:ring-violet-500"
        >
          <StatCard icon={Calendar} label="Monthly Revenue ⓘ" value={inr(m.monthRevenue)} sub="this month (click to break down)" accent="bg-violet-50 text-violet-700 dark:bg-violet-950 dark:text-violet-300" />
        </button>

        <button
          onClick={() => setShowMonthlyOrdersModal(true)}
          className="text-left w-full block transition-all hover:scale-[1.02] hover:shadow-md rounded-xl outline-none focus:ring-2 focus:ring-emerald-500"
        >
          <StatCard icon={TrendingUp} label="Monthly Profit ⓘ" value={inr(m.monthProfit)} sub="estimated (click to break down)" accent="bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300" />
        </button>

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

        {/* Top Purchased Products section */}
        <Card className="p-5 lg:col-span-2">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold text-slate-900 dark:text-white">Top Purchased Products</h3>
              <p className="text-xs text-slate-400">Sold across App, Phone, WhatsApp, and Manual channels (ordered by sales value)</p>
            </div>
            <Button variant="secondary" onClick={() => setShowTopProductsModal(true)}>
              View All
            </Button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-200 pb-2 uppercase text-slate-400 dark:border-slate-800">
                  <th className="py-2 text-left">Product Name</th>
                  <th className="py-2 text-center">App</th>
                  <th className="py-2 text-center">Manual</th>
                  <th className="py-2 text-center">WhatsApp</th>
                  <th className="py-2 text-center">Phone</th>
                  <th className="py-2 text-center font-semibold">Total Qty</th>
                  <th className="py-2 text-right font-semibold">Purchase Value</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {topProductsByChannel.slice(0, 5).map((p) => (
                  <tr key={p.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                    <td className="py-2.5 font-medium text-slate-900 dark:text-white">{p.name}</td>
                    <td className="py-2.5 text-center tabular-nums">{p.appQty}</td>
                    <td className="py-2.5 text-center tabular-nums">{p.manualQty}</td>
                    <td className="py-2.5 text-center tabular-nums">{p.whatsappQty}</td>
                    <td className="py-2.5 text-center tabular-nums">{p.phoneQty}</td>
                    <td className="py-2.5 text-center tabular-nums font-semibold">{p.totalQty}</td>
                    <td className="py-2.5 text-right tabular-nums font-bold text-indigo-600 dark:text-indigo-400">{inr(p.totalValue)}</td>
                  </tr>
                ))}
                {!topProductsByChannel.length && (
                  <tr>
                    <td colSpan={7} className="py-8 text-center text-slate-400">No product purchases recorded.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>
      </div>

      {/* Inventory Valuation Breakdown Modal */}
      <Modal
        open={showValuationModal}
        onClose={() => setShowValuationModal(false)}
        title="Inventory Value Breakdown"
        wide
        footer={
          <div className="flex w-full items-center justify-between text-sm">
            <span>Total Products listed: <b>{activeProducts.length}</b></span>
            <span>Total Valuation: <b className="text-lg text-indigo-700 dark:text-indigo-300 font-bold">{inr(m.invValue)}</b></span>
          </div>
        }
      >
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <Input
              value={searchValuation}
              onChange={(e) => setSearchValuation(e.target.value)}
              placeholder="Search products by name, SKU or category..."
              className="flex-1"
            />
            {searchValuation && (
              <Button variant="ghost" onClick={() => setSearchValuation("")} className="py-1">Clear</Button>
            )}
          </div>
          <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-800 max-h-[50vh]">
            <table className="w-full text-left text-xs">
              <thead className="sticky top-0 bg-slate-50 text-slate-500 uppercase dark:bg-slate-800 dark:text-slate-400">
                <tr>
                  <th className="p-2.5">Product Name</th>
                  <th className="p-2.5">SKU</th>
                  <th className="p-2.5 text-right">Stock</th>
                  <th className="p-2.5 text-right">Cost Price</th>
                  <th className="p-2.5 text-right">Total Value</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
                {activeProducts.map((p) => (
                  <tr key={p.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                    <td className="p-2.5 font-medium text-slate-900 dark:text-white truncate max-w-[240px]" title={p.name}>{p.name}</td>
                    <td className="p-2.5 text-slate-500 font-mono">{p.sku}</td>
                    <td className="p-2.5 text-right tabular-nums">{num(p.stock)}</td>
                    <td className="p-2.5 text-right tabular-nums">{inr(p.costPrice)}</td>
                    <td className="p-2.5 text-right tabular-nums font-semibold">{inr(p.totalVal)}</td>
                  </tr>
                ))}
                {!activeProducts.length && (
                  <tr>
                    <td colSpan={5} className="p-8 text-center text-slate-400">No active products match search query.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </Modal>

      {/* Monthly Performance Orders Modal */}
      <Modal
        open={showMonthlyOrdersModal}
        onClose={() => setShowMonthlyOrdersModal(false)}
        title={`Monthly Revenue & Profit Breakdown (${new Date().toLocaleDateString("en-IN", { month: "long", year: "numeric" })})`}
        wide
        footer={
          <div className="flex w-full items-center justify-between text-sm">
            <span>Total Orders: <b>{monthlyOrdersFiltered.length}</b></span>
            <div className="flex gap-4">
              <span>Total Revenue: <b className="text-violet-700 dark:text-violet-300 font-bold">{inr(monthlyOrdersFiltered.reduce((sum, o) => sum + o.total, 0))}</b></span>
              <span>Total Profit: <b className="text-emerald-700 dark:text-emerald-300 font-bold">{inr(monthlyOrdersFiltered.reduce((sum, o) => sum + o.profit, 0))}</b></span>
            </div>
          </div>
        }
      >
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <Input
              value={searchOrders}
              onChange={(e) => setSearchOrders(e.target.value)}
              placeholder="Search orders by number or customer name..."
              className="flex-1"
            />
            {searchOrders && (
              <Button variant="ghost" onClick={() => setSearchOrders("")} className="py-1">Clear</Button>
            )}
          </div>
          <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-800 max-h-[50vh]">
            <table className="w-full text-left text-xs">
              <thead className="sticky top-0 bg-slate-50 text-slate-500 uppercase dark:bg-slate-800 dark:text-slate-400">
                <tr>
                  <th className="p-2.5">Order No</th>
                  <th className="p-2.5">Date</th>
                  <th className="p-2.5">Salon / Customer</th>
                  <th className="p-2.5 text-right">Revenue</th>
                  <th className="p-2.5 text-right">Profit</th>
                  <th className="p-2.5 text-center">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
                {monthlyOrdersFiltered.map((o) => (
                  <tr key={o.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                    <td className="p-2.5 font-semibold text-slate-900 dark:text-white">{o.orderNo}</td>
                    <td className="p-2.5 text-slate-500">{fmtDate(o.createdAt)}</td>
                    <td className="p-2.5 text-slate-700 dark:text-slate-200 truncate max-w-[200px]" title={o.salonName}>{o.salonName}</td>
                    <td className="p-2.5 text-right tabular-nums font-medium">{inr(o.total)}</td>
                    <td className="p-2.5 text-right tabular-nums font-semibold text-emerald-600">{inr(o.profit)} {o.subtotal > 0 && `(${((o.profit / o.subtotal) * 100).toFixed(1)}%)`}</td>
                    <td className="p-2.5 text-center"><StatusBadge value={o.status} /></td>
                  </tr>
                ))}
                {!monthlyOrdersFiltered.length && (
                  <tr>
                    <td colSpan={6} className="p-8 text-center text-slate-400">No matching orders found for this month.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </Modal>

      {/* Top Purchased Products Breakdown Modal */}
      <Modal
        open={showTopProductsModal}
        onClose={() => setShowTopProductsModal(false)}
        title="Top Purchased Products Breakdown"
        wide
        footer={
          <div className="flex w-full items-center justify-between text-sm">
            <span>Total Unique Products: <b>{topProductsByChannel.length}</b></span>
            <span>Total Sales Value: <b className="text-indigo-700 dark:text-indigo-300 font-bold">{inr(topProductsByChannel.reduce((sum, p) => sum + p.totalValue, 0))}</b></span>
          </div>
        }
      >
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <Input
              value={searchTopProducts}
              onChange={(e) => setSearchTopProducts(e.target.value)}
              placeholder="Search products by name..."
              className="flex-1"
            />
            {searchTopProducts && (
              <Button variant="ghost" onClick={() => setSearchTopProducts("")} className="py-1">Clear</Button>
            )}
          </div>
          <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-800 max-h-[50vh]">
            <table className="w-full text-left text-xs">
              <thead className="sticky top-0 bg-slate-50 text-slate-500 uppercase dark:bg-slate-800 dark:text-slate-400">
                <tr>
                  <th className="p-2.5">Product Name</th>
                  <th className="p-2.5 text-center">App</th>
                  <th className="p-2.5 text-center">Manual</th>
                  <th className="p-2.5 text-center">WhatsApp</th>
                  <th className="p-2.5 text-center">Phone</th>
                  <th className="p-2.5 text-center font-semibold">Total Qty</th>
                  <th className="p-2.5 text-right font-semibold">Purchase Value</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
                {filteredTopProducts.map((p) => (
                  <tr key={p.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                    <td className="p-2.5 font-medium text-slate-900 dark:text-white truncate max-w-[240px]" title={p.name}>{p.name}</td>
                    <td className="p-2.5 text-center tabular-nums">{p.appQty}</td>
                    <td className="p-2.5 text-center tabular-nums">{p.manualQty}</td>
                    <td className="p-2.5 text-center tabular-nums">{p.whatsappQty}</td>
                    <td className="p-2.5 text-center tabular-nums">{p.phoneQty}</td>
                    <td className="p-2.5 text-center tabular-nums font-semibold">{p.totalQty}</td>
                    <td className="p-2.5 text-right tabular-nums font-semibold text-indigo-600 dark:text-indigo-400">{inr(p.totalValue)}</td>
                  </tr>
                ))}
                {!filteredTopProducts.length && (
                  <tr>
                    <td colSpan={7} className="p-8 text-center text-slate-400">No products match search query.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </Modal>
    </div>
  );
}
