import { useMemo, useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useDataStore } from "@/store/dataStore";
import { mergeOrders } from "@/services/orderMerger";
import { Card, PageHeader, Button } from "@/components/ui/primitives";
import { inr, getOrderPaymentInfo } from "@/lib/utils";
import { saveOrderPayment } from "@/services/data";
import { ArrowLeft } from "lucide-react";
import toast from "react-hot-toast";

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
  const rawAdminOrders = useDataStore((s: any) => s.adminOrders || []);
  const rawSalesOrders = useDataStore((s: any) => s.salesOrders || []);
  const rawAdminCustomers = useDataStore((s: any) => s.adminCustomers || []);
  const rawSalons = useDataStore((s: any) => s.salons || []);

  const adminOrders = useMemo(() => rawAdminOrders.filter((o: any) => o.isDeleted !== true), [rawAdminOrders]);
  const adminCustomers = useMemo(() => rawAdminCustomers.filter((c: any) => c.isDeleted !== true), [rawAdminCustomers]);
  const salons = useMemo(() => rawSalons.filter((s: any) => s.isDeleted !== true), [rawSalons]);

  const orders = useMemo(() => {
    return mergeOrders(adminOrders, rawSalesOrders, salons, adminCustomers);
  }, [adminOrders, rawSalesOrders, salons, adminCustomers]);

  const order = useMemo(() => {
    return orders.find((o: any) => o.id === id || o.orderNo === id || o.orderId === id) || null;
  }, [id, orders]);

  const [localVersion, setLocalVersion] = useState(0);

  const paymentInfo = useMemo(() => {
    if (!order) return null;
    return getOrderPaymentInfo(order);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [order, localVersion]);

  const [editPaidAmount, setEditPaidAmount] = useState("");

  // Synchronize input with current persisted amount
  useEffect(() => {
    if (paymentInfo) {
      setEditPaidAmount(String(paymentInfo.amountPaid));
    }
  }, [paymentInfo]);

  const handleSavePayment = async () => {
    if (!order) return;
    const amount = Number(editPaidAmount);
    if (isNaN(amount) || amount < 0) {
      toast.error("Please enter a valid amount");
      return;
    }
    try {
      await saveOrderPayment(order.id, amount);
      // Force re-evaluation of payment details
      setLocalVersion((v) => v + 1);
      toast.success("Payment amount updated successfully!");
    } catch (err) {
      console.error("Error saving payment:", err);
      toast.error("Failed to save payment");
    }
  };

  const normalizedItems = useMemo(() => {
    const raw = getItems(order);
    return raw.map((item: any) => {
      const qty = Number(item.quantity ?? item.qty ?? 1) || 1;
      const price = Number(item.price ?? item.unitPrice ?? 0);
      const cost = Number(item.cost ?? item.costPrice ?? 0);
      const gstRate = Number(item.gstRate ?? item.gstPercent ?? item.gst ?? 0);
      const discount = Number(item.discount ?? 0);

      const profit = (price - cost) * qty;

      const netAmount = price * qty - discount;
      const gstAmount = (netAmount * gstRate) / 100;
      const lineTotal = netAmount + gstAmount;

      return {
        name: item.name || item.title || item.productName || "Item",
        qty,
        price,
        cost,
        gstRate,
        discount,
        profit,
        lineTotal
      };
    });
  }, [order]);

  const totalGst = useMemo(() => {
    return normalizedItems.reduce((acc, item) => {
      const netAmount = item.price * item.qty - item.discount;
      return acc + (netAmount * item.gstRate) / 100;
    }, 0);
  }, [normalizedItems]);

  const totalProfit = useMemo(() => {
    return normalizedItems.reduce((acc, item) => {
      return acc + (item.price - item.cost) * item.qty;
    }, 0);
  }, [normalizedItems]);

  if (!order) {
    return (
      <div>
        <PageHeader title="Order not found" subtitle={`No order with id "${id}"`}
          actions={<Button variant="secondary" onClick={() => navigate("/sales-orders")}><ArrowLeft className="h-4 w-4" /> Back</Button>}
        />
      </div>
    );
  }

  const customer = useMemo(() => {
    const fallback = getCustomer(order);
    if (!order) return fallback;
    const cid = order.salonId || order.customerId || order.userId || order.uid || "";
    const appCust = adminCustomers.find((c: any) => c.id === cid);
    const salon = salons.find((s: any) => s.id === cid);
    const matched = appCust || salon;

    const getField = (obj: any, keys: string[]) => {
      for (const key of keys) {
        if (obj && obj[key] !== undefined && obj[key] !== null && obj[key] !== "") {
          return obj[key];
        }
      }
      return "";
    };

    const orderRefStr = order.orderNo || order.orderId || order.code || order.number || order.id || "";
    const isPcOrder = String(orderRefStr).startsWith("PC-");

    let name = fallback.name;
    let email = fallback.email;
    let phone = fallback.phone;

    if (matched) {
      const customerName = getField(matched, ["name", "customerName", "ownerName", "displayName"]) || fallback.name || "-";
      const salonName = getField(matched, ["salonName", "salon"]) || (matched.name && matched.ownerName ? matched.name : "") || "-";
      email = getField(matched, ["email", "customerEmail", "ownerEmail", "salonEmail", "userEmail"]) || fallback.email || "-";
      phone = getField(matched, ["phone", "mobile", "phoneNumber", "customerPhone", "ownerPhone"]) || fallback.phone || "-";

      if (isPcOrder) {
        name = salonName && salonName !== "-" && salonName !== customerName
          ? `${salonName} (${customerName})`
          : customerName;
      } else {
        name = customerName;
      }
    }

    if (name === "—" || name === "") name = "-";
    if (email === "—" || email === "") email = "-";
    if (phone === "—" || phone === "") phone = "-";

    return { name, email, phone };
  }, [order, adminCustomers, salons]);
  const addressLines = getAddressLines(order);
  const orderRef = getOrderRef(order);
  const orderStatus = String(order.orderStatus || order.status || "placed").toLowerCase();
  const paymentMode = String(order.paymentMethod || order.paymentMode || "COD").toUpperCase();
  const createdAt = order.createdAt || order.orderDate || order.date;

  const badgeClasses = paymentInfo
    ? {
      emerald: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200",
      amber: "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200",
      rose: "bg-rose-100 text-rose-800 dark:bg-rose-900 dark:text-rose-200"
    }[paymentInfo.statusColor as "emerald" | "amber" | "rose"] || "bg-slate-100 text-slate-800 dark:bg-slate-900 dark:text-slate-200"
    : "bg-slate-100 text-slate-800 dark:bg-slate-900 dark:text-slate-200";

  return (
    <div className="space-y-4">
      <PageHeader
        title={`${customer.name} — ${orderRef}`}
        subtitle={
          <div className="flex flex-col gap-1 sm:flex-row sm:gap-4 text-xs text-slate-500 mt-1">
            <div>Order Placed: {formatDateTime(createdAt)}</div>
            {order.updatedAt && Math.abs(order.updatedAt - createdAt) > 60000 && (
              <div className="text-indigo-600 dark:text-indigo-400 font-medium">Last Updated: {formatDateTime(order.updatedAt)}</div>
            )}
          </div>
        }
        actions={<Button variant="secondary" onClick={() => navigate("/sales-orders")}><ArrowLeft className="h-4 w-4" /> Back to Orders</Button>}
      />

      {order.isAdminDeleted && (
        <div className="rounded-lg bg-rose-50 p-3.5 text-sm font-semibold text-rose-800 ring-1 ring-inset ring-rose-200 dark:bg-rose-950/30 dark:text-rose-400 dark:ring-rose-900 animate-in fade-in duration-300">
          ⚠️ This order was deleted from the Admin/E-Commerce Dashboard. The local inventory overrides and payment records are preserved here.
        </div>
      )}

      {/* Info cards row */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {/* Customer */}
        <Card>
          <div className="p-4">
            <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-slate-400">Customer</p>
            <p className="font-semibold text-slate-900 dark:text-white">{customer.name}</p>
            {customer.email !== "-" && <p className="mt-0.5 text-sm text-slate-500">{customer.email}</p>}
            {customer.phone !== "-" && <p className="text-sm text-slate-500">{customer.phone}</p>}
          </div>
        </Card>

        {/* Status + payment */}
        <Card>
          <div className="p-4 space-y-2">
            <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-slate-400">Status & Payment</p>
            <div className="flex items-center justify-between">
              <span className="text-sm text-slate-500">Order Status:</span>
              <span className="inline-flex items-center rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-semibold text-blue-800 dark:bg-blue-900 dark:text-blue-200">
                {orderStatus.toUpperCase()}
              </span>
            </div>
            {paymentInfo && (
              <>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-slate-500">Payment Status:</span>
                  <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${badgeClasses}`}>
                    {paymentInfo.statusText.toUpperCase()}
                  </span>
                </div>
                <div className="text-sm text-slate-600 dark:text-slate-300 flex justify-between">
                  <span>Payment Mode:</span>
                  <strong>{paymentMode}</strong>
                </div>
                <div className="border-t border-slate-100 dark:border-slate-800 pt-2 space-y-1">
                  <div className="flex justify-between text-xs">
                    <span className="text-slate-500">Bill Amount:</span>
                    <span className="font-semibold text-slate-900 dark:text-white">{inr(paymentInfo.billAmount)}</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-slate-500">Amount Paid:</span>
                    <span className="font-semibold text-slate-700 dark:text-slate-200">{inr(paymentInfo.amountPaid)}</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-slate-500">Amount To Be Paid:</span>
                    <span className={`font-semibold ${paymentInfo.balanceAmount > 0 ? "text-rose-600" : "text-slate-950 dark:text-white"}`}>{inr(paymentInfo.balanceAmount)}</span>
                  </div>
                </div>

                {/* Input control to edit customer paid amount */}
                <div className="border-t border-slate-100 dark:border-slate-800 pt-2 mt-2">
                  <label className="block text-[10px] uppercase font-semibold text-slate-400 mb-1">
                    Update Amount Paid (₹)
                  </label>
                  <div className="flex gap-1.5">
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      className="w-full rounded-lg border border-slate-200 px-2 py-1 text-sm bg-white dark:bg-slate-900 dark:border-slate-700 text-slate-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-slate-400"
                      value={editPaidAmount}
                      onChange={(e) => setEditPaidAmount(e.target.value)}
                      placeholder="Amount"
                    />
                    <button
                      onClick={handleSavePayment}
                      className="rounded-lg bg-slate-900 hover:bg-slate-800 text-white dark:bg-white dark:text-slate-900 dark:hover:bg-slate-100 px-3 py-1 text-xs font-medium transition"
                    >
                      Save
                    </button>
                  </div>
                </div>
              </>
            )}
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
                  <th className="pb-2 pr-4 text-right">Qty</th>
                  <th className="pb-2 pr-4 text-right">SP</th>
                  <th className="pb-2 pr-4 text-right">Cost</th>
                  <th className="pb-2 pr-4 text-right">Margin/Profit</th>
                  <th className="pb-2 pr-4 text-right">GST %</th>
                  <th className="pb-2 text-right">Line Total</th>
                </tr>
              </thead>
              <tbody>
                {normalizedItems.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-10 text-center text-slate-400">No items found.</td>
                  </tr>
                ) : (
                  normalizedItems.map((item: any, idx: number) => {
                    const displayCost = item.cost > 0 ? inr(item.cost) : "—";
                    const displayProfit = item.cost > 0 ? inr(item.profit) : "—";
                    return (
                      <tr key={idx} className="border-b border-slate-100 dark:border-slate-800">
                        <td className="py-2 pr-4 text-slate-400">{idx + 1}</td>
                        <td className="py-2 pr-4 font-medium text-slate-800 dark:text-slate-100">
                          {item.name}
                        </td>
                        <td className="py-2 pr-4 text-right tabular-nums">{item.qty}</td>
                        <td className="py-2 pr-4 text-right tabular-nums">{inr(item.price)}</td>
                        <td className="py-2 pr-4 text-right tabular-nums">{displayCost}</td>
                        <td className="py-2 pr-4 text-right tabular-nums">{displayProfit}</td>
                        <td className="py-2 pr-4 text-right tabular-nums">{item.gstRate}%</td>
                        <td className="py-2 text-right font-semibold tabular-nums">{inr(item.lineTotal)}</td>
                      </tr>
                    );
                  })
                )}
              </tbody>
              {normalizedItems.length > 0 && paymentInfo && (
                <tfoot>
                  <tr className="border-t border-slate-200 dark:border-slate-700">
                    <td colSpan={7} className="pt-3 pr-4 text-right font-medium text-slate-500">
                      Bill Amount
                    </td>
                    <td className="pt-3 text-right font-bold tabular-nums text-slate-900 dark:text-white">
                      {inr(paymentInfo.billAmount)}
                    </td>
                  </tr>
                  <tr>
                    <td colSpan={7} className="py-1 pr-4 text-right font-medium text-slate-500">
                      Amount Paid
                    </td>
                    <td className="py-1 text-right font-semibold tabular-nums text-slate-900 dark:text-white">
                      {inr(paymentInfo.amountPaid)}
                    </td>
                  </tr>
                  <tr>
                    <td colSpan={7} className="py-1 pr-4 text-right font-medium text-slate-500">
                      Amount To Be Paid
                    </td>
                    <td className="py-1 text-right font-semibold tabular-nums text-rose-600 dark:text-rose-400">
                      {inr(paymentInfo.balanceAmount)}
                    </td>
                  </tr>
                  <tr>
                    <td colSpan={7} className="py-1 pr-4 text-right font-medium text-slate-500">
                      Payment Status
                    </td>
                    <td className="py-1 text-right tabular-nums">
                      <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${badgeClasses}`}>
                        {paymentInfo.statusText.toUpperCase()}
                      </span>
                    </td>
                  </tr>
                  <tr>
                    <td colSpan={7} className="py-1 pr-4 text-right font-medium text-slate-500">
                      Total GST
                    </td>
                    <td className="py-1 text-right font-semibold tabular-nums text-slate-900 dark:text-white">
                      {inr(totalGst)}
                    </td>
                  </tr>
                  <tr className="border-b border-slate-200 dark:border-slate-700">
                    <td colSpan={7} className="pb-3 pr-4 text-right font-medium text-slate-500">
                      Total Profit/Margin
                    </td>
                    <td className="pb-3 text-right font-bold tabular-nums text-emerald-600 dark:text-emerald-400">
                      +{inr(totalProfit)}
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

