import { useMemo, useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import { Search, Plus, Minus, Trash2, ShoppingCart, Store, UserPlus, ChevronRight } from "lucide-react";
import { Button, Card, Input, Textarea, Select, PageHeader, Field } from "@/components/ui/primitives";
import { Modal } from "@/components/ui/Modal";
import { useDataStore } from "@/store/dataStore";
import { useUIStore } from "@/store/uiStore";
import { createSalesOrder, saveDoc, logActivity } from "@/services/data";
import { inr, uid } from "@/lib/utils";
import { orderTotals } from "@/lib/calc";
import type { OrderLine, PaymentStatus, SalesChannel, Salon } from "@/types";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyRecord = Record<string, any>;

const DRAFT_KEY = "manual_order_draft";

export default function ManualOrderEntry() {
  const navigate = useNavigate();
  const { salons } = useDataStore();
  const adminProducts = useDataStore((s: any) => s.adminProducts || []) as AnyRecord[];
  const adminCustomers = useDataStore((s: any) => s.adminCustomers || []);
  const defaultGst = useUIStore((s) => s.settings.defaultGst);
  const [salonId, setSalonId] = useState("");
  const [channel, setChannel] = useState<SalesChannel>("manual");
  const [payment, setPayment] = useState<PaymentStatus>("Unpaid");
  const [search, setSearch] = useState("");
  const [lines, setLines] = useState<OrderLine[]>([]);
  const [newSalonOpen, setNewSalonOpen] = useState(false);
  const [variantPickerProduct, setVariantPickerProduct] = useState<AnyRecord | null>(null);

  // ── Restore draft from localStorage on mount ─────────────────────────────
  useEffect(() => {
    try {
      const saved = localStorage.getItem(DRAFT_KEY);
      if (saved) {
        const draft = JSON.parse(saved);
        if (draft.lines?.length) setLines(draft.lines);
        if (draft.salonId) setSalonId(draft.salonId);
        if (draft.channel) setChannel(draft.channel);
        if (draft.payment) setPayment(draft.payment);
      }
    } catch { /* ignore corrupted draft */ }
  }, []);

  // ── Auto-save draft to localStorage on every change ──────────────────────
  useEffect(() => {
    localStorage.setItem(DRAFT_KEY, JSON.stringify({ lines, salonId, channel, payment }));
  }, [lines, salonId, channel, payment]);

  const matches = useMemo(
    () => (search
      ? adminProducts
          .filter((p: AnyRecord) => (p.name + (p.sku || "")).toLowerCase().includes(search.toLowerCase()))
          .slice(0, 8)
      : []),
    [search, adminProducts]
  );

  const addProduct = (p: AnyRecord, variant?: AnyRecord) => {
    const lineId = variant ? `${p.id}__${variant.id}` : p.id;
    const name = variant
      ? `${p.name} — ${variant.value || variant.shadeName || variant.name || variant.attribute || ""}`
      : p.name;
    const sku = variant?.sku || p.sku || "";
    const price = variant?.price ?? p.price ?? p.sellingPrice ?? 0;
    const cost = p.costPrice ?? 0;
    const gstRate = p.gstRate ?? defaultGst;

    setLines((prev) => {
      const exist = prev.find((l) => l.productId === lineId);
      if (exist) return prev.map((l) => l.productId === lineId ? { ...l, qty: l.qty + 1 } : l);
      return [...prev, { productId: lineId, name, sku, qty: 1, price, cost, gstRate, discount: 0 }];
    });
    setSearch("");
    setVariantPickerProduct(null);
  };

  const handleProductClick = (p: AnyRecord) => {
    if (p.variants && p.variants.length > 0) {
      setVariantPickerProduct(p);
    } else {
      addProduct(p);
    }
  };

  const update = (id: string, patch: Partial<OrderLine>) => setLines(lines.map((l) => l.productId === id ? { ...l, ...patch } : l));
  const totals = orderTotals(lines);

  const submit = async () => {
    const salon = salons.find((s) => s.id === salonId);
    const appCustomer = !salon ? adminCustomers.find((c: any) => c.id === salonId) : null;
    if (!salon && !appCustomer) { toast.error("Select a customer"); return; }
    if (!lines.length) { toast.error("Add at least one product"); return; }
    const customerName = salon
      ? salon.name
      : (appCustomer.name || appCustomer.displayName || appCustomer.email || "Customer");
    await createSalesOrder({
      id: uid(),
      orderNo: "SO-" + Math.floor(1000 + Math.random() * 9000),
      salonId: salonId,
      salonName: customerName,
      channel,
      lines,
      ...totals,
      status: "Pending",
      paymentStatus: payment,
      createdAt: Date.now(),
    });
    localStorage.removeItem(DRAFT_KEY);
    toast.success("Order created & stock updated");
    navigate("/sales-orders");
  };

  const clearDraft = () => {
    localStorage.removeItem(DRAFT_KEY);
    setLines([]);
    setSalonId("");
    setChannel("manual");
    setPayment("Unpaid");
    toast.success("Draft cleared");
  };

  // Called by the inline modal once a new salon is saved; auto-selects it.
  const handleSalonCreated = (salon: Salon) => {
    setSalonId(salon.id);
    setNewSalonOpen(false);
  };

  return (
    <div>
      <PageHeader title="Manual Order Entry" subtitle="Fast billing for phone & WhatsApp orders." />

      {/* Draft banner */}
      {lines.length > 0 && (
        <div className="mb-4 flex items-center justify-between rounded-lg border border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-800">
          <span>📋 Draft saved — {lines.length} item{lines.length > 1 ? "s" : ""} in order</span>
          <button onClick={clearDraft} className="text-xs underline hover:text-amber-900">Clear draft</button>
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card className="p-5">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search products by name or SKU…" className="pl-9" />
              {matches.length > 0 && (
                <div className="absolute z-20 mt-1 w-full overflow-hidden rounded-lg border border-slate-200 bg-white shadow-lg dark:border-slate-700 dark:bg-slate-800">
                  {matches.map((p: AnyRecord) => (
                    <button key={p.id} onClick={() => handleProductClick(p)} className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-slate-100 dark:hover:bg-slate-700">
                      <span>
                        <span className="font-medium text-slate-900 dark:text-white">{p.name}</span>
                        {p.variants?.length > 0 && (
                          <span className="ml-2 text-[10px] font-medium text-blue-600">{p.variants.length} variants</span>
                        )}
                        <span className="ml-2 text-xs text-slate-400">{p.stock ?? 0} left</span>
                      </span>
                      <span className="flex items-center gap-1 tabular-nums text-slate-500">
                        {inr(p.price ?? p.sellingPrice ?? 0)}
                        {p.variants?.length > 0 && <ChevronRight size={12} className="text-slate-400" />}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="mt-4 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-left text-xs uppercase text-slate-400 dark:border-slate-700">
                    <th className="py-2">Item</th><th className="py-2 text-center">Qty</th><th className="py-2 text-right">Price</th>
                    <th className="py-2 text-right">Disc</th><th className="py-2 text-right">GST%</th><th className="py-2 text-right">Total</th><th></th>
                  </tr>
                </thead>
                <tbody>
                  {lines.map((l) => (
                    <tr key={l.productId} className="border-b border-slate-100 dark:border-slate-800">
                      <td className="py-2">
                        <div className="font-medium text-slate-900 dark:text-white">{l.name}</div>
                        <div className="text-xs text-slate-400">{l.sku}</div>
                      </td>
                      <td className="py-2">
                        <div className="flex items-center justify-center gap-1">
                          <button onClick={() => update(l.productId, { qty: Math.max(1, l.qty - 1) })} className="rounded-md border border-slate-200 p-1 dark:border-slate-700"><Minus className="h-3 w-3" /></button>
                          <span className="w-8 text-center tabular-nums">{l.qty}</span>
                          <button onClick={() => update(l.productId, { qty: l.qty + 1 })} className="rounded-md border border-slate-200 p-1 dark:border-slate-700"><Plus className="h-3 w-3" /></button>
                        </div>
                      </td>
                      <td className="py-2 text-right tabular-nums">{inr(l.price)}</td>
                      <td className="py-2 text-right"><input type="number" value={l.discount} onChange={(e) => update(l.productId, { discount: Number(e.target.value) })} className="w-16 rounded border border-slate-200 px-1.5 py-1 text-right text-sm dark:border-slate-700 dark:bg-slate-800" /></td>
                      <td className="py-2 text-right tabular-nums text-slate-400">{l.gstRate}%</td>
                      <td className="py-2 text-right font-medium tabular-nums">{inr(l.price * l.qty - l.discount)}</td>
                      <td className="py-2 text-right"><button onClick={() => setLines(lines.filter((x) => x.productId !== l.productId))} className="text-rose-500"><Trash2 className="h-4 w-4" /></button></td>
                    </tr>
                  ))}
                  {!lines.length && <tr><td colSpan={7} className="py-10 text-center text-slate-400">Search and add products to build the order.</td></tr>}
                </tbody>
              </table>
            </div>
          </Card>
        </div>

        <div className="space-y-6">
          <Card className="p-5">
            <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-white"><Store className="h-4 w-4" /> Customer</h3>
            <div className="mb-1.5 flex items-center justify-between">
              <span className="text-sm font-medium text-slate-700 dark:text-slate-300">Salon</span>
              <button onClick={() => setNewSalonOpen(true)} className="inline-flex items-center gap-1 text-xs font-medium text-indigo-600 hover:text-indigo-500">
                <UserPlus className="h-3.5 w-3.5" /> Add new salon
              </button>
            </div>
            <Select value={salonId} onChange={(e) => setSalonId(e.target.value)}>
              <option value="">— select customer —</option>
              {salons.length > 0 && (
                <optgroup label="Salon Customers (B2B)">
                  {salons.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </optgroup>
              )}
              {adminCustomers.length > 0 && (
                <optgroup label="App Customers">
                  {adminCustomers.map((c: any) => (
                    <option key={c.id} value={c.id}>
                      {c.name || c.displayName || c.email || "Unknown"}
                    </option>
                  ))}
                </optgroup>
              )}
            </Select>
            {salonId && (() => {
              const sel = salons.find((s) => s.id === salonId);
              return sel?.description ? <p className="mt-2 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-500 dark:bg-slate-800">{sel.description}</p> : null;
            })()}
            <div className="mt-3 grid grid-cols-2 gap-3">
              <Field label="Channel">
                <Select value={channel} onChange={(e) => setChannel(e.target.value as SalesChannel)}>
                  <option value="manual">Manual</option><option value="phone">Phone</option><option value="whatsapp">WhatsApp</option><option value="app">App</option>
                </Select>
              </Field>
              <Field label="Payment">
                <Select value={payment} onChange={(e) => setPayment(e.target.value as PaymentStatus)}>
                  <option value="Unpaid">Unpaid</option><option value="Partial">Partial</option><option value="Paid">Paid</option>
                </Select>
              </Field>
            </div>
          </Card>

          <Card className="p-5">
            <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-white"><ShoppingCart className="h-4 w-4" /> Summary</h3>
            <div className="space-y-1.5 text-sm">
              <Row k="Subtotal" v={inr(totals.subtotal)} />
              <Row k="Discount" v={`- ${inr(totals.discountTotal)}`} />
              <Row k="GST" v={inr(totals.gstTotal)} />
              <div className="border-t border-slate-200 pt-1.5 dark:border-slate-700"><Row k="Total" v={inr(totals.total)} bold /></div>
              <Row k="Est. profit" v={inr(totals.profit)} accent="text-emerald-600" />
            </div>
            <Button className="mt-4 w-full" onClick={submit}>Create order</Button>
          </Card>
        </div>
      </div>

      <NewSalonModal open={newSalonOpen} onClose={() => setNewSalonOpen(false)} onCreated={handleSalonCreated} />

      {/* Variant picker modal */}
      {variantPickerProduct && (
        <Modal
          open={!!variantPickerProduct}
          onClose={() => setVariantPickerProduct(null)}
          title={`Select variant — ${variantPickerProduct.name}`}
          footer={<Button variant="ghost" onClick={() => setVariantPickerProduct(null)}>Cancel</Button>}
        >
          <div className="p-4 space-y-2">
            {variantPickerProduct.variants.map((v: AnyRecord) => (
              <button
                key={v.id}
                onClick={() => addProduct(variantPickerProduct, v)}
                className="flex w-full items-center justify-between rounded-lg border border-slate-200 px-4 py-3 text-left hover:bg-slate-50 hover:border-slate-400 transition"
              >
                <div>
                  <p className="font-medium text-slate-900">{v.value || v.shadeName || v.name || v.attribute || v.id}</p>
                  {v.sku && <p className="text-xs text-slate-400 font-mono">{v.sku}</p>}
                </div>
                <div className="text-right">
                  <p className="font-semibold text-slate-900">{inr(v.price ?? variantPickerProduct.price ?? 0)}</p>
                  {v.stock != null && (
                    <p className={`text-xs ${v.stock > 0 ? "text-green-600" : "text-red-500"}`}>{v.stock} left</p>
                  )}
                </div>
              </button>
            ))}
          </div>
        </Modal>
      )}
    </div>
  );
}

function NewSalonModal({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: (s: Salon) => void }) {
  const [form, setForm] = useState({ name: "", ownerName: "", phone: "", gstin: "", address: "", region: "", branchNo: "", description: "" });
  const set = (k: keyof typeof form, v: string) => setForm({ ...form, [k]: v });

  const save = async () => {
    if (form.name.trim().length < 2) { toast.error("Enter a salon name"); return; }
    const salon: Salon = {
      id: uid(),
      name: form.name.trim(),
      ownerName: form.ownerName.trim(),
      phone: form.phone.trim(),
      gstin: form.gstin.trim() || undefined,
      address: form.address.trim() || undefined,
      region: form.region.trim() || undefined,
      branchNo: form.branchNo.trim() || undefined,
      description: form.description.trim() || undefined,
      outstanding: 0,
      totalPurchases: 0,
      createdAt: Date.now(),
    };
    await saveDoc("salons", salon);
    logActivity("Added salon", "salon", `${salon.name} (from manual order)`);
    toast.success("Salon added & selected");
    setForm({ name: "", ownerName: "", phone: "", gstin: "", address: "", region: "", branchNo: "", description: "" });
    onCreated(salon);
  };

  return (
    <Modal open={open} onClose={onClose} title="Add New Salon"
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button onClick={save}>Add & select</Button></>}>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Salon name"><Input value={form.name} onChange={(e) => set("name", e.target.value)} /></Field>
        <Field label="Owner name"><Input value={form.ownerName} onChange={(e) => set("ownerName", e.target.value)} /></Field>
        <Field label="Phone"><Input value={form.phone} onChange={(e) => set("phone", e.target.value)} /></Field>
        <Field label="GSTIN"><Input value={form.gstin} onChange={(e) => set("gstin", e.target.value)} /></Field>
        <Field label="Region / City"><Input value={form.region} onChange={(e) => set("region", e.target.value)} placeholder="Mumbai, Thane, Pune…" /></Field>
        <Field label="Branch No"><Input value={form.branchNo} onChange={(e) => set("branchNo", e.target.value)} placeholder="e.g. B-2 (optional)" /></Field>
        <div className="sm:col-span-2"><Field label="Address"><Input value={form.address} onChange={(e) => set("address", e.target.value)} /></Field></div>
        <div className="sm:col-span-2"><Field label="Description / notes"><Textarea rows={3} value={form.description} onChange={(e) => set("description", e.target.value)} placeholder="Preferred brands, delivery notes, payment terms…" /></Field></div>
      </div>
    </Modal>
  );
}

function Row({ k, v, bold, accent }: { k: string; v: string; bold?: boolean; accent?: string }) {
  return <div className={`flex justify-between ${bold ? "font-bold text-slate-900 dark:text-white" : "text-slate-500"} ${accent ?? ""}`}><span>{k}</span><span className="tabular-nums">{v}</span></div>;
}
