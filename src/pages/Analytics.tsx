import { useMemo, useState } from "react";
import {
  Bar, BarChart, CartesianGrid, Cell, Line, LineChart, Pie, PieChart,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { FileDown, Printer, Zap, Turtle, Skull, AlertTriangle } from "lucide-react";
import { Button, Card, PageHeader, Badge } from "@/components/ui/primitives";
import { useDataStore } from "@/store/dataStore";
import { mergeOrders } from "@/services/orderMerger";
import { inr, num, exportCsv } from "@/lib/utils";
import {
  salesByDay, salesByMonth, stockVelocity, available, isLow, margin,
} from "@/lib/calc";

const palette = ["#6366f1", "#10b981", "#f59e0b", "#f43f5e", "#0ea5e9", "#8b5cf6", "#ec4899"];
const tip = { contentStyle: { borderRadius: 10, border: "1px solid #e2e8f0", fontSize: 12 } };

function ChartCard({ title, children, h = "h-64" }: { title: string; children: React.ReactNode; h?: string }) {
  return (
    <Card className="p-5">
      <h3 className="mb-4 text-sm font-semibold text-slate-900 dark:text-white">{title}</h3>
      <div className={h}><ResponsiveContainer width="100%" height="100%">{children as React.ReactElement}</ResponsiveContainer></div>
    </Card>
  );
}

export default function Analytics() {
  const { products: rawProducts, salesOrders: rawSalesOrders, purchaseOrders: rawPurchaseOrders, salons: rawSalons } = useDataStore();
  const rawAdminOrders = useDataStore((s: any) => s.adminOrders || []);
  const rawAdminCustomers = useDataStore((s: any) => s.adminCustomers || []);

  const products = useMemo(() => rawProducts.filter((p: any) => p.isDeleted !== true), [rawProducts]);
  const purchaseOrders = useMemo(() => rawPurchaseOrders.filter((po: any) => po.isDeleted !== true), [rawPurchaseOrders]);
  const salons = useMemo(() => rawSalons.filter((s: any) => s.isDeleted !== true), [rawSalons]);
  const adminCustomers = useMemo(() => rawAdminCustomers.filter((c: any) => c.isDeleted !== true), [rawAdminCustomers]);
  const adminOrders = useMemo(() => rawAdminOrders.filter((o: any) => o.isDeleted !== true), [rawAdminOrders]);

  const salesOrders = useMemo(() => {
    return mergeOrders(adminOrders, rawSalesOrders, salons, adminCustomers);
  }, [adminOrders, rawSalesOrders, salons, adminCustomers]);

  const [range, setRange] = useState<"week" | "month">("week");

  const salesSeries = range === "week" ? salesByDay(salesOrders, 7) : salesByMonth(salesOrders, 6);

  const byCategory = useMemo(() => {
    const map = new Map<string, number>();
    salesOrders.filter((o) => o.status !== "Cancelled").forEach((o) =>
      o.lines.forEach((l: any) => {
        const p = products.find((x) => x.id === l.productId);
        const cat = p?.category ?? "Other";
        map.set(cat, (map.get(cat) || 0) + l.price * l.qty);
      })
    );
    return [...map.entries()].map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
  }, [salesOrders, products]);

  const byVendor = useMemo(() => {
    const map = new Map<string, number>();
    purchaseOrders.forEach((p) => map.set(p.vendorName, (map.get(p.vendorName) || 0) + p.total));
    return [...map.entries()].map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
  }, [purchaseOrders]);

  const velocity = stockVelocity(products, salesOrders);
  const fast = velocity.filter((v) => v.band === "fast");
  const slow = velocity.filter((v) => v.band === "slow");
  const dead = velocity.filter((v) => v.band === "dead");
  const low = products.filter((p) => isLow(p));

  return (
    <div>
      <PageHeader title="Analytics & Reports" subtitle="Sales, profit, inventory velocity and purchase trends."
        actions={
          <>
            <div className="flex overflow-hidden rounded-lg border border-slate-200 dark:border-slate-700">
              <button onClick={() => setRange("week")} className={`px-3 py-2 text-xs font-medium ${range === "week" ? "bg-slate-900 text-white dark:bg-white dark:text-slate-900" : "text-slate-500"}`}>Weekly</button>
              <button onClick={() => setRange("month")} className={`px-3 py-2 text-xs font-medium ${range === "month" ? "bg-slate-900 text-white dark:bg-white dark:text-slate-900" : "text-slate-500"}`}>Monthly</button>
            </div>
            <Button variant="secondary" onClick={() => exportCsv(velocity.map((v) => ({ product: v.product.name, sold30d: v.sold, band: v.band, available: available(v.product), margin: margin(v.product).toFixed(1) + "%" })), "inventory-report")}><FileDown className="h-4 w-4" /> Excel</Button>
            <Button variant="secondary" onClick={() => window.print()}><Printer className="h-4 w-4" /> PDF</Button>
          </>
        }
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <ChartCard title={`${range === "week" ? "Daily" : "Monthly"} Sales & Profit`}>
          <LineChart data={salesSeries}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
            <XAxis dataKey="label" tick={{ fontSize: 11, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 11, fill: "#94a3b8" }} axisLine={false} tickLine={false} width={44} />
            <Tooltip {...tip} formatter={(v: number) => inr(v)} />
            <Line type="monotone" dataKey="sales" stroke="#6366f1" strokeWidth={2.5} dot={{ r: 3 }} />
            <Line type="monotone" dataKey="profit" stroke="#10b981" strokeWidth={2.5} dot={{ r: 3 }} />
          </LineChart>
        </ChartCard>

        <ChartCard title="Revenue by Category">
          <PieChart>
            <Pie data={byCategory} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={90} label={(e) => e.name}>
              {byCategory.map((_, i) => <Cell key={i} fill={palette[i % palette.length]} />)}
            </Pie>
            <Tooltip {...tip} formatter={(v: number) => inr(v)} />
          </PieChart>
        </ChartCard>
      </div>

      <div className="mt-6">
        <ChartCard title="Purchases by Vendor">
          <BarChart data={byVendor}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
            <XAxis dataKey="name" tick={{ fontSize: 11, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 11, fill: "#94a3b8" }} axisLine={false} tickLine={false} width={56} />
            <Tooltip {...tip} formatter={(v: number) => inr(v)} />
            <Bar dataKey="value" radius={[6, 6, 0, 0]}>
              {byVendor.map((_, i) => <Cell key={i} fill={palette[i % palette.length]} />)}
            </Bar>
          </BarChart>
        </ChartCard>
      </div>

      <h3 className="mb-3 mt-8 text-sm font-semibold text-slate-900 dark:text-white">Inventory Velocity</h3>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <VelocityCard icon={Zap} color="emerald" title="Fast moving" items={fast.map((v) => v.product.name)} count={fast.length} />
        <VelocityCard icon={Turtle} color="amber" title="Slow moving" items={slow.map((v) => v.product.name)} count={slow.length} />
        <VelocityCard icon={Skull} color="rose" title="Dead stock" items={dead.map((v) => v.product.name)} count={dead.length} />
        <VelocityCard icon={AlertTriangle} color="rose" title="Low stock" items={low.map((p) => `${p.name} (${available(p)})`)} count={low.length} />
      </div>
    </div>
  );
}

function VelocityCard({ icon: Icon, color, title, items, count }: { icon: typeof Zap; color: "emerald" | "amber" | "rose"; title: string; items: string[]; count: number }) {
  return (
    <Card className="p-4">
      <div className="mb-2 flex items-center justify-between">
        <span className="flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-white"><Icon className="h-4 w-4" /> {title}</span>
        <Badge color={color}>{num(count)}</Badge>
      </div>
      <ul className="space-y-1 text-xs text-slate-500">
        {items.slice(0, 6).map((t, i) => <li key={i} className="truncate">{t}</li>)}
        {!items.length && <li className="text-slate-400">None</li>}
      </ul>
    </Card>
  );
}
