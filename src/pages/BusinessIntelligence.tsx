import { useMemo, useState } from "react";
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Line, LineChart,
  Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import {
  TrendingUp, TrendingDown, IndianRupee, ShoppingBag, Receipt, RotateCcw,
  XCircle, Truck, Clock, Users, UserCheck, UserX, Repeat, Wallet,
  FileDown, Layers, FileSpreadsheet, FileText,
} from "lucide-react";
import toast from "react-hot-toast";
import { Card, StatCard, Button, PageHeader, Badge, Input, Select } from "@/components/ui/primitives";
import { useDataStore } from "@/store/dataStore";
import { inr, num, pct } from "@/lib/utils";
import {
  totalSales, grossProfit, gmv, ordersCount, averageOrderValue,
  returnRate, cancelledCount, deliverySuccessRate, avgFulfillmentHours,
  channelSplit, profitByProduct, topCategories, salonStats,
  newSalonGrowth, monthlyActiveSalons, repeatRevenuePct, regionSales,
  paymentSplit, outstandingTotal, cashFlowTrend, filterByRange, growthBetween,
  buildSalonExportRows, type Range, type SalonExportMetric,
} from "@/lib/bi";
import { exportSalonExcel, exportSalonCsv, exportSalonPdf } from "@/lib/exporters";

const palette = ["#6366f1", "#10b981", "#f59e0b", "#f43f5e", "#0ea5e9", "#8b5cf6", "#ec4899", "#14b8a6"];
const tip = { contentStyle: { borderRadius: 10, border: "1px solid #e2e8f0", fontSize: 12 } };
const DAY = 86400000;

function ChartCard({ title, sub, children, h = "h-64" }: { title: string; sub?: string; children: React.ReactNode; h?: string }) {
  return (
    <Card className="p-5">
      <div className="mb-4">
        <h3 className="text-sm font-semibold text-slate-900 dark:text-white">{title}</h3>
        {sub && <p className="text-xs text-slate-400">{sub}</p>}
      </div>
      <div className={h}><ResponsiveContainer width="100%" height="100%">{children as React.ReactElement}</ResponsiveContainer></div>
    </Card>
  );
}

type RangePreset = "all" | "7" | "30" | "90" | "custom";

export default function BusinessIntelligence() {
  const { salesOrders, products, salons } = useDataStore();
  const [preset, setPreset] = useState<RangePreset>("30");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [minSalonRevenue, setMinSalonRevenue] = useState(0);
  const [minSalonProfit, setMinSalonProfit] = useState(0);
  const [exportMetric, setExportMetric] = useState<SalonExportMetric>("Revenue");

  const range: Range = useMemo(() => {
    if (preset === "all") return { kind: "all" };
    if (preset === "custom") {
      const from = customFrom ? new Date(customFrom).getTime() : 0;
      const to = customTo ? new Date(customTo).getTime() + DAY - 1 : Date.now();
      return { kind: "window", from, to };
    }
    const days = Number(preset);
    return { kind: "window", from: Date.now() - days * DAY, to: Date.now() };
  }, [preset, customFrom, customTo]);

  const scoped = useMemo(() => filterByRange(salesOrders, range), [salesOrders, range]);

  const k = useMemo(() => {
    const ss = salonStats(salesOrders, salons);
    const pay = paymentSplit(scoped);
    const growth = range.kind === "window" ? growthBetween(salesOrders, range.from, range.to) : null;
    return {
      totalSales: totalSales(scoped),
      gmv: gmv(scoped),
      grossProfit: grossProfit(scoped),
      orders: ordersCount(scoped),
      aov: averageOrderValue(scoped),
      growth,
      returnRate: returnRate(scoped),
      cancelled: cancelledCount(scoped),
      deliveryRate: deliverySuccessRate(scoped),
      fulfillment: avgFulfillmentHours(scoped),
      ...ss,
      repeatRevenue: repeatRevenuePct(scoped),
      outstanding: outstandingTotal(salons),
      pay,
    };
  }, [scoped, salesOrders, salons, range]);

  const channels = channelSplit(scoped);
  const profitProd = profitByProduct(scoped, 8);
  const categories = topCategories(scoped, products, 6);
  const salonGrowth = newSalonGrowth(salons, 6);
  const mas = monthlyActiveSalons(salesOrders, 6);
  const regions = regionSales(scoped, salons);
  const cashFlow = cashFlowTrend(salesOrders, 6);

  // Salon revenue+profit within the active range, filtered by the #2 thresholds.
  const salonRows = useMemo(
    () => buildSalonExportRows(scoped, salons, exportMetric),
    [scoped, salons, exportMetric]
  );
  const salonTable = useMemo(() => {
    const rev = buildSalonExportRows(scoped, salons, "Revenue");
    const prof = buildSalonExportRows(scoped, salons, "Profit");
    const profByName = new Map(prof.map((r) => [r["Salon Name"], r.Profit ?? 0]));
    return rev
      .map((r) => ({
        name: r["Salon Name"],
        branchNo: r["Branch No"],
        city: r.City,
        revenue: r.Revenue ?? 0,
        profit: profByName.get(r["Salon Name"]) ?? 0,
      }))
      .filter((r) => r.revenue >= minSalonRevenue && r.profit >= minSalonProfit)
      .sort((a, b) => (exportMetric === "Profit" ? b.profit - a.profit : b.revenue - a.revenue))
      .slice(0, 8);
  }, [scoped, salons, minSalonRevenue, minSalonProfit, exportMetric]);

  const rangeLabel =
    preset === "all" ? "All time" : preset === "custom" ? `${customFrom || "…"} → ${customTo || "…"}` : `Last ${preset} days`;

  const exportRowsFiltered = salonRows.filter((r) => {
    const rev = (r.Revenue as number) ?? 0;
    const prof = (r.Profit as number) ?? 0;
    const revOk = exportMetric === "Revenue" ? rev >= minSalonRevenue : true;
    const profOk = exportMetric === "Profit" ? prof >= minSalonProfit : true;
    return revOk && profOk;
  });

  const doExport = (kind: "excel" | "csv" | "pdf") => {
    if (!exportRowsFiltered.length) { toast.error("No salons match the current filters"); return; }
    const file = `salon-${exportMetric.toLowerCase()}-${preset}`;
    if (kind === "excel") exportSalonExcel(exportRowsFiltered, exportMetric, file);
    else if (kind === "csv") exportSalonCsv(exportRowsFiltered, exportMetric, file);
    else exportSalonPdf(exportRowsFiltered, exportMetric, file, `Salon ${exportMetric} — ${rangeLabel}`);
    toast.success(`Exported ${exportRowsFiltered.length} salons (${kind.toUpperCase()})`);
  };

  return (
    <div>
      <PageHeader
        title="Business Intelligence"
        subtitle={`Metrics for: ${rangeLabel}`}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex overflow-hidden rounded-lg border border-slate-200 dark:border-slate-700">
              {([["all", "All time"], ["7", "7d"], ["30", "30d"], ["90", "90d"], ["custom", "Custom"]] as [RangePreset, string][]).map(([v, label]) => (
                <button key={v} onClick={() => setPreset(v)} className={`px-3 py-2 text-xs font-medium ${preset === v ? "bg-slate-900 text-white dark:bg-white dark:text-slate-900" : "text-slate-500"}`}>{label}</button>
              ))}
            </div>
            {preset === "custom" && (
              <>
                <Input type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} className="w-auto" />
                <span className="text-slate-400">→</span>
                <Input type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)} className="w-auto" />
              </>
            )}
          </div>
        }
      />

      {/* Sales KPIs */}
      <SectionTitle>Sales</SectionTitle>
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard icon={IndianRupee} label="Total Sales" value={inr(k.totalSales)} accent="bg-indigo-50 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300" />
        <StatCard icon={ShoppingBag} label="GMV" value={inr(k.gmv)} sub="incl. cancelled/returned" accent="bg-violet-50 text-violet-700 dark:bg-violet-950 dark:text-violet-300" />
        <StatCard icon={Receipt} label="Avg Order Value" value={inr(k.aov)} accent="bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300" />
        <StatCard icon={(k.growth ?? 0) >= 0 ? TrendingUp : TrendingDown} label="Sales Growth" value={k.growth === null ? "—" : pct(k.growth)} sub={k.growth === null ? "pick a range" : "vs previous period"} accent={(k.growth ?? 0) >= 0 ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300" : "bg-rose-50 text-rose-700 dark:bg-rose-950 dark:text-rose-300"} />
      </div>

      {/* Profit KPIs */}
      <SectionTitle>Profit</SectionTitle>
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard icon={TrendingUp} label="Gross Profit" value={inr(k.grossProfit)} accent="bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300" />
        <StatCard icon={Repeat} label="Repeat Revenue" value={pct(k.repeatRevenue)} sub="from 2+ order salons" accent="bg-teal-50 text-teal-700 dark:bg-teal-950 dark:text-teal-300" />
        <StatCard icon={ShoppingBag} label="Orders" value={num(k.orders)} accent="bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200" />
        <StatCard icon={Wallet} label="Outstanding" value={inr(k.outstanding)} accent="bg-rose-50 text-rose-700 dark:bg-rose-950 dark:text-rose-300" />
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
        <ChartCard title="Profit by Product" sub="Top 8 by gross profit">
          <BarChart data={profitProd} layout="vertical" margin={{ left: 6, right: 12 }}>
            <XAxis type="number" hide />
            <YAxis type="category" dataKey="name" width={130} tick={{ fontSize: 10, fill: "#475569" }} axisLine={false} tickLine={false} />
            <Tooltip {...tip} formatter={(v: number) => inr(v)} />
            <Bar dataKey="profit" radius={[0, 6, 6, 0]} barSize={16}>
              {profitProd.map((_, i) => <Cell key={i} fill={palette[i % palette.length]} />)}
            </Bar>
          </BarChart>
        </ChartCard>
        <Card className="p-5">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="text-sm font-semibold text-slate-900 dark:text-white">Top Salon Customers</h3>
              <p className="text-xs text-slate-400">Filtered by min revenue &amp; profit · {rangeLabel}</p>
            </div>
            <Select value={exportMetric} onChange={(e) => setExportMetric(e.target.value as SalonExportMetric)} className="w-auto">
              <option value="Revenue">By Revenue</option>
              <option value="Profit">By Profit</option>
            </Select>
          </div>

          <div className="mb-3 grid grid-cols-2 gap-2">
            <label className="block">
              <span className="mb-0.5 block text-[10px] uppercase tracking-wide text-slate-400">Min revenue (₹)</span>
              <Input type="number" min={0} value={minSalonRevenue} onChange={(e) => setMinSalonRevenue(Math.max(0, Number(e.target.value)))} />
            </label>
            <label className="block">
              <span className="mb-0.5 block text-[10px] uppercase tracking-wide text-slate-400">Min profit (₹)</span>
              <Input type="number" min={0} value={minSalonProfit} onChange={(e) => setMinSalonProfit(Math.max(0, Number(e.target.value)))} />
            </label>
          </div>

          <div className="max-h-56 space-y-1 overflow-y-auto">
            {salonTable.map((r, i) => (
              <div key={r.name} className="flex items-center justify-between rounded-lg px-2 py-1.5 text-sm odd:bg-slate-50 dark:odd:bg-slate-800/50">
                <span className="min-w-0 flex-1 truncate text-slate-700 dark:text-slate-200">
                  <span className="text-slate-400">{i + 1}.</span> {r.name}
                  {r.branchNo !== "-" && <span className="ml-1 text-xs text-slate-400">({r.branchNo})</span>}
                </span>
                <span className="tabular-nums font-medium text-slate-900 dark:text-white">{inr(exportMetric === "Profit" ? r.profit : r.revenue)}</span>
              </div>
            ))}
            {!salonTable.length && <p className="py-6 text-center text-xs text-slate-400">No salons match these filters.</p>}
          </div>

          <div className="mt-3 flex flex-wrap gap-2 border-t border-slate-100 pt-3 dark:border-slate-800">
            <Button variant="secondary" onClick={() => doExport("excel")}><FileSpreadsheet className="h-4 w-4" /> Excel</Button>
            <Button variant="secondary" onClick={() => doExport("csv")}><FileDown className="h-4 w-4" /> CSV</Button>
            <Button variant="secondary" onClick={() => doExport("pdf")}><FileText className="h-4 w-4" /> PDF</Button>
          </div>
        </Card>
      </div>

      {/* Order quality KPIs */}
      <SectionTitle>Order Quality &amp; Fulfillment</SectionTitle>
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard icon={Truck} label="Delivery Success" value={pct(k.deliveryRate)} accent="bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300" />
        <StatCard icon={Clock} label="Avg Fulfillment" value={`${k.fulfillment.toFixed(1)} hrs`} sub="order → delivered" accent="bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300" />
        <StatCard icon={RotateCcw} label="Return Rate" value={pct(k.returnRate)} accent="bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300" />
        <StatCard icon={XCircle} label="Cancelled Orders" value={num(k.cancelled)} accent="bg-rose-50 text-rose-700 dark:bg-rose-950 dark:text-rose-300" />
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-3">
        <ChartCard title="Manual vs App Orders" sub="By revenue & count">
          <PieChart>
            <Pie data={channels} dataKey="revenue" nameKey="name" cx="50%" cy="50%" outerRadius={85} label={(e) => e.name}>
              {channels.map((_, i) => <Cell key={i} fill={palette[i]} />)}
            </Pie>
            <Tooltip {...tip} formatter={(v: number, _n, p) => [`${inr(v)} · ${(p?.payload as { orders: number }).orders} orders`, ""]} />
          </PieChart>
        </ChartCard>
        <ChartCard title="Top Product Categories" sub="By revenue">
          <PieChart>
            <Pie data={categories} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={85} label={(e) => e.name}>
              {categories.map((_, i) => <Cell key={i} fill={palette[i % palette.length]} />)}
            </Pie>
            <Tooltip {...tip} formatter={(v: number) => inr(v)} />
          </PieChart>
        </ChartCard>
        <ChartCard title="Region-wise Sales" sub="Revenue by salon region">
          <BarChart data={regions}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
            <XAxis dataKey="name" tick={{ fontSize: 10, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 10, fill: "#94a3b8" }} axisLine={false} tickLine={false} width={48} />
            <Tooltip {...tip} formatter={(v: number) => inr(v)} />
            <Bar dataKey="value" radius={[6, 6, 0, 0]}>
              {regions.map((_, i) => <Cell key={i} fill={palette[i % palette.length]} />)}
            </Bar>
          </BarChart>
        </ChartCard>
      </div>

      {/* Customer health KPIs */}
      <SectionTitle>Customers</SectionTitle>
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard icon={UserCheck} label="Active Salons" value={num(k.active)} sub="ordered in 60 days" accent="bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300" />
        <StatCard icon={Repeat} label="Repeat Customers" value={num(k.repeat)} sub="2+ orders" accent="bg-indigo-50 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300" />
        <StatCard icon={UserX} label="Churned Salons" value={num(k.churned)} sub="no order 90+ days" accent="bg-rose-50 text-rose-700 dark:bg-rose-950 dark:text-rose-300" />
        <StatCard icon={Users} label="Total Salons" value={num(salons.length)} accent="bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200" />
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
        <ChartCard title="New Salon Growth" sub="Salons onboarded per month">
          <BarChart data={salonGrowth}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
            <XAxis dataKey="label" tick={{ fontSize: 11, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
            <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: "#94a3b8" }} axisLine={false} tickLine={false} width={32} />
            <Tooltip {...tip} />
            <Bar dataKey="count" fill="#6366f1" radius={[6, 6, 0, 0]} />
          </BarChart>
        </ChartCard>
        <ChartCard title="Monthly Active Salons (MAS)" sub="Distinct salons ordering each month">
          <LineChart data={mas}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
            <XAxis dataKey="label" tick={{ fontSize: 11, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
            <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: "#94a3b8" }} axisLine={false} tickLine={false} width={32} />
            <Tooltip {...tip} />
            <Line type="monotone" dataKey="salons" stroke="#10b981" strokeWidth={2.5} dot={{ r: 3 }} />
          </LineChart>
        </ChartCard>
      </div>

      {/* Cash flow KPIs */}
      <SectionTitle>Cash Flow &amp; Payments</SectionTitle>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card className="p-5">
          <h3 className="mb-3 text-sm font-semibold text-slate-900 dark:text-white">Credit vs Paid Orders</h3>
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300"><Badge color="emerald">Paid</Badge> {k.pay.paidCount} orders</span>
              <span className="font-semibold tabular-nums text-slate-900 dark:text-white">{inr(k.pay.paidRevenue)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300"><Badge color="rose">Credit</Badge> {k.pay.creditCount} orders</span>
              <span className="font-semibold tabular-nums text-slate-900 dark:text-white">{inr(k.pay.creditRevenue)}</span>
            </div>
            {(() => {
              const total = k.pay.paidRevenue + k.pay.creditRevenue;
              const paidPct = total ? (k.pay.paidRevenue / total) * 100 : 0;
              return (
                <div>
                  <div className="mb-1 flex justify-between text-xs text-slate-400"><span>Collected</span><span>{paidPct.toFixed(0)}%</span></div>
                  <div className="h-2 overflow-hidden rounded-full bg-rose-200 dark:bg-rose-950">
                    <div className="h-full rounded-full bg-emerald-500" style={{ width: `${paidPct}%` }} />
                  </div>
                </div>
              );
            })()}
          </div>
        </Card>
        <div className="lg:col-span-2">
          <ChartCard title="Cash Flow Trend" sub="Paid revenue collected per month" h="h-56">
            <AreaChart data={cashFlow}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 11, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: "#94a3b8" }} axisLine={false} tickLine={false} width={48} />
              <Tooltip {...tip} formatter={(v: number) => inr(v)} />
              <Area type="monotone" dataKey="inflow" stroke="#10b981" fill="#10b98133" strokeWidth={2.5} />
            </AreaChart>
          </ChartCard>
        </div>
      </div>

      <div className="h-6" />
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h2 className="mb-3 mt-8 flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-slate-400"><Layers className="h-3.5 w-3.5" /> {children}</h2>;
}
