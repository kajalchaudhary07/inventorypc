import { useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useDataStore } from "@/store/dataStore";
import { Card, PageHeader, Button } from "@/components/ui/primitives";
import { inr } from "@/lib/utils";
import { ArrowLeft } from "lucide-react";

// ── helpers matching admin dashboard field access ──────────────────────────

const toDate = (value: any) => {
  if (!value) return null;
  if (typeof value?.toDate === "function") return value.toDate();
  if (value instanceof Date) return value;
  const p = new Date(value as string);
  return Number.isNaN(p.getTime()) ? null : p;
};

const formatDateTime = (value: any) => {
  const dt = toDate(value);
  return dt
    ? dt.toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })
    : "-";
};

const fmt = (v: any) => inr(Number(v || 0));

const getOrderRef = (order: any) => {
  const raw = order?.orderNo || order?.orderId || order?.code || order?.number || order?.id || "order";
  return `#${String(raw).replace(/^#/, "")}`;
};

const getCustomer = (order: any) => ({
  name:
    order?.contactDetails?.receiverName ||
    order?.receiverName ||
    order?.salonName ||
    order?.customerName ||
    order?.customer?.name ||
    order?.userName ||
    order?.userId ||
    "—",
  email: order?.customerEmail || order?.customer?.email || order?.email || "—",
  phone: order?.contactDetails?.phone || order?.customerPhone || order?.phone || order?.customer?.phone || "—",
});

const getAddressLines = (order: any): string[] => {
  const d = order?.deliveryAddress || order?.address || order?.shippingAddress || order?.customer?.address;
  if (!d) return [];
  if (typeof d === "string") return d.split(",").map((s: string) => s.trim()).filter(Boolean);
  return [d.receiverName, d.phone, d.line1, d.line2, d.landmark, d.city, d.state, d.postalCode || d.zip || d.pincode, d.country]
    .map((x: any) => String(x || "").trim())
    .filter(Boolean);
};

const getItems = (order: any): any[] =>
  Array.isArray(order?.items) ? order.items : Array.isArray(order?.lines) ? order.lines : [];

const getTotal = (order: any) =>
  Number(order?.total ?? order?.amount ?? order?.totalAmount ?? order?.grandTotal ?? order?.payableAmount ?? 0);

// ── component ──────────────────────────────────────────────────────────────

export default function OrderDetails() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const adminOrders = useDataStore((s: any) => s.adminOrders || []);
  const salesOrders = useDataStore((s: any) => s.salesOrders || []);

  const order = useMemo(() => {
    const all = [...(adminOrders || []), ...(salesOrders || [])];
    return all.find((o: any) => o.id === id || o.orderNo === id || o.orderId === id) || null;
  }, [id, adminOrders, salesOrders]);

  if (!order) {
    return (
      <div>
        <PageHeader title="Order not found" subtitle={`No order with id "${id}"`}
          actions={<Button variant="secondary" onClick={() => navigate("/sales-orders")}><ArrowLeft className="h-4 w-4" /> Back</Button>}
        />
      </div>
    );
  }

  const customer = getCustomer(order);
  const addressLines = getAddressLines(order);
  const items = getItems(order);
  const total = getTotal(order);
  const orderRef = getOrderRef(order);
  const orderStatus = String(order.orderStatus || order.status || "placed").toLowerCase();
  const paymentStatus = String(order.paymentStatus || "pending").toLowerCase();
  const paymentMode = String(order.paymentMethod || order.paymentMode || "COD").toUpperCase();
  const createdAt = order.createdAt || order.orderDate || order.date;

  return (
    <div className="space-y-4">
      <PageHeader
        title={`${customer.name} — ${orderRef}`}
        subtitle={`Created: ${formatDateTime(createdAt)}`}
        actions={<Button variant="secondary" onClick={() => navigate("/sales-orders")}><ArrowLeft className="h-4 w-4" /> Back to Orders</Button>}
      />

      {/* Info cards row */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {/* Customer */}
        <Card>
          <div className="p-4">
            <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-slate-400">Customer</p>
            <p className="font-semibold text-slate-900 dark:text-white">{customer.name}</p>
            {customer.email !== "—" && <p className="mt-0.5 text-sm text-slate-500">{customer.email}</p>}
            {customer.phone !== "—" && <p className="text-sm text-slate-500">{customer.phone}</p>}
          </div>
        </Card>

        {/* Status + payment */}
        <Card>
          <div className="p-4 space-y-2">
            <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-slate-400">Status</p>
            <div className="flex items-center gap-2">
              <span className="text-sm text-slate-500">Order:</span>
              <span className="inline-flex items-center rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-semibold text-blue-800 dark:bg-blue-900 dark:text-blue-200">
                {orderStatus.toUpperCase()}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm text-slate-500">Payment:</span>
              <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${paymentStatus === "paid" ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200" : "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200"}`}>
                {paymentStatus.toUpperCase()}
              </span>
            </div>
            <p className="text-sm text-slate-600 dark:text-slate-300">Mode: <strong>{paymentMode}</strong></p>
            <p className="text-sm font-bold text-slate-900 dark:text-white">Total: {fmt(total)}</p>
          </div>
        </Card>

        {/* Delivery address */}
        <Card>
          <div className="p-4">
            <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-slate-400">Delivery Address</p>
            {addressLines.length === 0
              ? <p className="text-sm text-slate-400">No address provided.</p>
              : addressLines.map((line, i) => <p key={i} className="text-sm text-slate-600 dark:text-slate-300">{line}</p>)
            }
          </div>
        </Card>
      </div>

      {/* Items table */}
      <Card>
        <div className="p-4">
          <p className="mb-4 text-sm font-semibold text-slate-900 dark:text-white">Order Items</p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-xs uppercase text-slate-400 dark:border-slate-700">
                  <th className="pb-2 pr-4">#</th>
                  <th className="pb-2 pr-4">Item</th>
                  <th className="pb-2 pr-4">Product ID</th>
                  <th className="pb-2 pr-4 text-right">Qty</th>
                  <th className="pb-2 pr-4 text-right">Unit Price</th>
                  <th className="pb-2 text-right">Line Total</th>
                </tr>
              </thead>
              <tbody>
                {items.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-10 text-center text-slate-400">No items found.</td>
                  </tr>
                ) : (
                  items.map((item: any, idx: number) => {
                    const qty = Number(item.quantity ?? item.qty ?? 1) || 1;
                    const price = Number(item.price ?? item.unitPrice ?? 0);
                    return (
                      <tr key={idx} className="border-b border-slate-100 dark:border-slate-800">
                        <td className="py-2 pr-4 text-slate-400">{idx + 1}</td>
                        <td className="py-2 pr-4 font-medium text-slate-800 dark:text-slate-100">
                          {item.name || item.title || item.productName || `Item ${idx + 1}`}
                        </td>
                        <td className="py-2 pr-4 text-xs text-slate-400">{item.productId || item.id || "—"}</td>
                        <td className="py-2 pr-4 text-right tabular-nums">{qty}</td>
                        <td className="py-2 pr-4 text-right tabular-nums">{fmt(price)}</td>
                        <td className="py-2 text-right font-semibold tabular-nums">{fmt(qty * price)}</td>
                      </tr>
                    );
                  })
                )}
              </tbody>
              {items.length > 0 && (
                <tfoot>
                  <tr className="border-t-2 border-slate-200 dark:border-slate-700">
                    <td colSpan={5} className="pt-3 pr-4 text-right font-semibold text-slate-900 dark:text-white">
                      Grand Total
                    </td>
                    <td className="pt-3 text-right text-lg font-bold tabular-nums text-slate-900 dark:text-white">
                      {fmt(total)}
                    </td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </div>
      </Card>
    </div>
  );
}

