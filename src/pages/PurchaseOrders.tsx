import { useMemo, useState, useEffect } from "react";
import toast from "react-hot-toast";
import { Plus, Truck, Trash2, PackageCheck, Eye, Search } from "lucide-react";
import { Button, Card, Field, Input, Select, PageHeader, StatCard, Badge } from "@/components/ui/primitives";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { Modal } from "@/components/ui/Modal";
import { useDataStore } from "@/store/dataStore";
import { saveDoc, receivePurchase, logActivity, savePOPayment } from "@/services/data";
import { inr, num, fmtDate, uid } from "@/lib/utils";
import type { PurchaseLine, PurchaseOrder } from "@/types";
import { getMergedProducts } from "@/services/productOverrides";

function CreatePO({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { vendors } = useDataStore();
  const adminProducts = useDataStore((s: any) => s.adminProducts || []);
  const inventoryProducts = useDataStore((s: any) => s.inventoryProducts || []);

  const mergedAdminProducts = useMemo(() => getMergedProducts(adminProducts), [adminProducts]);
  const products = useMemo(() => {
    return [...mergedAdminProducts, ...inventoryProducts];
  }, [mergedAdminProducts, inventoryProducts]);
  const [vendorId, setVendorId] = useState("");
  const [lines, setLines] = useState<PurchaseLine[]>([]);
  const [vendorSearch, setVendorSearch] = useState("");
  const [showVendorMatches, setShowVendorMatches] = useState(false);
  const [productSearch, setProductSearch] = useState("");
  const [showProductMatches, setShowProductMatches] = useState(false);

  useEffect(() => {
    if (open) {
      setVendorId("");
      setVendorSearch("");
      setProductSearch("");
      setLines([]);
    }
  }, [open]);

  const addLine = (productId: string) => {
    const p = products.find((x) => x.id === productId);
    if (!p || lines.some((l) => l.productId === productId)) return;
    setLines([...lines, { productId: p.id, name: p.name, sku: p.sku, qty: 10, received: 0, cost: p.costPrice }]);
  };
  const total = lines.reduce((s, l) => s + l.qty * l.cost, 0);

  const submit = async () => {
    const vendor = vendors.find((v) => v.id === vendorId);
    if (!vendor || !lines.length) { toast.error("Pick a vendor and at least one product"); return; }
    
    // Clean lines to prevent undefined or NaN values from crashing Firestore
    const cleanedLines = lines.map(l => ({
      productId: l.productId,
      name: l.name,
      sku: l.sku || "",
      qty: Number(l.qty) || 0,
      received: Number(l.received) || 0,
      cost: Number(l.cost) || 0
    }));

    const finalTotal = cleanedLines.reduce((s, l) => s + l.qty * l.cost, 0);

    const po: PurchaseOrder = {
      id: uid(),
      poNo: "PO-" + Math.floor(2000 + Math.random() * 8000),
      vendorId: vendor.id,
      vendorName: vendor.name,
      lines: cleanedLines,
      total: finalTotal,
      status: "Sent",
      createdAt: Date.now(),
    };

    try {
      await saveDoc("purchaseOrders", po);
      logActivity("Created PO", "purchaseOrder", `${po.poNo} · ${vendor.name} · ${inr(finalTotal)}`, po.poNo);
      toast.success("Purchase order created");
      setVendorId(""); setLines([]); onClose();
    } catch (err: any) {
      console.error("Failed to create PO:", err);
      toast.error(`Failed to create PO: ${err.message || err}`);
    }
  };

  const matchingVendors = useMemo(() => {
    const q = vendorSearch.trim().toLowerCase();
    if (!q) return vendors;
    return vendors.filter((v) => v.name.toLowerCase().includes(q));
  }, [vendors, vendorSearch]);

  const matchingProducts = useMemo(() => {
    const q = productSearch.trim().toLowerCase();
    if (!q) return [];
    return products.filter((p) => 
      p.name.toLowerCase().includes(q) || 
      p.sku.toLowerCase().includes(q)
    );
  }, [products, productSearch]);

  return (
    <Modal open={open} onClose={onClose} title="Create Purchase Order" wide
      footer={<><span className="mr-auto text-sm font-semibold">Total: {inr(total)}</span><Button variant="secondary" onClick={onClose}>Cancel</Button><Button onClick={submit}>Create PO</Button></>}>
      <Field label="Vendor">
        <div className="relative">
          <Input
            value={vendorSearch}
            onChange={(e) => {
              setVendorSearch(e.target.value);
              setVendorId(""); // Clear vendor ID if they edit it
              setShowVendorMatches(true);
            }}
            onFocus={() => setShowVendorMatches(true)}
            onBlur={() => setTimeout(() => setShowVendorMatches(false), 200)}
            placeholder="Search vendor by name..."
          />
          {showVendorMatches && matchingVendors.length > 0 && (
            <div className="absolute z-30 mt-1 max-h-60 w-full overflow-y-auto rounded-lg border border-slate-200 bg-white shadow-lg dark:border-slate-700 dark:bg-slate-800">
              {matchingVendors.map((v) => (
                <button
                  key={v.id}
                  onClick={() => {
                    setVendorId(v.id);
                    setVendorSearch(v.name);
                    setShowVendorMatches(false);
                  }}
                  className="flex w-full px-3 py-2 text-left text-sm hover:bg-slate-100 dark:hover:bg-slate-700 font-medium text-slate-900 dark:text-white"
                >
                  {v.name}
                </button>
              ))}
            </div>
          )}
        </div>
      </Field>
      <div className="mt-4">
        <Field label="Add product">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input
              value={productSearch}
              onChange={(e) => {
                setProductSearch(e.target.value);
                setShowProductMatches(true);
              }}
              onFocus={() => setShowProductMatches(true)}
              onBlur={() => setTimeout(() => setShowProductMatches(false), 200)}
              placeholder="Search product by name or SKU..."
              className="pl-9"
            />
            {showProductMatches && matchingProducts.length > 0 && (
              <div className="absolute z-30 mt-1 max-h-60 w-full overflow-y-auto rounded-lg border border-slate-200 bg-white shadow-lg dark:border-slate-700 dark:bg-slate-800">
                {matchingProducts.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => {
                      addLine(p.id);
                      setProductSearch("");
                      setShowProductMatches(false);
                    }}
                    className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-slate-100 dark:hover:bg-slate-700"
                  >
                    <span className="font-medium text-slate-900 dark:text-white">{p.name}</span>
                    <span className="text-xs text-slate-400">SKU: {p.sku} · Cost: {inr(p.costPrice)}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </Field>
      </div>
      <div className="mt-4 space-y-2">
        {lines.map((l, i) => (
          <div key={l.productId} className="flex items-center gap-2 rounded-lg border border-slate-200 p-2 dark:border-slate-700">
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium text-slate-900 dark:text-white">{l.name}</div>
              <div className="text-xs text-slate-400">{l.sku}</div>
            </div>
            <div className="w-20"><Input type="number" value={l.qty} onChange={(e) => setLines(lines.map((x, j) => j === i ? { ...x, qty: Number(e.target.value) } : x))} /></div>
            <div className="w-24"><Input type="number" value={l.cost} onChange={(e) => setLines(lines.map((x, j) => j === i ? { ...x, cost: Number(e.target.value) } : x))} /></div>
            <button onClick={() => setLines(lines.filter((_, j) => j !== i))} className="rounded-lg p-2 text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950"><Trash2 className="h-4 w-4" /></button>
          </div>
        ))}
        {!lines.length && <p className="py-4 text-center text-sm text-slate-400">No products added.</p>}
      </div>
    </Modal>
  );
}

function ReceiveModal({ po, onClose }: { po: PurchaseOrder | null; onClose: () => void }) {
  const [recv, setRecv] = useState<Record<string, number>>({});
  if (!po) return null;
  const submit = async () => {
    await receivePurchase(po, recv);
    toast.success("Inventory received");
    setRecv({}); onClose();
  };
  return (
    <Modal open={!!po} onClose={onClose} title={`Receive — ${po.poNo}`} wide
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button onClick={submit}><PackageCheck className="h-4 w-4" /> Confirm receipt</Button></>}>
      <div className="space-y-2">
        {po.lines.map((l) => {
          const remaining = l.qty - l.received;
          return (
            <div key={l.productId} className="flex items-center gap-3 rounded-lg border border-slate-200 p-3 dark:border-slate-700">
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium text-slate-900 dark:text-white">{l.name}</div>
                <div className="text-xs text-slate-400">Ordered {l.qty} · received {l.received} · remaining {remaining}</div>
              </div>
              <div className="w-28">
                <Input type="number" min={0} max={remaining} placeholder="Receive now" value={recv[l.productId] ?? ""} onChange={(e) => setRecv({ ...recv, [l.productId]: Math.min(remaining, Number(e.target.value)) })} disabled={remaining <= 0} />
              </div>
            </div>
          );
        })}
      </div>
    </Modal>
  );
}

function PODetailModal({ po, onClose, onSave }: { po: PurchaseOrder | null; onClose: () => void; onSave: () => void }) {
  const [amountPaid, setAmountPaid] = useState("");
  
  useEffect(() => {
    if (po) {
      // Read from Firestore-persisted field first, then localStorage fallback
      if (po.amountPaid !== undefined && po.amountPaid !== null) {
        setAmountPaid(String(po.amountPaid));
      } else {
        const localPaymentsStr = localStorage.getItem("pc_po_payments");
        const localPayments = localPaymentsStr ? JSON.parse(localPaymentsStr) : {};
        const amt = localPayments[po.id] !== undefined ? Number(localPayments[po.id]) : 0;
        setAmountPaid(String(amt));
      }
    }
  }, [po]);

  if (!po) return null;

  const total = Number(po.total ?? 0);

  const savePayment = async () => {
    const amt = Number(amountPaid);
    if (isNaN(amt) || amt < 0) {
      toast.error("Please enter a valid amount");
      return;
    }
    try {
      await savePOPayment(po.id, amt);
      toast.success("PO payment updated successfully");
      onSave();
      onClose();
    } catch (err) {
      console.error("Error saving PO payment:", err);
      toast.error("Failed to save payment");
    }
  };

  return (
    <Modal open={!!po} onClose={onClose} title={`PO Details — ${po.poNo}`} wide
      footer={<><Button variant="secondary" onClick={onClose}>Close</Button><Button onClick={savePayment}>Save Payment</Button></>}>
      <div className="space-y-4 text-sm">
        <div className="rounded-lg bg-slate-50 p-3 dark:bg-slate-800">
          <div className="font-semibold text-slate-900 dark:text-white">{po.vendorName}</div>
          <div className="text-xs text-slate-400">Date: {fmtDate(po.createdAt)} · Total PO Value: {inr(total)}</div>
        </div>

        <div>
          <p className="mb-2 font-semibold text-slate-900 dark:text-white">Purchased Products</p>
          <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-700">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-500 uppercase dark:bg-slate-800 dark:text-slate-400">
                <tr>
                  <th className="p-2.5">Product</th>
                  <th className="p-2.5">SKU</th>
                  <th className="p-2.5 text-right">Qty</th>
                  <th className="p-2.5 text-right">Cost</th>
                  <th className="p-2.5 text-right">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
                {po.lines.map((l) => (
                  <tr key={l.productId} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                    <td className="p-2.5 font-medium text-slate-900 dark:text-white">{l.name}</td>
                    <td className="p-2.5 text-slate-500">{l.sku}</td>
                    <td className="p-2.5 text-right tabular-nums">{l.qty}</td>
                    <td className="p-2.5 text-right tabular-nums">{inr(l.cost)}</td>
                    <td className="p-2.5 text-right tabular-nums font-semibold">{inr(l.qty * l.cost)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="border-t border-slate-100 dark:border-slate-800 pt-3">
          <Field label="Amount Paid (₹)">
            <Input
              type="number"
              step="0.01"
              min="0"
              value={amountPaid}
              onChange={(e) => setAmountPaid(e.target.value)}
              placeholder="Enter amount paid"
            />
          </Field>
          <div className="mt-2 text-xs text-slate-500 flex justify-between">
            <span>PO Value: <strong>{inr(total)}</strong></span>
            <span>Balance: <strong className={total - Number(amountPaid) > 0 ? "text-rose-600" : "text-emerald-600"}>{inr(Math.max(0, total - Number(amountPaid)))}</strong></span>
          </div>
        </div>
      </div>
    </Modal>
  );
}

export default function PurchaseOrders() {
  const { purchaseOrders, vendors } = useDataStore();
  const [createOpen, setCreateOpen] = useState(false);
  const [receiving, setReceiving] = useState<PurchaseOrder | null>(null);
  const [filter, setFilter] = useState("all");
  const [selectedDetailPo, setSelectedDetailPo] = useState<PurchaseOrder | null>(null);
  const [localVersion, setLocalVersion] = useState(0);
  const [searchQuery, setSearchQuery] = useState("");

  const getPoPaymentInfo = useMemo(() => {
    return (po: PurchaseOrder) => {
      const total = Number(po.total ?? 0);
      let amountPaid = 0;

      // Priority 1: Firestore-persisted amountPaid field
      if (po.amountPaid !== undefined && po.amountPaid !== null) {
        amountPaid = Number(po.amountPaid);
      } else {
        // Priority 2: localStorage fallback
        const localPaymentsStr = typeof window !== "undefined" ? localStorage.getItem("pc_po_payments") : null;
        const localPayments = localPaymentsStr ? JSON.parse(localPaymentsStr) : {};
        amountPaid = localPayments[po.id] !== undefined ? Number(localPayments[po.id]) : 0;
      }
      
      const balance = Math.max(0, total - amountPaid);
      
      let statusText = "Unpaid";
      let statusColor = "rose";
      
      if (amountPaid >= total) {
        statusText = "Paid";
        statusColor = "emerald";
      } else if (amountPaid > 0) {
        statusText = "Partial Paid";
        statusColor = "amber";
      }
      
      return {
        amountPaid,
        balance,
        statusText,
        statusColor
      };
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [localVersion]);

  const stats = useMemo(() => ({
    pending: purchaseOrders.filter((p) => ["Draft", "Sent", "Partial"].includes(p.status)).length,
    received: purchaseOrders.filter((p) => p.status === "Received").length,
    value: purchaseOrders.reduce((s, p) => s + p.total, 0),
    vendors: vendors.length,
  }), [purchaseOrders, vendors]);

  const rows = purchaseOrders
    .filter((p) => filter === "all" || p.status === filter)
    .filter((p) => {
      const q = searchQuery.trim().toLowerCase();
      if (!q) return true;
      return (
        (p.poNo || "").toLowerCase().includes(q) ||
        (p.id || "").toLowerCase().includes(q) ||
        (p.vendorName || "").toLowerCase().includes(q)
      );
    })
    .sort((a, b) => b.createdAt - a.createdAt);

  return (
    <div>
      <PageHeader title="Purchase Orders" subtitle="Order stock from vendors and receive inventory."
        actions={<Button onClick={() => setCreateOpen(true)}><Plus className="h-4 w-4" /> Create PO</Button>} />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard icon={Truck} label="Pending POs" value={num(stats.pending)} accent="bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300" />
        <StatCard icon={PackageCheck} label="Received POs" value={num(stats.received)} accent="bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300" />
        <StatCard icon={Truck} label="Total Purchase Value" value={inr(stats.value)} accent="bg-indigo-50 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300" />
        <StatCard icon={Truck} label="Vendors" value={num(stats.vendors)} />
      </div>

      {/* Sticky Filters & Search */}
      <div className="sticky top-[56px] z-10 bg-white/95 dark:bg-slate-900/95 backdrop-blur -mx-4 px-4 py-3 border-b border-slate-200/50 dark:border-slate-800/50 flex flex-wrap items-center justify-between gap-3 mt-6 mb-4">
        <div className="flex flex-wrap gap-2">
          {["all", "Draft", "Sent", "Partial", "Received", "Cancelled"].map((s) => (
            <button key={s} onClick={() => setFilter(s)} className={`rounded-full px-3.5 py-1.5 text-xs font-medium ring-1 ring-inset transition ${filter === s ? "bg-slate-900 text-white ring-slate-900 dark:bg-white dark:text-slate-900" : "bg-white text-slate-600 ring-slate-200 hover:bg-slate-50 dark:bg-slate-900 dark:text-slate-300 dark:ring-slate-700"}`}>
              {s === "all" ? "All" : s}
            </button>
          ))}
        </div>
        <div className="relative w-full max-w-xs">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search POs or vendors..."
            className="pl-9"
          />
        </div>
      </div>

      <div className="space-y-3">
        {rows.map((po) => {
          const recvUnits = po.lines.reduce((s, l) => s + l.received, 0);
          const orderedUnits = po.lines.reduce((s, l) => s + l.qty, 0);
          const { amountPaid, statusText, statusColor } = getPoPaymentInfo(po);
          return (
            <Card key={po.id} className="p-4">
              <div className="flex flex-wrap items-center gap-3">
                <div className="w-24">
                  <div className="font-semibold text-slate-900 dark:text-white">{po.poNo}</div>
                  <div className="text-xs text-slate-400">{fmtDate(po.createdAt)}</div>
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium text-slate-700 dark:text-slate-200">{po.vendorName}</div>
                  <div className="text-xs text-slate-400">
                    {po.lines.length} items · {recvUnits}/{orderedUnits} units received · <Badge color={statusColor}>{statusText}</Badge>
                  </div>
                </div>
                <div className="text-right">
                  <div className="font-semibold tabular-nums text-slate-900 dark:text-white">{inr(po.total)}</div>
                  <div className="text-[10px] text-slate-400 dark:text-slate-500">Paid: {inr(amountPaid)}</div>
                </div>
                <StatusBadge value={po.status} />
                <Button variant="secondary" onClick={() => setSelectedDetailPo(po)}><Eye className="h-4 w-4" /> Detail</Button>
                {po.status !== "Received" && po.status !== "Cancelled" && (
                  <Button variant="secondary" onClick={() => setReceiving(po)}><PackageCheck className="h-4 w-4" /> Receive</Button>
                )}
              </div>
            </Card>
          );
        })}
        {!rows.length && <p className="py-10 text-center text-sm text-slate-400">No purchase orders.</p>}
      </div>

      <CreatePO open={createOpen} onClose={() => setCreateOpen(false)} />
      <ReceiveModal po={receiving} onClose={() => setReceiving(null)} />
      <PODetailModal po={selectedDetailPo} onClose={() => setSelectedDetailPo(null)} onSave={() => setLocalVersion((v) => v + 1)} />
    </div>
  );
}
