import { useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft, Package, TrendingUp, Boxes, ShieldAlert } from "lucide-react";
import { Card, StatCard, Button, PageHeader, Badge } from "@/components/ui/primitives";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { useDataStore } from "@/store/dataStore";
import { inr, num, fmtDateTime } from "@/lib/utils";
import { available, margin, profitPerUnit, invValue } from "@/lib/calc";
import { getMergedProducts } from "@/services/productOverrides";
import { mergeOrders } from "@/services/orderMerger";

export default function ProductDetails() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { products: rawProducts, stockMovements, salesOrders: rawSalesOrders, purchaseOrders: rawPurchaseOrders, salons: rawSalons } = useDataStore();
  const rawAdminProducts = useDataStore((s: any) => s.adminProducts || []);
  const rawInventoryProducts = useDataStore((s: any) => s.inventoryProducts || []);
  const rawAdminOrders = useDataStore((s: any) => s.adminOrders || []);
  const rawAdminCustomers = useDataStore((s: any) => s.adminCustomers || []);

  const products = useMemo(() => rawProducts.filter((p: any) => p.isDeleted !== true), [rawProducts]);
  const purchaseOrders = useMemo(() => rawPurchaseOrders.filter((po: any) => po.isDeleted !== true), [rawPurchaseOrders]);
  const salons = useMemo(() => rawSalons.filter((s: any) => s.isDeleted !== true), [rawSalons]);
  const adminCustomers = useMemo(() => rawAdminCustomers.filter((c: any) => c.isDeleted !== true), [rawAdminCustomers]);
  const adminOrders = useMemo(() => rawAdminOrders.filter((o: any) => o.isDeleted !== true), [rawAdminOrders]);
  const adminProducts = useMemo(() => rawAdminProducts.filter((p: any) => p.isDeleted !== true), [rawAdminProducts]);
  const inventoryProducts = useMemo(() => rawInventoryProducts.filter((p: any) => p.isDeleted !== true), [rawInventoryProducts]);

  const salesOrders = useMemo(() => {
    return mergeOrders(adminOrders, rawSalesOrders, salons, adminCustomers);
  }, [adminOrders, rawSalesOrders, salons, adminCustomers]);

  const invProduct = products.find((x) => x.id === id) || inventoryProducts.find((x: any) => x.id === id);
  const mergedAdminProducts = useMemo(() => getMergedProducts(adminProducts) as any[], [adminProducts]);
  const adminProduct = !invProduct ? mergedAdminProducts.find((x: any) => x.id === id) : null;
  const p = invProduct || adminProduct;

  const data = useMemo(() => {
    if (!invProduct) return null;
    const moves = stockMovements.filter((m) => m.productId === invProduct.id).sort((a, b) => b.createdAt - a.createdAt);
    const sales = salesOrders
      .filter((o) => o.status !== "Cancelled" && o.lines.some((l: any) => l.productId === invProduct.id))
      .map((o) => ({ order: o, line: o.lines.find((l: any) => l.productId === invProduct.id)! }))
      .sort((a, b) => b.order.createdAt - a.order.createdAt);
    const purchases = purchaseOrders.filter((po) => po.lines.some((l) => l.productId === invProduct.id));
    const totalSold = sales.reduce((s, x) => s + x.line.qty, 0);
    const totalProfit = sales.reduce((s, x) => s + (x.line.price - x.line.cost) * x.line.qty - x.line.discount, 0);
    return { moves, sales, purchases, totalSold, totalProfit };
  }, [invProduct, stockMovements, salesOrders, purchaseOrders]);

  if (!p) {
    return (
      <div className="py-20 text-center">
        <p className="text-slate-500">Product not found.</p>
        <Button variant="secondary" className="mt-4" onClick={() => navigate("/app-products")}>Back to products</Button>
      </div>
    );
  }

  // ── Admin product view (read-only, shows image + variants) ──────────────
  if (adminProduct && !invProduct) {
    const variants: any[] = Array.isArray(adminProduct.variants) ? adminProduct.variants : [];
    const costPrice = Number(adminProduct.costPrice ?? 0);
    const sellingPrice = Number(adminProduct.price ?? adminProduct.sellingPrice ?? 0);
    const mrp = Number(adminProduct.originalPrice ?? adminProduct.mrp ?? 0);
    const stock = adminProduct.stock != null ? Number(adminProduct.stock) : null;
    const imageUrl = adminProduct.image || adminProduct.imageUrl || adminProduct.thumbnailUrl || null;

    return (
      <div className="space-y-6">
        <button onClick={() => navigate("/app-products")} className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-900 dark:hover:text-white">
          <ArrowLeft className="h-4 w-4" /> Products
        </button>

        <div className="flex items-start gap-5">
          {imageUrl && (
            <img src={imageUrl} alt={adminProduct.name} className="h-24 w-24 rounded-xl object-cover shadow" />
          )}
          <div>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-white">{adminProduct.name}</h1>
            <p className="mt-0.5 text-sm text-slate-500">
              {[adminProduct.brand, adminProduct.category || adminProduct.categoryName, adminProduct.sku ? `SKU: ${adminProduct.sku}` : null]
                .filter(Boolean).join(" · ")}
            </p>
            {adminProduct.description && <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">{adminProduct.description}</p>}
          </div>
        </div>

        {/* Pricing */}
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Card className="p-4">
            <p className="text-xs text-slate-400 uppercase tracking-wide">Cost Price</p>
            <p className="mt-1 text-lg font-bold text-slate-900 dark:text-white">{costPrice ? inr(costPrice) : "—"}</p>
          </Card>
          <Card className="p-4">
            <p className="text-xs text-slate-400 uppercase tracking-wide">Selling Price</p>
            <p className="mt-1 text-lg font-bold text-slate-900 dark:text-white">{sellingPrice ? inr(sellingPrice) : "—"}</p>
          </Card>
          <Card className="p-4">
            <p className="text-xs text-slate-400 uppercase tracking-wide">MRP</p>
            <p className="mt-1 text-lg font-bold text-slate-900 dark:text-white">{mrp ? inr(mrp) : "—"}</p>
          </Card>
          <Card className="p-4">
            <p className="text-xs text-slate-400 uppercase tracking-wide">Stock</p>
            <p className="mt-1 text-lg font-bold text-slate-900 dark:text-white">{stock != null ? num(stock) : "—"}</p>
          </Card>
        </div>

        {/* Variants */}
        {variants.length > 0 && (
          <Card className="p-5">
            <h2 className="mb-4 text-sm font-semibold text-slate-900 dark:text-white">
              Variants <span className="ml-1.5 rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-500 dark:bg-slate-700 dark:text-slate-300">{variants.length}</span>
            </h2>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-left text-xs uppercase text-slate-400 dark:border-slate-700">
                    <th className="pb-2 pr-4">Name / Size</th>
                    <th className="pb-2 pr-4">SKU</th>
                    <th className="pb-2 pr-4 text-right">Cost</th>
                    <th className="pb-2 pr-4 text-right">Price</th>
                    <th className="pb-2 pr-4 text-right">MRP</th>
                    <th className="pb-2 text-right">Stock</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {variants.map((v: any, i: number) => (
                    <tr key={v.id || i} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                      <td className="py-2.5 pr-4">
                        <p className="font-medium text-slate-900 dark:text-white">
                          {v.name || v.variantName || v.size || v.label || `Variant ${i + 1}`}
                        </p>
                        {v.color && <p className="text-xs text-slate-400">{v.color}</p>}
                      </td>
                      <td className="py-2.5 pr-4 font-mono text-xs text-slate-400">{v.sku || v.variantSku || "—"}</td>
                      <td className="py-2.5 pr-4 text-right tabular-nums">{v.costPrice ? inr(Number(v.costPrice)) : "—"}</td>
                      <td className="py-2.5 pr-4 text-right tabular-nums font-medium">{v.price || v.sellingPrice ? inr(Number(v.price ?? v.sellingPrice)) : "—"}</td>
                      <td className="py-2.5 pr-4 text-right tabular-nums text-slate-400">{v.originalPrice || v.mrp ? inr(Number(v.originalPrice ?? v.mrp)) : "—"}</td>
                      <td className="py-2.5 text-right tabular-nums">{v.stock != null ? num(Number(v.stock)) : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        )}

        <div className="rounded-lg bg-blue-50 border border-blue-200 p-3 text-xs text-blue-800 dark:bg-blue-950 dark:border-blue-800 dark:text-blue-300">
          📌 This is a read-only view of an app product. Edit pricing and stock from the Products list.
        </div>
      </div>
    );
  }

  // ── Inventory product view (full detail with movements, sales, purchases) ──
  if (!data) return null;

  return (
    <div>
      <button onClick={() => navigate("/app-products")} className="mb-3 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-900 dark:hover:text-white">
        <ArrowLeft className="h-4 w-4" /> Products
      </button>
      <PageHeader
        title={p.name}
        subtitle={`SKU ${p.sku} · ${p.brand} · ${p.category}`}
        actions={p.expiryTracking ? <Badge color="amber">Expiry tracked</Badge> : undefined}
      />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard icon={Boxes} label="Current Stock" value={num(p.stock)} sub={`${p.unit}`} />
        <StatCard icon={Package} label="Reserved" value={num(p.reserved)} accent="bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300" />
        <StatCard icon={Boxes} label="Available" value={num(available(p))} accent="bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300" />
        <StatCard icon={ShieldAlert} label="Reorder Level" value={num(p.reorderLevel)} accent="bg-rose-50 text-rose-700 dark:bg-rose-950 dark:text-rose-300" />
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card className="p-5 lg:col-span-1">
          <h3 className="mb-3 text-sm font-semibold text-slate-900 dark:text-white">Pricing & Profit</h3>
          <dl className="space-y-2 text-sm">
            <Row k="Cost price" v={inr(p.costPrice)} />
            <Row k="Selling price" v={inr(p.sellingPrice)} />
            <Row k="Profit / unit" v={inr(profitPerUnit(p))} accent="text-emerald-600" />
            <Row k="Margin" v={`${margin(p).toFixed(1)}%`} accent="text-emerald-600" />
            <Row k="GST" v={`${p.gstRate}%`} />
            <Row k="Inventory value" v={inr(invValue(p))} />
            <Row k="Preferred vendor" v={p.vendorName || "—"} />
            <Row k="Total units sold" v={num(data.totalSold)} />
            <Row k="Total profit generated" v={inr(data.totalProfit)} accent="text-emerald-600" />
          </dl>
        </Card>

        <Card className="p-5 lg:col-span-2">
          <h3 className="mb-3 text-sm font-semibold text-slate-900 dark:text-white">Inventory Movement Timeline</h3>
          <ol className="relative space-y-4 border-l border-slate-200 pl-5 dark:border-slate-700">
            {data.moves.map((m) => (
              <li key={m.id}>
                <span className={`absolute -left-[5px] mt-1.5 h-2.5 w-2.5 rounded-full ${m.qty >= 0 ? "bg-emerald-500" : "bg-rose-500"}`} />
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <StatusBadge value={m.type} />
                    <span className="text-sm text-slate-700 dark:text-slate-200">{m.reason}</span>
                  </div>
                  <span className={`text-sm font-semibold tabular-nums ${m.qty >= 0 ? "text-emerald-600" : "text-rose-600"}`}>{m.qty > 0 ? "+" : ""}{m.qty}</span>
                </div>
                <div className="text-xs text-slate-400">{fmtDateTime(m.createdAt)} · balance {m.balanceAfter}{m.refNo ? ` · ${m.refNo}` : ""}</div>
              </li>
            ))}
            {!data.moves.length && <li className="text-sm text-slate-400">No movements recorded.</li>}
          </ol>
        </Card>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card className="p-5">
          <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-white"><TrendingUp className="h-4 w-4" /> Sales History</h3>
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {data.sales.map(({ order, line }) => (
              <div key={order.id} className="flex items-center gap-3 py-2.5 text-sm">
                <span className="w-20 font-medium text-slate-900 dark:text-white">{order.orderNo}</span>
                <span className="min-w-0 flex-1 truncate text-slate-600 dark:text-slate-300">{order.salonName}</span>
                <span className="tabular-nums text-slate-500">×{line.qty}</span>
                <StatusBadge value={order.status} />
              </div>
            ))}
            {!data.sales.length && <p className="py-3 text-sm text-slate-400">No sales yet.</p>}
          </div>
        </Card>

        <Card className="p-5">
          <h3 className="mb-3 text-sm font-semibold text-slate-900 dark:text-white">Purchase History</h3>
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {data.purchases.map((po) => {
              const line = po.lines.find((l) => l.productId === p.id)!;
              return (
                <div key={po.id} className="flex items-center gap-3 py-2.5 text-sm">
                  <span className="w-20 font-medium text-slate-900 dark:text-white">{po.poNo}</span>
                  <span className="min-w-0 flex-1 truncate text-slate-600 dark:text-slate-300">{po.vendorName}</span>
                  <span className="tabular-nums text-slate-500">{line.received}/{line.qty} @ {inr(line.cost)}</span>
                  <StatusBadge value={po.status} />
                </div>
              );
            })}
            {!data.purchases.length && <p className="py-3 text-sm text-slate-400">No purchases yet.</p>}
          </div>
        </Card>
      </div>
    </div>
  );
}

function Row({ k, v, accent }: { k: string; v: string; accent?: string }) {
  return (
    <div className="flex items-center justify-between">
      <dt className="text-slate-500">{k}</dt>
      <dd className={`font-semibold tabular-nums text-slate-900 dark:text-white ${accent ?? ""}`}>{v}</dd>
    </div>
  );
}
