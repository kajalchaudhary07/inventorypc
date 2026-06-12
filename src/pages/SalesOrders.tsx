import { useMemo, useState, useEffect } from "react";
import toast from "react-hot-toast";
import { Plus, FileText, Printer, Pencil, Save, X, MessageCircle, Trash2, Search, PackagePlus, Bell, Copy, Truck, Eye } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Button, Card, Input, Textarea, Select, PageHeader, Badge, Field } from "@/components/ui/primitives";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { Modal } from "@/components/ui/Modal";
import { useDataStore } from "@/store/dataStore";
import { useUIStore } from "@/store/uiStore";
import { setOrderStatus, updateOrderPricing, saveDoc, logActivity } from "@/services/data";
import { inr, fmtDateTime, uid, getOrderPaymentInfo } from "@/lib/utils";
import { lineGst, lineNet, orderTotals } from "@/lib/calc";
import { printInvoice, shareInvoiceWhatsapp } from "@/lib/invoice";
import { paymentReminderDraft, orderUpdateDraft, shareTextWhatsapp } from "@/lib/messages";
import { getMergedProducts } from "@/services/productOverrides";
import type { ExtraCharge, OrderLine, Product, SalesOrder, SalesStatus } from "@/types";

const STATUSES: SalesStatus[] = ["Pending", "Packed", "Delivered", "Cancelled", "Returned"];

function InvoiceModal({ order, onClose }: { order: SalesOrder | null; onClose: () => void }) {
  const settings = useUIStore((s) => s.settings);
  const adminProducts = useDataStore((s: any) => s.adminProducts || []);
  const inventoryProducts = useDataStore((s: any) => s.inventoryProducts || []);
  const adminCustomers = useDataStore((s: any) => s.adminCustomers || []);
  const salons = useDataStore((s) => s.salons || []);

  const mergedAdminProducts = useMemo(() => getMergedProducts(adminProducts), [adminProducts]);
  const allProducts = useMemo(() => {
    return [...mergedAdminProducts, ...inventoryProducts];
  }, [mergedAdminProducts, inventoryProducts]);

  const salonPhone = useDataStore((s) => (order ? s.salons.find((x) => x.id === order.salonId)?.phone : undefined));
  const [editing, setEditing] = useState(false);
  const [lines, setLines] = useState<OrderLine[]>([]);
  const [charges, setCharges] = useState<ExtraCharge[]>([]);
  const [note, setNote] = useState("");
  const [askSave, setAskSave] = useState(false);
  const [search, setSearch] = useState("");
  const [quickAdd, setQuickAdd] = useState(false);
  const [saving, setSaving] = useState(false);

  // Reset the working copy whenever a different order opens.
  useEffect(() => {
    setLines(order ? order.lines.map((l) => ({ ...l })) : []);
    setCharges(order?.extraCharges ? order.extraCharges.map((c) => ({ ...c })) : []);
    setNote(order?.invoiceNote ?? "");
    setEditing(false);
    setAskSave(false);
    setSaving(false);
    setSearch("");
    setQuickAdd(false);
  }, [order]);

  if (!order) return null;

  const totals = orderTotals(lines, charges);
  const dirty =
    JSON.stringify(lines) !== JSON.stringify(order.lines) ||
    JSON.stringify(charges) !== JSON.stringify(order.extraCharges ?? []) ||
    note !== (order.invoiceNote ?? "");

  // Edit by index (lines can repeat a productId or be newly added).
  const setLineAt = (i: number, patch: Partial<OrderLine>) =>
    setLines((prev) => prev.map((l, j) => (j === i ? { ...l, ...patch } : l)));
  const removeLineAt = (i: number) => setLines((prev) => prev.filter((_, j) => j !== i));

  const addProductLine = (p: any) => {
    setLines((prev) => [
      ...prev,
      {
        productId: p.id,
        name: p.name,
        sku: p.sku || "",
        qty: 1,
        price: Number(p.sellingPrice ?? p.price ?? 0),
        cost: Number(p.costPrice ?? 0),
        gstRate: Number(p.gstRate ?? 18),
        discount: 0,
      },
    ]);
    setSearch("");
  };

  const matches = search
    ? allProducts
        .filter((p) => {
          const name = (p.name || "").toLowerCase();
          const sku = (p.sku || "").toLowerCase();
          const q = search.trim().toLowerCase();
          return p.status === "active" && (name.includes(q) || sku.includes(q));
        })
        .slice(0, 6)
    : [];

  const addCharge = () => setCharges((prev) => [...prev, { id: uid(), label: "", amount: 0 }]);
  const setChargeAt = (i: number, patch: Partial<ExtraCharge>) =>
    setCharges((prev) => prev.map((c, j) => (j === i ? { ...c, ...patch } : c)));
  const removeChargeAt = (i: number) => setCharges((prev) => prev.filter((_, j) => j !== i));

  const cancelEdit = () => {
    setLines(order.lines.map((l) => ({ ...l })));
    setCharges(order.extraCharges ? order.extraCharges.map((c) => ({ ...c })) : []);
    setNote(order.invoiceNote ?? "");
    setEditing(false);
  };

  const applySave = async (updateMaster: boolean) => {
    if (saving) return;
    setSaving(true);
    try {
      await updateOrderPricing(order, lines, updateMaster, { extraCharges: charges, invoiceNote: note });
      toast.success(updateMaster ? "Invoice saved & product prices updated" : "Invoice saved");
      setAskSave(false);
      setEditing(false);
      onClose();
    } catch (err) {
      console.error("applySave error:", err);
      toast.error("Failed to save invoice changes. Please try again.");
      // Close the confirmation sub-dialog so the user can retry via Save Changes
      setAskSave(false);
    } finally {
      setSaving(false);
    }
  };

  // Working order used for print / WhatsApp so unsaved edits are reflected.
  const workingOrder: SalesOrder = { ...order, lines, extraCharges: charges, invoiceNote: note, ...totals };
  const { billAmount, amountPaid, balanceAmount, statusText, statusColor } = getOrderPaymentInfo(workingOrder);

  const paymentStatusColorClass = {
    emerald: "text-emerald-600 dark:text-emerald-400",
    amber: "text-amber-600 dark:text-amber-400",
    rose: "text-rose-600 dark:text-rose-400"
  }[statusColor as "emerald" | "amber" | "rose"] || "text-slate-600 dark:text-slate-400";

  return (
    <Modal
      open={!!order}
      onClose={onClose}
      title={`Invoice ${settings.invoicePrefix}${order.orderNo}`}
      wide
      footer={
        editing ? (
          <>
            <Button variant="secondary" onClick={cancelEdit}><X className="h-4 w-4" /> Cancel</Button>
            <Button variant="secondary" onClick={() => shareInvoiceWhatsapp(workingOrder, settings, salonPhone)}>
              <MessageCircle className="h-4 w-4" /> WhatsApp
            </Button>
            <Button onClick={() => (dirty ? setAskSave(true) : setEditing(false))} disabled={!dirty}>
              <Save className="h-4 w-4" /> Save changes
            </Button>
          </>
        ) : (
          <>
            <Button variant="secondary" onClick={() => setEditing(true)}><Pencil className="h-4 w-4" /> Edit invoice</Button>
            <Button variant="secondary" onClick={onClose}>Close</Button>
            <Button variant="secondary" onClick={() => shareInvoiceWhatsapp(workingOrder, settings, salonPhone)}>
              <MessageCircle className="h-4 w-4" /> WhatsApp
            </Button>
            <Button onClick={() => printInvoice(workingOrder, settings)}><Printer className="h-4 w-4" /> Print / PDF</Button>
          </>
        )
      }
    >
      <div className="space-y-4 text-sm">
        <div className="flex items-start justify-between">
          <div>
            <div className="text-base font-bold text-slate-900 dark:text-white">{settings.companyName}</div>
            <div className="text-xs text-slate-400">GST Invoice</div>
          </div>
          <div className="text-right text-xs text-slate-500">
            <div>{settings.invoicePrefix}{order.orderNo}</div>
            <div>{fmtDateTime(order.createdAt)}</div>
          </div>
        </div>
        <div className="rounded-lg bg-slate-50 p-3 dark:bg-slate-800">
          <div className="font-medium text-slate-900 dark:text-white">
            {(() => {
              const isPcOrder = (order.orderNo || "").startsWith("PC-") || (order.id || "").startsWith("PC-");
              if (isPcOrder) {
                const cid = order.salonId || (order as any).customerId || (order as any).userId || (order as any).uid || "";
                const salonObj = salons.find((s: any) => s.id === cid);
                const appCust = adminCustomers.find((c: any) => c.id === cid);
                
                const getField = (obj: any, keys: string[]) => {
                  for (const key of keys) {
                    if (obj && obj[key] !== undefined && obj[key] !== null && obj[key] !== "") {
                      return obj[key];
                    }
                  }
                  return "";
                };

                const customerName = order.salonName || getField(appCust, ["name", "customerName", "displayName", "ownerName"]) || getField(salonObj, ["ownerName", "name"]) || "-";
                const salonName = getField(salonObj, ["name"]) || getField(appCust, ["salonName", "salon"]) || "-";
                if (salonName && salonName !== "-") {
                  return `${salonName} (${customerName})`;
                }
                return customerName;
              }
              return order.salonName;
            })()}
          </div>
          <div className="text-xs text-slate-400">
            Channel: {order.channel} · Payment: <span className={`font-semibold ${paymentStatusColorClass}`}>{statusText}</span>
          </div>
        </div>

        {editing && (
          <div className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800 ring-1 ring-inset ring-amber-200 dark:bg-amber-950 dark:text-amber-300 dark:ring-amber-900">
            Editing this invoice. Item names, descriptions, qty, rate, discount and GST apply to this invoice only — they don't change the product master (unless you choose to on save). Cost is used for profit and never printed.
          </div>
        )}

        {editing ? (
          <div className="space-y-2">
            {lines.map((l, i) => (
              <div key={i} className="rounded-lg border border-slate-200 p-2.5 dark:border-slate-700">
                <div className="mb-2 flex items-center gap-2">
                  <Input value={l.name} onChange={(e) => setLineAt(i, { name: e.target.value })} placeholder="Item name" className="flex-1" />
                  <button onClick={() => removeLineAt(i)} className="rounded-lg p-2 text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950"><Trash2 className="h-4 w-4" /></button>
                </div>
                <Input value={l.description ?? ""} onChange={(e) => setLineAt(i, { description: e.target.value })} placeholder="Description (optional)" className="mb-2 text-xs" />
                <div className="grid grid-cols-5 gap-2">
                  <Labeled label="Qty"><Input type="number" min={1} value={l.qty} onChange={(e) => setLineAt(i, { qty: Number(e.target.value) })} /></Labeled>
                  <Labeled label="Rate"><Input type="number" step="0.01" min={0} value={l.price} onChange={(e) => setLineAt(i, { price: Number(e.target.value) })} /></Labeled>
                  <Labeled label="Cost"><Input type="number" step="0.01" min={0} value={l.cost} onChange={(e) => setLineAt(i, { cost: Number(e.target.value) })} /></Labeled>
                  <Labeled label="Disc"><Input type="number" step="0.01" min={0} value={l.discount} onChange={(e) => setLineAt(i, { discount: Number(e.target.value) })} /></Labeled>
                  <Labeled label="GST %"><Input type="number" step="0.01" min={0} value={l.gstRate} onChange={(e) => setLineAt(i, { gstRate: Number(e.target.value) })} /></Labeled>
                </div>
                <div className="mt-1.5 text-right text-xs text-slate-500">Amount: <span className="font-medium tabular-nums text-slate-700 dark:text-slate-200">{inr(lineNet(l) + lineGst(l))}</span></div>
              </div>
            ))}

            {/* Add existing product */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Add product — search name or SKU…" className="pl-9" />
              {matches.length > 0 && (
                <div className="absolute z-20 mt-1 w-full overflow-hidden rounded-lg border border-slate-200 bg-white shadow-lg dark:border-slate-700 dark:bg-slate-800">
                  {matches.map((p) => (
                    <button key={p.id} onClick={() => addProductLine(p)} className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-slate-100 dark:hover:bg-slate-700">
                      <span className="font-medium text-slate-900 dark:text-white">{p.name}</span>
                      <span className="text-xs text-slate-400">{inr(p.sellingPrice)} · GST {p.gstRate}%</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
            <Button variant="ghost" onClick={() => setQuickAdd(true)} className="text-indigo-600"><PackagePlus className="h-4 w-4" /> Create new product</Button>

            {/* Extra charges */}
            <div className="rounded-lg border border-slate-200 p-3 dark:border-slate-700">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">Extra charges</span>
                <button onClick={addCharge} className="inline-flex items-center gap-1 text-xs font-medium text-indigo-600"><Plus className="h-3.5 w-3.5" /> Add charge</button>
              </div>
              {charges.length === 0 && <p className="text-xs text-slate-400">No extra charges. Add surge, delivery, packaging, round-off, etc.</p>}
              <div className="space-y-2">
                {charges.map((c, i) => (
                  <div key={c.id} className="flex items-center gap-2">
                    <Input value={c.label} onChange={(e) => setChargeAt(i, { label: e.target.value })} placeholder="Charge name (e.g. Delivery)" className="flex-1" />
                    <Input type="number" step="0.01" value={c.amount} onChange={(e) => setChargeAt(i, { amount: Number(e.target.value) })} placeholder="Amount" className="w-28" />
                    <button onClick={() => removeChargeAt(i)} className="rounded-lg p-2 text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950"><Trash2 className="h-4 w-4" /></button>
                  </div>
                ))}
              </div>
            </div>

            <Field label="Invoice note (shown to customer on the invoice)">
              <Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Thank you for your business. Payment due within 7 days…" />
            </Field>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-xs uppercase text-slate-400 dark:border-slate-700">
                <th className="py-2">Item</th>
                <th className="py-2 text-right">Qty</th>
                <th className="py-2 text-right">SP</th>
                <th className="py-2 text-right">Cost</th>
                <th className="py-2 text-right">Margin/Profit</th>
                <th className="py-2 text-right">GST %</th>
                <th className="py-2 text-right">Amount</th>
              </tr>
            </thead>
            <tbody>
              {lines.map((l, i) => {
                const cost = Number(l.cost ?? 0);
                const hasCost = cost > 0;
                const marginVal = hasCost ? (l.price - cost) * l.qty - l.discount : 0;
                const displayCost = hasCost ? inr(cost) : "—";
                const displayMargin = hasCost ? inr(marginVal) : "—";
                return (
                  <tr key={i} className="border-b border-slate-100 dark:border-slate-800">
                    <td className="py-2 text-slate-700 dark:text-slate-200">
                      {l.name}
                      {l.description && <div className="text-xs text-slate-400">{l.description}</div>}
                    </td>
                    <td className="py-2 text-right tabular-nums">{l.qty}</td>
                    <td className="py-2 text-right tabular-nums">{inr(l.price)}</td>
                    <td className="py-2 text-right tabular-nums">{displayCost}</td>
                    <td className="py-2 text-right tabular-nums">{displayMargin}</td>
                    <td className="py-2 text-right tabular-nums">{l.gstRate}%</td>
                    <td className="py-2 text-right font-medium tabular-nums">{inr(lineNet(l) + lineGst(l))}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}

        <div className="ml-auto w-72 space-y-1 border-t border-slate-100 dark:border-slate-800 pt-3">
          <Line k="Subtotal" v={inr(totals.subtotal)} />
          {totals.discountTotal > 0 && <Line k="Discount" v={`- ${inr(totals.discountTotal)}`} />}
          {charges.map((c) => (
            <Line key={c.id} k={c.label || "Charge"} v={inr(c.amount)} />
          ))}
          <Line k="Total GST" v={inr(totals.gstTotal)} />
          <div className="border-t border-slate-200 my-1 pt-1 dark:border-slate-700"></div>
          <Line k="Bill Amount" v={inr(totals.total)} bold />
          <Line k="Amount Paid" v={inr(amountPaid)} />
          <Line k="Amount To Be Paid" v={inr(balanceAmount)} />
          <div className="flex justify-between text-sm text-slate-500 py-1">
            <span>Payment Status</span>
            <Badge color={statusColor}>{statusText}</Badge>
          </div>
          <Line k="Total Profit/Margin" v={inr(totals.profit)} />
        </div>

        {!editing && note && (
          <div className="rounded-lg bg-slate-50 p-3 text-xs text-slate-500 dark:bg-slate-800">{note}</div>
        )}
      </div>

      {/* Quick create-new-product */}
      <QuickAddProduct open={quickAdd} onClose={() => setQuickAdd(false)} defaultGst={settings.defaultGst} onCreated={(p) => { addProductLine(p); setQuickAdd(false); }} />

      {/* "Ask each time" save-scope prompt */}
      <Modal
        open={askSave}
        onClose={() => setAskSave(false)}
        title="Save invoice changes"
        footer={
          <>
            <Button variant="secondary" onClick={() => setAskSave(false)} disabled={saving}>Cancel</Button>
            <Button variant="secondary" onClick={() => applySave(false)} disabled={saving}>
              {saving ? "Saving…" : "This invoice only"}
            </Button>
            <Button onClick={() => applySave(true)} disabled={saving}>
              {saving ? "Saving…" : "Also update product prices"}
            </Button>
          </>
        }
      >
        <p className="text-sm text-slate-600 dark:text-slate-300">
          Save edits to <b>{order.orderNo}</b>. Item names, descriptions, charges and the note always apply to this invoice only.
          Should changed <b>rate/cost</b> also update the product master prices (affecting future orders)?
        </p>
      </Modal>
    </Modal>
  );
}

function Labeled({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-0.5 block text-[10px] uppercase tracking-wide text-slate-400">{label}</span>
      {children}
    </label>
  );
}

function QuickAddProduct({ open, onClose, defaultGst, onCreated }: { open: boolean; onClose: () => void; defaultGst: number; onCreated: (p: Product) => void }) {
  const [f, setF] = useState({ name: "", sku: "", brand: "", category: "", costPrice: 0, sellingPrice: 0, gstRate: defaultGst });
  const set = (k: keyof typeof f, v: string | number) => setF({ ...f, [k]: v });

  useEffect(() => { if (open) setF({ name: "", sku: "", brand: "", category: "", costPrice: 0, sellingPrice: 0, gstRate: defaultGst }); }, [open, defaultGst]);

  const create = async () => {
    if (f.name.trim().length < 2) { toast.error("Enter a product name"); return; }
    const p: Product = {
      id: uid(),
      name: f.name.trim(),
      sku: f.sku.trim() || f.name.trim().slice(0, 3).toUpperCase() + "-" + uid().slice(0, 4),
      brand: f.brand.trim(),
      category: f.category.trim() || "Uncategorized",
      unit: "pcs",
      stock: 0,
      reserved: 0,
      reorderLevel: 0,
      costPrice: Number(f.costPrice),
      sellingPrice: Number(f.sellingPrice),
      gstRate: Number(f.gstRate),
      status: "active",
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    await saveDoc("products", p);
    logActivity("Added product", "product", `${p.name} (from invoice)`, p.sku);
    toast.success("Product created & added to invoice");
    onCreated(p);
  };

  return (
    <Modal open={open} onClose={onClose} title="Create new product"
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button onClick={create}>Create & add</Button></>}>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Name"><Input value={f.name} onChange={(e) => set("name", e.target.value)} /></Field>
        <Field label="SKU"><Input value={f.sku} onChange={(e) => set("sku", e.target.value)} placeholder="(auto if blank)" /></Field>
        <Field label="Brand"><Input value={f.brand} onChange={(e) => set("brand", e.target.value)} /></Field>
        <Field label="Category"><Input value={f.category} onChange={(e) => set("category", e.target.value)} /></Field>
        <Field label="Cost price (₹)"><Input type="number" step="0.01" value={f.costPrice} onChange={(e) => set("costPrice", Number(e.target.value))} /></Field>
        <Field label="Selling price (₹)"><Input type="number" step="0.01" value={f.sellingPrice} onChange={(e) => set("sellingPrice", Number(e.target.value))} /></Field>
        <Field label="GST %"><Input type="number" step="0.01" value={f.gstRate} onChange={(e) => set("gstRate", Number(e.target.value))} /></Field>
      </div>
    </Modal>
  );
}

function Line({ k, v, bold }: { k: string; v: string; bold?: boolean }) {
  return <div className={`flex justify-between text-sm ${bold ? "font-bold text-slate-900 dark:text-white" : "text-slate-500"}`}><span>{k}</span><span className="tabular-nums">{v}</span></div>;
}

export default function SalesOrders() {
  const navigate = useNavigate();
  const adminOrders = useDataStore((s) => (s as any).adminOrders || []);
  const salesOrders = useDataStore((s) => s.salesOrders || []);
  const adminCustomers = useDataStore((s: any) => s.adminCustomers || []);
  const salons = useDataStore((s) => s.salons || []);

  // Normalize a Firestore Timestamp / Date / ms / ISO string → ms number
  const toMs = (ts: any): number => {
    if (!ts) return Date.now();
    if (typeof ts?.toDate === "function") return ts.toDate().getTime();
    if (ts instanceof Date) return ts.getTime();
    if (typeof ts === "number") return ts;
    const p = new Date(ts as string);
    return Number.isNaN(p.getTime()) ? Date.now() : p.getTime();
  };

  // Merge admin orders and inventory salesOrders. Prefer inventory-specific (salesOrders) when ids collide.
  const orders = useMemo(() => {
    const map = new Map<string, any>();
    // add inventory sales orders first (they take precedence)
    (salesOrders || []).forEach((o: any) => map.set(o.id, o));
    // add admin orders normalized so existing UI works
    (adminOrders || []).forEach((o: any) => {
      if (map.has(o.id)) return;
      const rawItems = Array.isArray(o.items) ? o.items : Array.isArray(o.lines) ? o.lines : [];
      const normalized = {
        // keep raw doc for detail page
        ...o,
        id: o.id,
        orderNo: o.orderNo || o.orderId || o.code || o.number || o.id,
        salonName:
          o.salonName ||
          o.contactDetails?.receiverName ||
          o.receiverName ||
          o.customerName ||
          o.customer?.name ||
          o.userName ||
          o.userId ||
          "-",
        salonId: o.salonId || o.customerId || o.userId || o.uid || null,
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
        channel: o.channel || o.source || "app",
        paymentStatus: o.paymentStatus || o.payment_status || "Pending",
        expectedDelivery: o.expectedDelivery,
      };
      map.set(o.id, normalized);
    });
    return Array.from(map.values());
  }, [adminOrders, salesOrders]);
  const [statusTab, setStatusTab] = useState("all");
  const [channel, setChannel] = useState("all");
  const [invoice, setInvoice] = useState<SalesOrder | null>(null);
  const [notify, setNotify] = useState<SalesOrder | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  const [dateFilter, setDateFilter] = useState<"all" | "week" | "month" | "custom">("all");
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");

  const dateFilteredOrders = useMemo(() => {
    return orders.filter((o) => {
      if (dateFilter === "all") return true;
      const ts = o.createdAt;
      if (dateFilter === "week") {
        return ts >= Date.now() - 7 * 86400000;
      }
      if (dateFilter === "month") {
        return ts >= Date.now() - 30 * 86400000;
      }
      if (dateFilter === "custom") {
        const start = customStart ? new Date(customStart).getTime() : 0;
        const end = customEnd ? new Date(customEnd).getTime() + 86400000 - 1 : Infinity;
        return ts >= start && ts <= end;
      }
      return true;
    });
  }, [orders, dateFilter, customStart, customEnd]);

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: dateFilteredOrders.length };
    STATUSES.forEach((s) => {
      c[s] = dateFilteredOrders.filter((o) => o.status === s).length;
    });
    return c;
  }, [dateFilteredOrders]);

  const rows = dateFilteredOrders
    .filter((o) => (statusTab === "all" || o.status === statusTab) && (channel === "all" || o.channel === channel))
    .filter((o) => {
      const q = searchQuery.trim().toLowerCase();
      if (!q) return true;
      return (
        (o.orderNo || "").toLowerCase().includes(q) ||
        (o.id || "").toLowerCase().includes(q) ||
        (o.salonName || "").toLowerCase().includes(q)
      );
    })
    .sort((a, b) => b.createdAt - a.createdAt);

  const { statTotalOrders, statRevenue, statProfit, statPending } = useMemo(() => {
    const totalOrders = dateFilteredOrders.length;
    const delivered = dateFilteredOrders.filter((o) => o.status === "Delivered");
    const revenue = delivered.reduce((sum, o) => sum + o.total, 0);
    const profit = delivered.reduce((sum, o) => sum + o.profit, 0);
    const pending = dateFilteredOrders.filter((o) => o.status === "Pending").length;
    return {
      statTotalOrders: totalOrders,
      statRevenue: revenue,
      statProfit: profit,
      statPending: pending,
    };
  }, [dateFilteredOrders]);

  const changeStatus = async (o: SalesOrder, status: SalesStatus) => {
    await setOrderStatus(o, status);
    toast.success(`${o.orderNo} → ${status}`);
  };

  return (
    <div>
      <PageHeader title="Sales Orders" subtitle="Unified orders from app, phone & WhatsApp."
        actions={<Button onClick={() => navigate("/new-order")}><Plus className="h-4 w-4" /> Manual Order</Button>} />

      {/* Date Filter & Stats Dashboard */}
      <div className="mt-4 space-y-4 animate-in fade-in duration-300">
        {/* Date Filter Bar */}
        <div className="flex flex-wrap items-center gap-2 rounded-lg bg-slate-50 p-3 dark:bg-slate-800/50">
          <span className="text-xs font-semibold uppercase tracking-wider text-slate-400 mr-2">Filter Date:</span>
          <div className="flex rounded-lg bg-slate-200/60 p-0.5 dark:bg-slate-900/60">
            {(["all", "week", "month", "custom"] as const).map((mode) => (
              <button
                key={mode}
                onClick={() => setDateFilter(mode)}
                className={`rounded-md px-3 py-1 text-xs font-medium transition ${
                  dateFilter === mode
                    ? "bg-white text-slate-900 shadow-sm dark:bg-slate-800 dark:text-white"
                    : "text-slate-500 hover:text-slate-900 dark:hover:text-white"
                }`}
              >
                {mode === "all" ? "All Time" : mode === "week" ? "Last Week" : mode === "month" ? "Last Month" : "Custom Range"}
              </button>
            ))}
          </div>

          {dateFilter === "custom" && (
            <div className="flex items-center gap-2 animate-in slide-in-from-left-2 duration-200">
              <input
                type="date"
                value={customStart}
                onChange={(e) => setCustomStart(e.target.value)}
                className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-white focus:outline-none"
              />
              <span className="text-xs text-slate-400">to</span>
              <input
                type="date"
                value={customEnd}
                onChange={(e) => setCustomEnd(e.target.value)}
                className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-white focus:outline-none"
              />
            </div>
          )}
        </div>

        {/* Top Summary Stats Cards */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Card className="p-4 flex justify-between items-start">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Total Orders</p>
              <h3 className="text-2xl font-bold text-slate-900 dark:text-white mt-1 tabular-nums">
                {statTotalOrders}
              </h3>
            </div>
            <div className="rounded-lg bg-blue-50 p-2 text-blue-500 dark:bg-blue-950/50 dark:text-blue-400">
              <FileText className="h-5 w-5" />
            </div>
          </Card>

          <Card className="p-4 flex justify-between items-start">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Revenue</p>
              <h3 className="text-2xl font-bold text-slate-900 dark:text-white mt-1 tabular-nums">
                {inr(statRevenue)}
              </h3>
              <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-0.5">delivered only</p>
            </div>
            <div className="rounded-lg bg-indigo-50 p-2 text-indigo-500 dark:bg-indigo-950/50 dark:text-indigo-400">
              <FileText className="h-5 w-5" />
            </div>
          </Card>

          <Card className="p-4 flex justify-between items-start">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Profit</p>
              <h3 className="text-2xl font-bold text-slate-900 dark:text-white mt-1 tabular-nums">
                {inr(statProfit)}
              </h3>
              <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-0.5">delivered only</p>
            </div>
            <div className="rounded-lg bg-emerald-50 p-2 text-emerald-500 dark:bg-emerald-950/50 dark:text-emerald-400">
              <FileText className="h-5 w-5" />
            </div>
          </Card>

          <Card className="p-4 flex justify-between items-start">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Pending</p>
              <h3 className="text-2xl font-bold text-slate-900 dark:text-white mt-1 tabular-nums">
                {statPending}
              </h3>
            </div>
            <div className="rounded-lg bg-amber-50 p-2 text-amber-500 dark:bg-amber-950/50 dark:text-amber-400">
              <FileText className="h-5 w-5" />
            </div>
          </Card>
        </div>
      </div>

      <div className="mb-4 mt-6 flex flex-wrap items-center gap-2">
        {["all", ...STATUSES].map((s) => {
          const isActive = statusTab === s;
          const count = s === "all" ? counts.all : counts[s];
          return (
            <button
              key={s}
              onClick={() => setStatusTab(s)}
              className={`rounded-full px-3.5 py-1.5 text-xs font-medium ring-1 ring-inset transition inline-flex items-center gap-1.5 ${
                isActive
                  ? "bg-slate-900 text-white ring-slate-900 dark:bg-white dark:text-slate-900"
                  : "bg-white text-slate-600 ring-slate-200 hover:bg-slate-50 dark:bg-slate-900 dark:text-slate-300 dark:ring-slate-700"
              }`}
            >
              <span>{s === "all" ? "All" : s}</span>
              <span
                className={`inline-flex items-center justify-center rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${
                  isActive
                    ? "bg-white/20 text-white"
                    : "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400"
                }`}
              >
                {count}
              </span>
            </button>
          );
        })}
        <Select value={channel} onChange={(e) => setChannel(e.target.value)} className="ml-auto w-auto">
          <option value="all">All channels</option>
          <option value="app">App</option>
          <option value="phone">Phone</option>
          <option value="whatsapp">WhatsApp</option>
          <option value="manual">Manual</option>
        </Select>
      </div>

      {/* Search Bar */}
      <div className="mb-4 mt-6 relative max-w-md">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <Input
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search by Order ID or Salon Name..."
          className="pl-9"
        />
      </div>

      <div className="space-y-3">
        {rows.map((o) => {
          const { billAmount, amountPaid, balanceAmount, statusText, statusColor } = getOrderPaymentInfo(o);
          return (
            <div key={o.id} onClick={() => navigate(`/orders/${o.id}`)} className="cursor-pointer">
              <Card className="p-4">
                <div className="flex flex-wrap items-center gap-3">
                  <div className="w-24">
                    <div className="font-semibold text-slate-900 dark:text-white">{o.orderNo}</div>
                    <div className="text-xs text-slate-400">{fmtDateTime(o.createdAt)}</div>
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium text-slate-700 dark:text-slate-200">
                      {(() => {
                        const isPcOrder = (o.orderNo || "").startsWith("PC-") || (o.id || "").startsWith("PC-");
                        if (isPcOrder) {
                          const cid = o.salonId || o.customerId || o.userId || o.uid || "";
                          const salonObj = salons.find((s: any) => s.id === cid);
                          const appCust = adminCustomers.find((c: any) => c.id === cid);
                          
                          const getField = (obj: any, keys: string[]) => {
                            for (const key of keys) {
                              if (obj && obj[key] !== undefined && obj[key] !== null && obj[key] !== "") {
                                return obj[key];
                              }
                            }
                            return "";
                          };

                          const customerName = o.salonName || getField(appCust, ["name", "customerName", "displayName", "ownerName"]) || getField(salonObj, ["ownerName", "name"]) || "-";
                          const salonName = getField(salonObj, ["name"]) || getField(appCust, ["salonName", "salon"]) || "-";
                          
                          if (salonName && salonName !== "-") {
                            return (
                              <span>
                                {salonName} <span className="text-xs text-slate-400 font-normal">({customerName})</span>
                              </span>
                            );
                          }
                          return <span>{customerName}</span>;
                        }
                        return o.salonName;
                      })()}
                    </div>
                    <div className="flex items-center gap-1.5 text-xs text-slate-400">
                      <StatusBadge value={o.channel} /> {o.lines.length} items · <Badge color={statusColor}>{statusText}</Badge>
                    </div>
                  </div>
                  <div className="text-right flex flex-col justify-center items-end text-xs">
                    <div>Bill: <span className="font-semibold tabular-nums text-slate-900 dark:text-white">{inr(billAmount)}</span></div>
                    <div>Paid: <span className="font-semibold tabular-nums text-slate-700 dark:text-slate-200">{inr(amountPaid)}</span></div>
                    <div>Bal: <span className="font-semibold tabular-nums text-rose-600 dark:text-rose-400">{inr(balanceAmount)}</span></div>
                    <div className="text-[10px] text-emerald-600">Profit: +{inr(o.profit)}</div>
                  </div>
                  <Select value={o.status} onChange={(e) => changeStatus(o, e.target.value as SalesStatus)} className="w-auto" onClick={(e) => e.stopPropagation()}>
                    {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                  </Select>
                  <Button variant="secondary" onClick={(e) => { e.stopPropagation(); navigate(`/orders/${o.id}`); }}><Eye className="h-4 w-4" /> Details</Button>
                  <Button variant="secondary" onClick={(e) => { e.stopPropagation(); setNotify(o); }}><Bell className="h-4 w-4" /> Notify</Button>
                  <Button variant="secondary" onClick={(e) => { e.stopPropagation(); setInvoice(o); }}><FileText className="h-4 w-4" /> Invoice</Button>
                </div>
              </Card>
            </div>
          );
        })}
        {!rows.length && <p className="py-10 text-center text-sm text-slate-400">No orders match these filters.</p>}
      </div>

      <InvoiceModal order={invoice} onClose={() => setInvoice(null)} />
      <NotifyModal order={notify} onClose={() => setNotify(null)} />
    </div>
  );
}

// ---- #4 / #5 customer notifications (payment reminder + delivery update) ----
function NotifyModal({ order, onClose }: { order: SalesOrder | null; onClose: () => void }) {
  const settings = useUIStore((s) => s.settings);
  const salonPhone = useDataStore((s) => (order ? s.salons.find((x) => x.id === order.salonId)?.phone : undefined));
  const [tab, setTab] = useState<"payment" | "delivery">("payment");
  const [eta, setEta] = useState("");
  const [text, setText] = useState("");

  useEffect(() => {
    if (!order) return;
    setTab(order.paymentStatus !== "Paid" ? "payment" : "delivery");
    setEta(order.expectedDelivery ? new Date(order.expectedDelivery).toISOString().slice(0, 10) : "");
  }, [order]);

  // Rebuild the draft whenever the order, tab, or ETA changes.
  useEffect(() => {
    if (!order) return;
    if (tab === "payment") {
      setText(paymentReminderDraft(order, settings));
    } else {
      const withEta: SalesOrder = { ...order, expectedDelivery: eta ? new Date(eta).getTime() : order.expectedDelivery };
      setText(orderUpdateDraft(withEta, settings));
    }
  }, [order, tab, eta, settings]);

  if (!order) return null;

  const saveEta = async () => {
    if (!eta) return;
    await saveDoc("salesOrders", { ...order, expectedDelivery: new Date(eta).getTime() });
    logActivity("Set delivery date", "salesOrder", `${order.orderNo} → ${eta}`, order.orderNo);
    toast.success("Expected delivery saved");
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success("Draft copied");
    } catch {
      toast.error("Couldn't copy — select and copy manually");
    }
  };

  return (
    <Modal
      open={!!order}
      onClose={onClose}
      title={`Notify customer — ${order.orderNo}`}
      wide
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Close</Button>
          <Button variant="secondary" onClick={copy}><Copy className="h-4 w-4" /> Copy</Button>
          <Button onClick={() => shareTextWhatsapp(text, salonPhone)}><MessageCircle className="h-4 w-4" /> WhatsApp</Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="flex gap-2">
          <button onClick={() => setTab("payment")} className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium ${tab === "payment" ? "bg-slate-900 text-white dark:bg-white dark:text-slate-900" : "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300"}`}>
            <Bell className="h-4 w-4" /> Payment reminder
          </button>
          <button onClick={() => setTab("delivery")} className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium ${tab === "delivery" ? "bg-slate-900 text-white dark:bg-white dark:text-slate-900" : "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300"}`}>
            <Truck className="h-4 w-4" /> Delivery update
          </button>
        </div>

        {tab === "payment" && order.paymentStatus === "Paid" && (
          <div className="rounded-lg bg-emerald-50 px-3 py-2 text-xs text-emerald-700 ring-1 ring-inset ring-emerald-200 dark:bg-emerald-950 dark:text-emerald-300 dark:ring-emerald-900">
            This order is already marked Paid — a reminder may not be needed.
          </div>
        )}

        {tab === "delivery" && (
          <div className="flex items-end gap-2">
            <Field label="Expected delivery date">
              <Input type="date" value={eta} onChange={(e) => setEta(e.target.value)} />
            </Field>
            <Button variant="secondary" onClick={saveEta} disabled={!eta}><Save className="h-4 w-4" /> Save date</Button>
          </div>
        )}

        <Field label="Draft message (editable, customer-facing only — no internal data)">
          <Textarea rows={12} value={text} onChange={(e) => setText(e.target.value)} className="font-mono text-xs" />
        </Field>
      </div>
    </Modal>
  );
}
