import { useMemo, useState, useEffect, useRef } from "react";
import toast from "react-hot-toast";
import { Plus, FileText, Printer, Pencil, Save, X, MessageCircle, Trash2, Search, PackagePlus, Bell, Copy, Truck, Eye, Calendar, Filter, Clock, Zap } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Button, Card, Input, Textarea, Select, PageHeader, Badge, Field } from "@/components/ui/primitives";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { Modal } from "@/components/ui/Modal";
import { useDataStore } from "@/store/dataStore";
import { useUIStore } from "@/store/uiStore";
import { setOrderStatus, updateOrderPricing, saveDoc, logActivity, saveOrderPayment, saveOrderDeliveryDate } from "@/services/data";
import { deleteToBin } from "@/services/recycleBin";
import { inr, fmtDateTime, fmtDate, uid, getOrderPaymentInfo } from "@/lib/utils";
import { lineGst, lineNet, lineProfit, orderTotals } from "@/lib/calc";
import { printInvoice, shareInvoiceWhatsapp } from "@/lib/invoice";
import { paymentReminderDraft, orderUpdateDraft, shareTextWhatsapp } from "@/lib/messages";
import { getMergedProducts } from "@/services/productOverrides";
import type { ExtraCharge, OrderLine, Product, SalesOrder, SalesStatus, DetailFieldsConfig } from "@/types";
import { mergeOrders } from "@/services/orderMerger";

const STATUSES: SalesStatus[] = [
  "Placed",
  "Confirmed",
  "Processing",
  "Packed",
  "Dispatched",
  "Delivered",
  "Edited",
  "Cancelled",
  "Returned",
  "Pending",
];

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
  const [deliveryEnabled, setDeliveryEnabled] = useState(false);
  const [deliveryAmount, setDeliveryAmount] = useState(0);
  const [note, setNote] = useState("");
  const [askSave, setAskSave] = useState(false);
  const [search, setSearch] = useState("");
  const [quickAdd, setQuickAdd] = useState(false);
  const [saving, setSaving] = useState(false);
  const [variantPickerProduct, setVariantPickerProduct] = useState<any | null>(null);
  const [detailFields, setDetailFields] = useState<DetailFieldsConfig>({
    amountPaid: false,
    amountToBePaid: false,
    paymentStatus: false,
    totalGst: false,
    gstColumn: false,
    source: false,
    placeOfSupply: false,
    delivery: false,
  });

  const prevOrderIdRef = useRef<string | null>(null);

  // Reset the working copy whenever a different order opens.
  useEffect(() => {
    if (!order) {
      setLines([]);
      setCharges([]);
      setDeliveryEnabled(false);
      setDeliveryAmount(0);
      setNote("");
      setEditing(false);
      setAskSave(false);
      setSaving(false);
      setSearch("");
      setQuickAdd(false);
      setVariantPickerProduct(null);
      setDetailFields({
        amountPaid: false,
        amountToBePaid: false,
        paymentStatus: false,
        totalGst: false,
        gstColumn: false,
        source: false,
        placeOfSupply: false,
        delivery: false,
      });
      prevOrderIdRef.current = null;
      return;
    }

    if (prevOrderIdRef.current !== order.id) {
      prevOrderIdRef.current = order.id;

      // Calculate delivery difference
      const originalTotals = orderTotals(order.lines, []);
      const originalBaseTotal = originalTotals.total;
      const deliveryDiff = Math.max(0, order.total - originalBaseTotal);

      const loadedCharges = order.extraCharges ? order.extraCharges.map((c) => ({ ...c })) : [];
      const deliveryChargeItem = loadedCharges.find((c) => c.label === "Delivery Charges");
      const hasDeliveryInCharges = !!deliveryChargeItem;
      const isApp = order.channel === "app";

      const hasDelivery = order.deliveryEnabled !== undefined
        ? order.deliveryEnabled
        : (deliveryDiff > 0 || isApp || hasDeliveryInCharges);

      const initialDeliveryAmount = deliveryChargeItem
        ? deliveryChargeItem.amount
        : (deliveryDiff > 0 ? deliveryDiff : 0);

      // Clean loadedCharges from "Delivery Charges" so it only contains non-delivery extra charges
      const otherCharges = loadedCharges.filter((c) => c.label !== "Delivery Charges");

      setLines(order.lines.map((l) => {
        let mrp = (l as any).mrp;
        if (mrp === undefined || mrp === 0) {
          const [pId, vId] = l.productId.split("__");
          const prod = allProducts.find((p) => p.id === pId);
          if (prod) {
            if (vId && prod.variants) {
              const variant = prod.variants.find((v: any) => v.id === vId);
              mrp = variant ? (variant.originalPrice ?? variant.mrp) : (prod.originalPrice ?? prod.mrp);
            } else {
              mrp = prod.originalPrice ?? prod.mrp;
            }
          }
        }
        return {
          ...l,
          mrp: Number(mrp ?? l.price)
        };
      }));
      setCharges(otherCharges);
      setDeliveryEnabled(hasDelivery);
      setDeliveryAmount(initialDeliveryAmount);
      setNote(order.invoiceNote ?? "");
      setEditing(false);
      setAskSave(false);
      setSaving(false);
      setSearch("");
      setQuickAdd(false);
      setVariantPickerProduct(null);
      const defaultFields = {
        amountPaid: false,
        amountToBePaid: false,
        paymentStatus: false,
        totalGst: false,
        gstColumn: false,
        source: false,
        placeOfSupply: false,
        delivery: hasDelivery,
      };
      setDetailFields(order.detailFields ? { ...defaultFields, ...order.detailFields } : defaultFields);
    }
  }, [order, allProducts]);

  if (!order) return null;

  const activeCharges = [
    ...charges,
    ...(deliveryEnabled ? [{ id: "delivery", label: "Delivery Charges", amount: deliveryAmount }] : [])
  ];
  const totals = orderTotals(lines, activeCharges);
  
  const originalExtraCharges = order.extraCharges ?? [];
  const dirty =
    JSON.stringify(lines) !== JSON.stringify(order.lines) ||
    JSON.stringify(activeCharges) !== JSON.stringify(originalExtraCharges) ||
    deliveryEnabled !== (order.deliveryEnabled ?? (originalExtraCharges.some(c => c.label === "Delivery Charges") || order.channel === "app")) ||
    JSON.stringify(detailFields) !== JSON.stringify(order.detailFields ?? {
      amountPaid: false,
      amountToBePaid: false,
      paymentStatus: false,
      totalGst: false,
      gstColumn: false,
      source: false,
      placeOfSupply: false,
      delivery: order.deliveryEnabled ?? (originalExtraCharges.some(c => c.label === "Delivery Charges") || order.channel === "app")
    }) ||
    note !== (order.invoiceNote ?? "");

  // Edit by index (lines can repeat a productId or be newly added).
  const setLineAt = (i: number, patch: Partial<OrderLine>) =>
    setLines((prev) =>
      prev.map((l, j) => {
        if (j === i) {
          const next = { ...l, ...patch };
          if (patch.qty !== undefined) next.qty = isNaN(Number(patch.qty)) ? 0 : Number(patch.qty);
          if (patch.price !== undefined) next.price = isNaN(Number(patch.price)) ? 0 : Number(patch.price);
          if (patch.cost !== undefined) next.cost = isNaN(Number(patch.cost)) ? 0 : Number(patch.cost);
          if (patch.discount !== undefined) next.discount = isNaN(Number(patch.discount)) ? 0 : Number(patch.discount);
          if (patch.gstRate !== undefined) next.gstRate = isNaN(Number(patch.gstRate)) ? 0 : Number(patch.gstRate);
          return next;
        }
        return l;
      })
    );
  const removeLineAt = (i: number) => setLines((prev) => prev.filter((_, j) => j !== i));

  const addProductLine = (p: any, v?: any) => {
    const lineId = v ? `${p.id}__${v.id}` : p.id;
    const name = v ? `${p.name} - ${v.shadeName || v.value || v.name}` : p.name;
    const sku = v?.sku || p.sku || "";
    const price = Number(v?.price ?? p.sellingPrice ?? p.price ?? 0);
    const cost = Number(v?.costPrice ?? v?.cost ?? p.costPrice ?? 0);
    const gstRate = Number(v?.gstRate ?? p.gstRate ?? 18);
    const mrp = Number(v?.originalPrice ?? v?.mrp ?? p.originalPrice ?? p.mrp ?? price);

    setLines((prev) => [
      ...prev,
      {
        productId: lineId,
        name,
        sku,
        qty: 1,
        price,
        cost,
        gstRate,
        discount: 0,
        mrp,
      },
    ]);
    setSearch("");
    setVariantPickerProduct(null);
  };

  const handleProductClick = (p: any) => {
    if (p.variants && p.variants.length > 0) {
      setVariantPickerProduct(p);
    } else {
      addProductLine(p);
    }
  };

  const matches = search
    ? allProducts
      .filter((p) => {
        if (p.status === "archived") return false;

        const q = search.trim().toLowerCase();
        if (!q) return false;

        const name = (p.name || "").toLowerCase();
        const sku = (p.sku || "").toLowerCase();
        const category = (p.category || p.categoryName || "").toLowerCase();
        const brand = (p.brand || "").toLowerCase();

        // Split the search query into tokens to match any/all keywords
        const tokens = q.split(/\s+/).filter(Boolean);
        if (tokens.length === 0) return false;

        // Check if every token matches at least one of the fields (case-irrespective)
        return tokens.every((token) => {
          const inMain = name.includes(token) || 
                         sku.includes(token) || 
                         category.includes(token) || 
                         brand.includes(token);
          if (inMain) return true;

          // If not matched in main, check if it matches in any variant
          if (p.variants && Array.isArray(p.variants)) {
            return p.variants.some((v: any) => {
              const vName = (v.name || v.shadeName || v.value || "").toLowerCase();
              const vSku = (v.sku || "").toLowerCase();
              return vName.includes(token) || vSku.includes(token);
            });
          }
          return false;
        });
      })
      .slice(0, 15)
    : [];

  const addCharge = () => setCharges((prev) => [...prev, { id: uid(), label: "", amount: 0 }]);
  const setChargeAt = (i: number, patch: Partial<ExtraCharge>) =>
    setCharges((prev) => prev.map((c, j) => (j === i ? { ...c, ...patch } : c)));
  const removeChargeAt = (i: number) => setCharges((prev) => prev.filter((_, j) => j !== i));

  const cancelEdit = () => {
    setLines(order.lines.map((l) => {
      let mrp = (l as any).mrp;
      if (mrp === undefined || mrp === 0) {
        const [pId, vId] = l.productId.split("__");
        const prod = allProducts.find((p) => p.id === pId);
        if (prod) {
          if (vId && prod.variants) {
            const variant = prod.variants.find((v: any) => v.id === vId);
            mrp = variant ? (variant.originalPrice ?? variant.mrp) : (prod.originalPrice ?? prod.mrp);
          } else {
            mrp = prod.originalPrice ?? prod.mrp;
          }
        }
      }
      return {
        ...l,
        mrp: Number(mrp ?? l.price)
      };
    }));

    const originalTotals = orderTotals(order.lines, []);
    const originalBaseTotal = originalTotals.total;
    const deliveryDiff = Math.max(0, order.total - originalBaseTotal);

    const loadedCharges = order.extraCharges ? order.extraCharges.map((c) => ({ ...c })) : [];
    const deliveryChargeItem = loadedCharges.find((c) => c.label === "Delivery Charges");
    const hasDeliveryInCharges = !!deliveryChargeItem;
    const isApp = order.channel === "app";

    const hasDelivery = order.deliveryEnabled !== undefined
      ? order.deliveryEnabled
      : (deliveryDiff > 0 || isApp || hasDeliveryInCharges);

    const initialDeliveryAmount = deliveryChargeItem
      ? deliveryChargeItem.amount
      : (deliveryDiff > 0 ? deliveryDiff : 0);

    const otherCharges = loadedCharges.filter((c) => c.label !== "Delivery Charges");

    const defaultFields = {
      amountPaid: false,
      amountToBePaid: false,
      paymentStatus: false,
      totalGst: false,
      gstColumn: false,
      source: false,
      placeOfSupply: false,
      delivery: hasDelivery,
    };
    setDetailFields(order.detailFields ? { ...defaultFields, ...order.detailFields } : defaultFields);
    setCharges(otherCharges);
    setDeliveryEnabled(hasDelivery);
    setDeliveryAmount(initialDeliveryAmount);
    setNote(order.invoiceNote ?? "");
    setEditing(false);
  };

  const applySave = async (updateMaster: boolean) => {
    if (saving) return;
    setSaving(true);
    try {
      await updateOrderPricing(order, lines, updateMaster, {
        extraCharges: activeCharges,
        deliveryEnabled,
        detailFields,
        invoiceNote: note
      });
      toast.success(updateMaster ? "Invoice saved & product prices updated" : "Invoice saved");
      setAskSave(false);
      setEditing(false);
      onClose();
    } catch (err) {
      console.error("applySave error:", err);
      toast.error("Failed to save invoice changes. Please try again.");
      setAskSave(false);
    } finally {
      setSaving(false);
    }
  };
  // Resolve metadata
  const getField = (obj: any, keys: string[]) => {
    for (const key of keys) {
      if (obj && obj[key] !== undefined && obj[key] !== null && obj[key] !== "") {
        return obj[key];
      }
    }
    return "";
  };

  const cid = order.salonId || order.customerId || order.userId || order.uid || "";
  const salonObj = salons.find((s: any) => s.id === cid);
  const appCust = adminCustomers.find((c: any) => c.id === cid);

  const ownerName = getField(salonObj, ["ownerName"]) || getField(appCust, ["ownerName", "name", "customerName", "displayName"]) || "-";
  const salonName = getField(salonObj, ["name"]) || getField(appCust, ["salonName", "salon"]) || order.salonName || "-";

  let salonAddress = getField(salonObj, ["address"]) || getField(appCust, ["address"]) || "";
  if (!salonAddress) {
    const d = (order as any).deliveryAddress || (order as any).address || (order as any).shippingAddress || (order as any).customer?.address;
    if (d) {
      if (typeof d === "string") {
        salonAddress = d;
      } else {
        salonAddress = [d.line1, d.line2, d.landmark, d.city, d.state, d.postalCode || d.zip || d.pincode]
          .map((x: any) => String(x || "").trim())
          .filter(Boolean)
          .join(", ");
      }
    }
  }
  if (!salonAddress) salonAddress = "-";

  const formatExactDateTime = (ts: number) => {
    const dt = new Date(ts);
    const day = String(dt.getDate()).padStart(2, '0');
    const month = String(dt.getMonth() + 1).padStart(2, '0');
    const year = dt.getFullYear();
    const hours = String(dt.getHours()).padStart(2, '0');
    const minutes = String(dt.getMinutes()).padStart(2, '0');
    return `${day}/${month}/${year} ${hours}:${minutes}`;
  };
  const placementDateTime = formatExactDateTime(order.createdAt);

  const metadata = {
    ownerName,
    salonName,
    salonAddress,
    placementDateTime,
  };

  // Calculate savings
  const savings = lines.reduce((sum, l) => {
    const mrp = Number((l as any).mrp ?? l.price);
    const savingsPerUnit = Math.max(0, mrp - l.price);
    return sum + savingsPerUnit * l.qty;
  }, 0);

  // Working order used for print / WhatsApp so unsaved edits are reflected.
  const workingOrder: SalesOrder = { ...order, lines, extraCharges: activeCharges, invoiceNote: note, ...totals };
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
            <Button variant="secondary" onClick={() => shareInvoiceWhatsapp(workingOrder, settings, salonPhone, detailFields, metadata)}>
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
            <Button variant="secondary" onClick={() => shareInvoiceWhatsapp(workingOrder, settings, salonPhone, detailFields, metadata)}>
              <MessageCircle className="h-4 w-4" /> WhatsApp
            </Button>
            <Button onClick={() => printInvoice(workingOrder, settings, detailFields, metadata)}><Printer className="h-4 w-4" /> Print / PDF</Button>
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
            <div>Order Placed: {metadata.placementDateTime}</div>
          </div>
        </div>

        <div className="rounded-lg bg-slate-50 p-3 dark:bg-slate-800 space-y-1">
          <div className="font-semibold text-slate-900 dark:text-white">Salon: {metadata.salonName}</div>
          <div className="text-xs text-slate-600 dark:text-slate-300">Owner: {metadata.ownerName}</div>
          <div className="text-xs text-slate-600 dark:text-slate-300">Address: {metadata.salonAddress}</div>
          {detailFields.placeOfSupply && (
            <div className="text-xs text-slate-600 dark:text-slate-300">
              Place of Supply: {settings.companyState.split(",")[0] || "Maharashtra"}
            </div>
          )}
          {(detailFields.source || detailFields.paymentStatus) && (
            <div className="text-xs text-slate-400 mt-1 border-t border-slate-200/50 dark:border-slate-700/50 pt-1">
              {detailFields.source && <span>Channel: {order.channel}</span>}
              {detailFields.source && detailFields.paymentStatus && <span> · </span>}
              {detailFields.paymentStatus && (
                <span>
                  Payment: <span className={`font-semibold ${paymentStatusColorClass}`}>{statusText}</span>
                </span>
              )}
            </div>
          )}
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
                <div className="mt-1.5 text-right text-xs text-slate-500">Amount: <span className="font-medium tabular-nums text-slate-700 dark:text-slate-200">{inr(lineNet(l) + (detailFields.gstColumn ? lineGst(l) : 0))}</span></div>
              </div>
            ))}

            {/* Add existing product */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Add product — search name or SKU…" className="pl-9" />
              {matches.length > 0 && (
                <div className="absolute z-20 mt-1 max-h-60 w-full overflow-y-auto rounded-lg border border-slate-200 bg-white shadow-lg dark:border-slate-700 dark:bg-slate-800">
                  {matches.map((p) => (
                    <button key={p.id} onClick={() => handleProductClick(p)} className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-slate-100 dark:hover:bg-slate-700">
                      <span>
                        <span className="font-medium text-slate-900 dark:text-white">{p.name}</span>
                        {(p.brand || p.category || p.categoryName) && (
                          <span className="ml-2 text-xs text-slate-400">
                            ({[p.brand, p.category || p.categoryName].filter(Boolean).join(" · ")})
                          </span>
                        )}
                        {p.variants && p.variants.length > 0 && (
                          <span className="ml-2 text-[10px] font-medium text-blue-600">
                            ({p.variants.length} variant{p.variants.length > 1 ? "s" : ""})
                          </span>
                        )}
                      </span>
                      <span className="text-xs text-slate-400">{inr(p.sellingPrice)} · GST {p.gstRate}%</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
            <Button variant="ghost" onClick={() => setQuickAdd(true)} className="text-indigo-600"><PackagePlus className="h-4 w-4" /> Create new product</Button>
            {/* Delivery status settings */}
            <div className="rounded-lg border border-slate-200 p-3 dark:border-slate-700 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">Delivery Status</span>
                <label className="relative inline-flex items-center cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={deliveryEnabled}
                    onChange={(e) => setDeliveryEnabled(e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className="w-9 h-5 bg-slate-200 peer-focus:outline-none rounded-full peer dark:bg-slate-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all dark:border-slate-600 peer-checked:bg-indigo-600"></div>
                  <span className="ml-2 text-xs font-medium text-slate-700 dark:text-slate-200">
                    {deliveryEnabled ? "Enabled" : "Disabled"}
                  </span>
                </label>
              </div>
              {deliveryEnabled && (
                <Field label="Delivery Charge Amount (₹)">
                  <Input
                    type="number"
                    step="0.01"
                    min={0}
                    value={deliveryAmount || ""}
                    onChange={(e) => setDeliveryAmount(Math.max(0, Number(e.target.value)))}
                    placeholder="0 (Free Delivery)"
                  />
                </Field>
              )}
            </div>

            {/* Show / Hide Fields Options */}
            <div className="rounded-lg border border-slate-200 p-3 dark:border-slate-700 space-y-2">
              <div className="text-xs font-semibold uppercase tracking-wider text-slate-400">Show / Hide Fields on Invoice</div>
              <div className="grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-4">
                <label className="inline-flex items-center cursor-pointer gap-2 select-none text-xs font-medium text-slate-700 dark:text-slate-200">
                  <input
                    type="checkbox"
                    checked={detailFields.amountPaid}
                    onChange={(e) => setDetailFields((prev) => ({ ...prev, amountPaid: e.target.checked }))}
                    className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 h-4 w-4 cursor-pointer"
                  />
                  <span>Amount Paid</span>
                </label>
                <label className="inline-flex items-center cursor-pointer gap-2 select-none text-xs font-medium text-slate-700 dark:text-slate-200">
                  <input
                    type="checkbox"
                    checked={detailFields.amountToBePaid}
                    onChange={(e) => setDetailFields((prev) => ({ ...prev, amountToBePaid: e.target.checked }))}
                    className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 h-4 w-4 cursor-pointer"
                  />
                  <span>Amount To Be Paid</span>
                </label>
                <label className="inline-flex items-center cursor-pointer gap-2 select-none text-xs font-medium text-slate-700 dark:text-slate-200">
                  <input
                    type="checkbox"
                    checked={detailFields.paymentStatus}
                    onChange={(e) => setDetailFields((prev) => ({ ...prev, paymentStatus: e.target.checked }))}
                    className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 h-4 w-4 cursor-pointer"
                  />
                  <span>Payment Status</span>
                </label>
                <label className="inline-flex items-center cursor-pointer gap-2 select-none text-xs font-medium text-slate-700 dark:text-slate-200">
                  <input
                    type="checkbox"
                    checked={detailFields.totalGst}
                    onChange={(e) => setDetailFields((prev) => ({ ...prev, totalGst: e.target.checked }))}
                    className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 h-4 w-4 cursor-pointer"
                  />
                  <span>Total GST</span>
                </label>
                <label className="inline-flex items-center cursor-pointer gap-2 select-none text-xs font-medium text-slate-700 dark:text-slate-200">
                  <input
                    type="checkbox"
                    checked={detailFields.gstColumn}
                    onChange={(e) => setDetailFields((prev) => ({ ...prev, gstColumn: e.target.checked }))}
                    className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 h-4 w-4 cursor-pointer"
                  />
                  <span>GST Column</span>
                </label>
                <label className="inline-flex items-center cursor-pointer gap-2 select-none text-xs font-medium text-slate-700 dark:text-slate-200">
                  <input
                    type="checkbox"
                    checked={detailFields.source}
                    onChange={(e) => setDetailFields((prev) => ({ ...prev, source: e.target.checked }))}
                    className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 h-4 w-4 cursor-pointer"
                  />
                  <span>Source</span>
                </label>
                <label className="inline-flex items-center cursor-pointer gap-2 select-none text-xs font-medium text-slate-700 dark:text-slate-200">
                  <input
                    type="checkbox"
                    checked={detailFields.placeOfSupply}
                    onChange={(e) => setDetailFields((prev) => ({ ...prev, placeOfSupply: e.target.checked }))}
                    className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 h-4 w-4 cursor-pointer"
                  />
                  <span>Place of Supply</span>
                </label>
              </div>
            </div>

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
                {detailFields.gstColumn && <th className="py-2 text-right">GST %</th>}
                <th className="py-2 text-right">Amount</th>
              </tr>
            </thead>
            <tbody>
              {lines.map((l, i) => {
                const cost = Number(l.cost ?? 0);
                const hasCost = cost > 0;
                // Calculate profit using lineProfit helper (includes discount subtraction)
                const profitVal = lineProfit(l);
                const displayCost = hasCost ? inr(cost) : "—";
                const displayProfit = hasCost ? inr(profitVal) : "—";
                return (
                  <tr key={i} className="border-b border-slate-100 dark:border-slate-800">
                    <td className="py-2 text-slate-700 dark:text-slate-200">
                      {l.name}
                      {l.description && <div className="text-xs text-slate-400">{l.description}</div>}
                    </td>
                    <td className="py-2 text-right tabular-nums">{l.qty}</td>
                    <td className="py-2 text-right tabular-nums">{inr(l.price)}</td>
                    <td className="py-2 text-right tabular-nums">{displayCost}</td>
                    <td className="py-2 text-right tabular-nums">{displayProfit}</td>
                    {detailFields.gstColumn && <td className="py-2 text-right tabular-nums">{l.gstRate}%</td>}
                    <td className="py-2 text-right font-medium tabular-nums">{inr(lineNet(l) + (detailFields.gstColumn ? lineGst(l) : 0))}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}

        <div className="ml-auto w-72 space-y-1 border-t border-slate-100 dark:border-slate-800 pt-3">
          <Line k="Subtotal" v={inr(totals.subtotal)} />
          {totals.discountTotal > 0 && <Line k="Discount" v={`- ${inr(totals.discountTotal)}`} />}
          {/* Display general extra charges */}
          {charges.map((c) => (
            <Line key={c.id} k={c.label || "Charge"} v={inr(c.amount)} />
          ))}
          {/* Display Delivery Charges if enabled */}
          {deliveryEnabled && (
            <Line k="Delivery Charges" v={deliveryAmount === 0 ? "Free" : inr(deliveryAmount)} />
          )}
          {detailFields.totalGst && <Line k="Total GST" v={inr(totals.gstTotal)} />}
          <div className="border-t border-slate-200 my-1 pt-1 dark:border-slate-700"></div>
          <Line k="Bill Amount" v={inr(totals.total)} bold />
          {detailFields.amountPaid && <Line k="Amount Paid" v={inr(amountPaid)} />}
          {detailFields.amountToBePaid && <Line k="Amount To Be Paid" v={inr(balanceAmount)} />}
          {detailFields.paymentStatus && (
            <div className="flex justify-between text-sm text-slate-500 py-1">
              <span>Payment Status</span>
              <Badge color={statusColor}>{statusText}</Badge>
            </div>
          )}
          <Line k="Total Profit/Margin" v={`${inr(totals.profit)} ${totals.subtotal > 0 ? `(${((totals.profit / totals.subtotal) * 100).toFixed(1)}%)` : ""}`} />
        </div>

        {savings > 0 && (
          <div className="mt-4 rounded-xl border-2 border-dashed border-emerald-500 bg-emerald-50/50 p-4 text-center dark:bg-emerald-950/20">
            <span className="text-lg font-bold text-emerald-600 dark:text-emerald-400">
              🎉 You saved {inr(savings)} on this order!
            </span>
          </div>
        )}

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

      {variantPickerProduct && (
        <Modal
          open={!!variantPickerProduct}
          onClose={() => setVariantPickerProduct(null)}
          title={`Select variant — ${variantPickerProduct.name}`}
          footer={<Button variant="ghost" onClick={() => setVariantPickerProduct(null)}>Cancel</Button>}
        >
          <div className="p-4 space-y-2">
            {variantPickerProduct.variants.map((v: any) => (
              <button
                key={v.id}
                onClick={() => addProductLine(variantPickerProduct, v)}
                className="flex w-full items-center justify-between rounded-lg border border-slate-200 px-4 py-3 text-left hover:bg-slate-50 hover:border-slate-400 transition"
              >
                <div>
                  <p className="font-medium text-slate-900 dark:text-white">
                    {v.value || v.shadeName || v.name || v.attribute || v.id}
                  </p>
                  {v.sku && <p className="text-xs text-slate-400 font-mono">{v.sku}</p>}
                </div>
                <div className="text-right">
                  <p className="font-semibold text-slate-900 dark:text-white">
                    {inr(v.price ?? variantPickerProduct.sellingPrice ?? variantPickerProduct.price ?? 0)}
                  </p>
                  {v.stock != null && (
                    <p className={`text-xs ${v.stock > 0 ? "text-green-600 font-medium" : "text-red-500 font-medium"}`}>
                      {v.stock} left
                    </p>
                  )}
                </div>
              </button>
            ))}
          </div>
        </Modal>
      )}
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
    // Do not save to database to keep the product specific to this invoice only
    toast.success("Ad-hoc product added to invoice");
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
  const rawAdminOrders = useDataStore((s) => (s as any).adminOrders || []);
  const adminOrders = useMemo(() => rawAdminOrders.filter((o: any) => o.isDeleted !== true), [rawAdminOrders]);
  const rawSalesOrders = useDataStore((s) => s.salesOrders || []);
  const rawAdminCustomers = useDataStore((s: any) => s.adminCustomers || []);
  const adminCustomers = useMemo(() => rawAdminCustomers.filter((c: any) => c.isDeleted !== true), [rawAdminCustomers]);
  const rawSalons = useDataStore((s) => s.salons || []);
  const salons = useMemo(() => rawSalons.filter((s: any) => s.isDeleted !== true), [rawSalons]);

  // Merge admin orders and inventory salesOrders using the orderMerger service.
  const orders = useMemo(() => {
    return mergeOrders(adminOrders, rawSalesOrders, salons, adminCustomers);
  }, [adminOrders, rawSalesOrders, salons, adminCustomers]);

  // Automatically soft-delete orders that have been deleted from the Admin Dashboard
  useEffect(() => {
    let active = true;
    const checkAndSoftDelete = async () => {
      for (const o of orders) {
        if (o.isAdminDeleted && !o.isDeleted && !o.isPermanentlyDeleted) {
          // Check if this order has modifications in the salesOrders collection
          const so = rawSalesOrders.find((x: any) => x.id === o.id) as any;
          const isModified = !!(
            so &&
            (so.amountPaid !== undefined ||
              so.status !== undefined ||
              so.paymentStatus !== undefined ||
              (so.lines && so.lines.length > 0) ||
              (so.items && so.items.length > 0))
          );

          if (!isModified) {
            try {
              await deleteToBin("sales_order", o.id, o.orderNo || o.id, o, "salesOrders");
              if (active) {
                toast.success(`Order ${o.orderNo || o.id} deleted from admin, moved to Recycle Bin`);
              }
            } catch (err) {
              console.error("Auto soft-delete failed for order:", o.id, err);
            }
          }
        }
      }
    };
    checkAndSoftDelete();
    return () => {
      active = false;
    };
  }, [orders, rawSalesOrders]);

  // Persistent Filter State across navigation
  const initialFilters = useMemo(() => {
    try {
      const raw = sessionStorage.getItem("pc_sales_orders_filters") || localStorage.getItem("pc_sales_orders_filters");
      if (raw) return JSON.parse(raw);
    } catch { /* ignore */ }
    return {};
  }, []);

  // Filter States (Multi-select OR logic within categories)
  const [selectedStatuses, setSelectedStatuses] = useState<string[]>(initialFilters.selectedStatuses || []);
  const [channel, setChannel] = useState<string>(initialFilters.channel || "all");
  const [selectedPayments, setSelectedPayments] = useState<string[]>(initialFilters.selectedPayments || []);
  const [invoice, setInvoice] = useState<SalesOrder | null>(null);
  const [notify, setNotify] = useState<SalesOrder | null>(null);
  const [deliveryModalOrder, setDeliveryModalOrder] = useState<SalesOrder | null>(null);

  // Omnibox Search State with Target Field
  const [searchQuery, setSearchQuery] = useState<string>(initialFilters.searchQuery || "");
  const [searchTarget, setSearchTarget] = useState<"all" | "salon" | "orderNo" | "product">(initialFilters.searchTarget || "all");
  const [showSearchDropdown, setShowSearchDropdown] = useState(false);
  const searchContainerRef = useRef<HTMLDivElement>(null);

  // Date Filtering State with Basis (Placed vs Delivery vs Expected)
  const [dateBasis, setDateBasis] = useState<"placed" | "delivered" | "expected">(initialFilters.dateBasis || "placed");
  const [dateFilter, setDateFilter] = useState<"all" | "today" | "week" | "month" | "custom">(initialFilters.dateFilter || "all");
  const [customStart, setCustomStart] = useState<string>(initialFilters.customStart || "");
  const [customEnd, setCustomEnd] = useState<string>(initialFilters.customEnd || "");

  // Quick Preset Shortcuts
  const [activePreset, setActivePreset] = useState<string | null>(initialFilters.activePreset ?? null);

  const [statsMode, setStatsMode] = useState<"paid" | "all">(initialFilters.statsMode || "paid");
  const [amountFilter, setAmountFilter] = useState<"all" | "under5k" | "5k-20k" | "over20k" | "custom">(initialFilters.amountFilter || "all");
  const [customMinAmount, setCustomMinAmount] = useState<string>(initialFilters.customMinAmount || "");
  const [customMaxAmount, setCustomMaxAmount] = useState<string>(initialFilters.customMaxAmount || "");

  // Synchronize active filters to storage so they survive page navigation
  useEffect(() => {
    const toSave = {
      selectedStatuses,
      channel,
      selectedPayments,
      searchQuery,
      searchTarget,
      dateBasis,
      dateFilter,
      customStart,
      customEnd,
      amountFilter,
      customMinAmount,
      customMaxAmount,
      activePreset,
      statsMode,
    };
    try {
      const json = JSON.stringify(toSave);
      sessionStorage.setItem("pc_sales_orders_filters", json);
      localStorage.setItem("pc_sales_orders_filters", json);
    } catch { /* ignore */ }
  }, [
    selectedStatuses,
    channel,
    selectedPayments,
    searchQuery,
    searchTarget,
    dateBasis,
    dateFilter,
    customStart,
    customEnd,
    amountFilter,
    customMinAmount,
    customMaxAmount,
    activePreset,
    statsMode,
  ]);

  // Close search dropdown on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (searchContainerRef.current && !searchContainerRef.current.contains(e.target as Node)) {
        setShowSearchDropdown(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const toggleStatus = (status: string) => {
    setActivePreset(null);
    if (status === "all") {
      setSelectedStatuses([]);
      return;
    }
    setSelectedStatuses((prev) => {
      if (prev.includes(status)) {
        return prev.filter((s) => s !== status);
      } else {
        return [...prev, status];
      }
    });
  };

  const togglePayment = (payment: string) => {
    setActivePreset(null);
    if (payment === "all") {
      setSelectedPayments([]);
      return;
    }
    setSelectedPayments((prev) => {
      if (prev.includes(payment)) {
        return prev.filter((p) => p !== payment);
      } else {
        return [...prev, payment];
      }
    });
  };

  const applyPreset = (presetKey: "toDeliver" | "lateSLA" | "deliveredUnpaid" | "emergency") => {
    if (activePreset === presetKey) {
      setActivePreset(null);
      setSelectedStatuses([]);
      setSelectedPayments([]);
      return;
    }
    setActivePreset(presetKey);
    if (presetKey === "toDeliver") {
      setSelectedStatuses(["Packed", "Dispatched"]);
      setSelectedPayments([]);
    } else if (presetKey === "deliveredUnpaid") {
      setSelectedStatuses(["Delivered"]);
      setSelectedPayments(["Unpaid", "Partial"]);
    } else if (presetKey === "lateSLA" || presetKey === "emergency") {
      setSelectedStatuses([]);
      setSelectedPayments([]);
    }
  };

  const resetAllFilters = () => {
    setSelectedStatuses([]);
    setSelectedPayments([]);
    setDateFilter("all");
    setDateBasis("placed");
    setAmountFilter("all");
    setChannel("all");
    setSearchQuery("");
    setSearchTarget("all");
    setActivePreset(null);
    setCustomStart("");
    setCustomEnd("");
    setCustomMinAmount("");
    setCustomMaxAmount("");
    try {
      sessionStorage.removeItem("pc_sales_orders_filters");
      localStorage.removeItem("pc_sales_orders_filters");
    } catch { /* ignore */ }
  };

  const hasActiveFilters = Boolean(
    selectedStatuses.length > 0 ||
    selectedPayments.length > 0 ||
    dateFilter !== "all" ||
    amountFilter !== "all" ||
    channel !== "all" ||
    searchQuery.trim() !== "" ||
    activePreset !== null
  );

  const getOrderDate = (o: SalesOrder, basis: "placed" | "delivered" | "expected"): number | null => {
    if (basis === "placed") return o.createdAt;
    if (basis === "delivered") {
      if (o.deliveredAt) return o.deliveredAt;
      if (o.status === "Delivered") return o.updatedAt || o.createdAt;
      return null;
    }
    if (basis === "expected") {
      return o.expectedDelivery || o.targetSLA || null;
    }
    return o.createdAt;
  };

  const dateFilteredOrders = useMemo(() => {
    return orders.filter((o) => {
      if (dateFilter === "all") return true;
      const ts = getOrderDate(o, dateBasis);
      if (ts === null || ts === 0) return false;

      if (dateFilter === "today") {
        const startOfToday = new Date();
        startOfToday.setHours(0, 0, 0, 0);
        const endOfToday = new Date();
        endOfToday.setHours(23, 59, 59, 999);
        return ts >= startOfToday.getTime() && ts <= endOfToday.getTime();
      }
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
  }, [orders, dateFilter, dateBasis, customStart, customEnd]);

  const amountFilteredOrders = useMemo(() => {
    return dateFilteredOrders.filter((o) => {
      const amt = o.total;
      if (amountFilter === "all") return true;
      if (amountFilter === "under5k") return amt < 5000;
      if (amountFilter === "5k-20k") return amt >= 5000 && amt <= 20000;
      if (amountFilter === "over20k") return amt > 20000;
      if (amountFilter === "custom") {
        const min = customMinAmount ? Number(customMinAmount) : 0;
        const max = customMaxAmount ? Number(customMaxAmount) : Infinity;
        return amt >= min && amt <= max;
      }
      return true;
    });
  }, [dateFilteredOrders, amountFilter, customMinAmount, customMaxAmount]);

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: amountFilteredOrders.length };
    STATUSES.forEach((s) => {
      c[s] = amountFilteredOrders.filter((o) => o.status === s).length;
    });
    return c;
  }, [amountFilteredOrders]);

  const rows = useMemo(() => {
    return amountFilteredOrders
      .filter((o) => {
        // Preset special filters
        if (activePreset === "lateSLA") {
          const now = Date.now();
          const targetDate = o.expectedDelivery || o.targetSLA;
          const isLate = Boolean(targetDate && targetDate < now && o.status !== "Delivered" && o.status !== "Cancelled");
          if (!isLate) return false;
        }
        if (activePreset === "emergency") {
          const isEm = Boolean(o.isEmergency || o.deliveryType === "emergency");
          if (!isEm) return false;
        }

        // Status filter (OR logic within statuses)
        if (selectedStatuses.length > 0 && !selectedStatuses.includes(o.status)) {
          return false;
        }

        // Channel filter
        if (channel !== "all" && o.channel !== channel) {
          return false;
        }

        // Payment filter (OR logic within payments)
        if (selectedPayments.length > 0) {
          const { statusText } = getOrderPaymentInfo(o);
          const normalizedPayment = statusText === "Partial Paid" ? "Partial" : statusText;
          if (!selectedPayments.includes(normalizedPayment)) return false;
        }

        return true;
      })
      .filter((o) => {
        const q = searchQuery.trim().toLowerCase();
        if (!q) return true;

        if (searchTarget === "salon") {
          return (
            (o.salonName || "").toLowerCase().includes(q) ||
            (o.resolvedSalonName || "").toLowerCase().includes(q) ||
            (o.customerName || "").toLowerCase().includes(q) ||
            (o.ownerName || "").toLowerCase().includes(q)
          );
        }

        if (searchTarget === "orderNo") {
          return (o.orderNo || "").toLowerCase().includes(q) || (o.id || "").toLowerCase().includes(q);
        }

        if (searchTarget === "product") {
          return Array.isArray(o.lines) && o.lines.some((l: any) =>
            (l.name || "").toLowerCase().includes(q) ||
            (l.sku || "").toLowerCase().includes(q)
          );
        }

        // searchTarget === "all"
        return (
          (o.orderNo || "").toLowerCase().includes(q) ||
          (o.id || "").toLowerCase().includes(q) ||
          (o.salonName || "").toLowerCase().includes(q) ||
          (o.resolvedSalonName || "").toLowerCase().includes(q) ||
          (o.customerName || "").toLowerCase().includes(q) ||
          (o.ownerName || "").toLowerCase().includes(q) ||
          (o.salesExecutive || "").toLowerCase().includes(q) ||
          (o.createdBy || "").toLowerCase().includes(q) ||
          (o.paymentMethod || "").toLowerCase().includes(q) ||
          (o.paymentMode || "").toLowerCase().includes(q) ||
          (Array.isArray(o.lines) && o.lines.some((l: any) =>
            (l.name || "").toLowerCase().includes(q) ||
            (l.sku || "").toLowerCase().includes(q)
          ))
        );
      })
      .sort((a, b) => b.createdAt - a.createdAt);
  }, [
    amountFilteredOrders,
    selectedStatuses,
    channel,
    selectedPayments,
    searchQuery,
    searchTarget,
    activePreset,
  ]);

  const { statTotalOrders, statRevenue, statProfit } = useMemo(() => {
    const totalOrders = rows.length;
    const nonCancelled = rows.filter((o) => o.status !== "Cancelled");
    const eligibleOrders = statsMode === "paid"
      ? nonCancelled.filter((o) => {
          const { statusText } = getOrderPaymentInfo(o);
          return statusText === "Paid";
        })
      : nonCancelled;
    const revenue = eligibleOrders.reduce((sum, o) => sum + o.total, 0);
    const profit = eligibleOrders.reduce((sum, o) => sum + o.profit, 0);
    return {
      statTotalOrders: totalOrders,
      statRevenue: revenue,
      statProfit: profit,
    };
  }, [rows, statsMode]);

  const handlePaymentToggle = async (e: React.MouseEvent, o: SalesOrder) => {
    e.stopPropagation();
    const { statusText } = getOrderPaymentInfo(o);
    const newAmount = statusText === "Paid" ? 0 : o.total;
    const newStatus = statusText === "Paid" ? "Unpaid" : "Paid";
    try {
      await saveOrderPayment(o.id, newAmount);
      toast.success(`Order ${o.orderNo} payment status updated to ${newStatus}`);
    } catch (err: any) {
      console.error("Error updating payment status:", err);
      toast.error(`Error updating payment status: ${err.message || err}`);
    }
  };

  const changeStatus = async (o: SalesOrder, status: SalesStatus) => {
    try {
      await setOrderStatus(o, status);
      toast.success(`${o.orderNo} → ${status}`);
    } catch (err: any) {
      console.error("Error updating status:", err);
      toast.error(`Error updating status: ${err.message || err}`);
    }
  };

  const handleDeleteOrder = async (order: SalesOrder) => {
    if (!window.confirm(`Delete order "${order.orderNo}"? This item can be restored from the Recycle Bin.`)) return;
    await deleteToBin("sales_order", order.id, order.orderNo, order, "salesOrders");
    toast.success("Order moved to Recycle Bin");
  };

  return (
    <div>
      <PageHeader title="Sales Orders" subtitle="Unified orders from app, phone & WhatsApp."
        actions={<Button onClick={() => navigate("/new-order")}><Plus className="h-4 w-4" /> Manual Order</Button>} />

      {/* Date Filter & Stats Dashboard */}
      <div className="mt-4 space-y-4 animate-in fade-in duration-300">
        {/* Date & Amount Filter Bar */}
        <div className="space-y-3 rounded-lg bg-slate-50 p-3.5 dark:bg-slate-800/50 border border-slate-200/40 dark:border-slate-700/30">
          {/* Date Filter Row with Date Basis Selector */}
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-400 mr-1 flex items-center gap-1">
                <Calendar className="h-3.5 w-3.5 text-blue-500" /> Filter Date:
              </span>

              {/* Date Basis Selector */}
              <div className="relative inline-flex items-center">
                <select
                  value={dateBasis}
                  onChange={(e) => setDateBasis(e.target.value as any)}
                  className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 focus:outline-none shadow-sm cursor-pointer hover:border-slate-300"
                >
                  <option value="placed">📅 Order Placed Date</option>
                  <option value="delivered">🚚 Actual Delivery Date</option>
                  <option value="expected">⏱️ Expected / SLA Date</option>
                </select>
              </div>

              <div className="flex rounded-lg bg-slate-200/60 p-0.5 dark:bg-slate-900/60">
                {(["all", "today", "week", "month", "custom"] as const).map((mode) => (
                  <button
                    key={mode}
                    onClick={() => setDateFilter(mode)}
                    className={`rounded-md px-3 py-1 text-xs font-medium transition ${dateFilter === mode
                      ? "bg-white text-slate-900 shadow-sm dark:bg-slate-800 dark:text-white"
                      : "text-slate-500 hover:text-slate-900 dark:hover:text-white"
                      }`}
                  >
                    {mode === "all" ? "All Time" : mode === "today" ? "Today" : mode === "week" ? "Last Week" : mode === "month" ? "Last Month" : "Custom Range"}
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

              {dateBasis !== "placed" && dateFilter !== "all" && (
                <span className="text-[11px] font-medium text-blue-600 bg-blue-50 dark:bg-blue-950/60 px-2 py-0.5 rounded border border-blue-200/60">
                  {dateBasis === "delivered" ? "Filtering by deliveredAt timestamp" : "Filtering by expected delivery SLA"}
                </span>
              )}
            </div>

            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-400 mr-2">Revenue Calc:</span>
              <div className="flex rounded-lg bg-slate-200/60 p-0.5 dark:bg-slate-900/60">
                <button
                  onClick={() => setStatsMode("paid")}
                  className={`rounded-md px-3 py-1 text-xs font-medium transition ${statsMode === "paid"
                    ? "bg-white text-slate-900 shadow-sm dark:bg-slate-800 dark:text-white"
                    : "text-slate-500 hover:text-slate-900 dark:hover:text-white"
                    }`}
                >
                  Paid Only
                </button>
                <button
                  onClick={() => setStatsMode("all")}
                  className={`rounded-md px-3 py-1 text-xs font-medium transition ${statsMode === "all"
                    ? "bg-white text-slate-900 shadow-sm dark:bg-slate-800 dark:text-white"
                    : "text-slate-500 hover:text-slate-900 dark:hover:text-white"
                    }`}
                >
                  All Payments
                </button>
              </div>
            </div>
          </div>

          <div className="border-t border-slate-200/60 dark:border-slate-700/50 my-1"></div>

          {/* Amount Filter Row */}
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-400 mr-2">Filter Amount:</span>
            <div className="flex rounded-lg bg-slate-200/60 p-0.5 dark:bg-slate-900/60">
              {(["all", "under5k", "5k-20k", "over20k", "custom"] as const).map((mode) => (
                <button
                  key={mode}
                  onClick={() => setAmountFilter(mode)}
                  className={`rounded-md px-3 py-1 text-xs font-medium transition ${amountFilter === mode
                    ? "bg-white text-slate-900 shadow-sm dark:bg-slate-800 dark:text-white"
                    : "text-slate-500 hover:text-slate-900 dark:hover:text-white"
                    }`}
                >
                  {mode === "all" ? "All Amounts" : mode === "under5k" ? "Under ₹5,000" : mode === "5k-20k" ? "₹5,000 - ₹20,000" : mode === "over20k" ? "Over ₹20,000" : "Custom Range"}
                </button>
              ))}
            </div>

            {amountFilter === "custom" && (
              <div className="flex items-center gap-2 animate-in slide-in-from-left-2 duration-200">
                <input
                  type="number"
                  min="0"
                  placeholder="Min ₹"
                  value={customMinAmount}
                  onChange={(e) => setCustomMinAmount(e.target.value)}
                  className="w-24 rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-white focus:outline-none placeholder:text-slate-400"
                />
                <span className="text-xs text-slate-400">to</span>
                <input
                  type="number"
                  min="0"
                  placeholder="Max ₹"
                  value={customMaxAmount}
                  onChange={(e) => setCustomMaxAmount(e.target.value)}
                  className="w-24 rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-white focus:outline-none placeholder:text-slate-400"
                />
              </div>
            )}
          </div>
        </div>

        {/* Top Summary Stats Cards */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
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
              <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-0.5">
                {statsMode === "paid" ? "paid only" : "all payments (excl. cancelled)"}
              </p>
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
              <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-0.5">
                {statsMode === "paid" ? "paid only" : "all payments (excl. cancelled)"}
              </p>
            </div>
            <div className="rounded-lg bg-emerald-50 p-2 text-emerald-500 dark:bg-emerald-950/50 dark:text-emerald-400">
              <FileText className="h-5 w-5" />
            </div>
          </Card>
        </div>
      </div>

      {/* Quick Presets Row (Odoo / Zoho Shortcuts) */}
      <div className="mb-3 mt-6 flex flex-wrap items-center gap-2">
        <span className="text-xs font-semibold uppercase tracking-wider text-slate-400 mr-1 flex items-center gap-1">
          <Zap className="h-3.5 w-3.5 text-amber-500" /> Presets:
        </span>
        <button
          onClick={() => applyPreset("toDeliver")}
          className={`rounded-full px-3 py-1 text-xs font-medium transition inline-flex items-center gap-1.5 border shadow-sm ${
            activePreset === "toDeliver"
              ? "bg-blue-600 text-white border-blue-600 ring-2 ring-blue-300"
              : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50 dark:bg-slate-900 dark:text-slate-300 dark:border-slate-700"
          }`}
          title="Orders Packed or Dispatched ready for delivery"
        >
          <Truck className="h-3.5 w-3.5" />
          To Deliver (Packed/Dispatched)
        </button>
        <button
          onClick={() => applyPreset("lateSLA")}
          className={`rounded-full px-3 py-1 text-xs font-medium transition inline-flex items-center gap-1.5 border shadow-sm ${
            activePreset === "lateSLA"
              ? "bg-rose-600 text-white border-rose-600 ring-2 ring-rose-300"
              : "bg-white text-rose-600 border-rose-200 hover:bg-rose-50 dark:bg-slate-900 dark:text-rose-400 dark:border-rose-900"
          }`}
          title="Orders where expected delivery timestamp has passed"
        >
          <Clock className="h-3.5 w-3.5" />
          Late / Overdue SLA
        </button>
        <button
          onClick={() => applyPreset("deliveredUnpaid")}
          className={`rounded-full px-3 py-1 text-xs font-medium transition inline-flex items-center gap-1.5 border shadow-sm ${
            activePreset === "deliveredUnpaid"
              ? "bg-amber-600 text-white border-amber-600 ring-2 ring-amber-300"
              : "bg-white text-amber-700 border-amber-200 hover:bg-amber-50 dark:bg-slate-900 dark:text-amber-400 dark:border-amber-900"
          }`}
          title="Orders delivered but payment is still pending or partial"
        >
          💰 Delivered & Unpaid
        </button>
        <button
          onClick={() => applyPreset("emergency")}
          className={`rounded-full px-3 py-1 text-xs font-medium transition inline-flex items-center gap-1.5 border shadow-sm ${
            activePreset === "emergency"
              ? "bg-purple-600 text-white border-purple-600 ring-2 ring-purple-300"
              : "bg-white text-purple-700 border-purple-200 hover:bg-purple-50 dark:bg-slate-900 dark:text-purple-400 dark:border-purple-900"
          }`}
          title="Express 2-hour emergency orders"
        >
          ⚡ Emergency 2h SLA
        </button>
      </div>

      {/* Status & Payment Multi-Select Pills (OR condition within dimension) */}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <button
          onClick={() => toggleStatus("all")}
          className={`rounded-full px-3.5 py-1.5 text-xs font-medium ring-1 ring-inset transition inline-flex items-center gap-1.5 ${
            selectedStatuses.length === 0
              ? "bg-slate-900 text-white ring-slate-900 dark:bg-white dark:text-slate-900"
              : "bg-white text-slate-600 ring-slate-200 hover:bg-slate-50 dark:bg-slate-900 dark:text-slate-300 dark:ring-slate-700"
          }`}
        >
          <span>All</span>
          <span
            className={`inline-flex items-center justify-center rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${
              selectedStatuses.length === 0
                ? "bg-white/20 text-white"
                : "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400"
            }`}
          >
            {counts.all}
          </span>
        </button>

        {STATUSES.map((s) => {
          const isActive = selectedStatuses.includes(s);
          const count = counts[s] || 0;
          return (
            <button
              key={s}
              onClick={() => toggleStatus(s)}
              className={`rounded-full px-3.5 py-1.5 text-xs font-medium ring-1 ring-inset transition inline-flex items-center gap-1.5 ${
                isActive
                  ? "bg-indigo-600 text-white ring-indigo-600 shadow-sm"
                  : "bg-white text-slate-600 ring-slate-200 hover:bg-slate-50 dark:bg-slate-900 dark:text-slate-300 dark:ring-slate-700"
              }`}
              title={`Click to toggle ${s} filter (OR condition)`}
            >
              <span>{s}</span>
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

        <div className="h-6 w-px bg-slate-200 dark:bg-slate-700 mx-2"></div>

        <button
          onClick={() => togglePayment("all")}
          className={`rounded-full px-3.5 py-1.5 text-xs font-medium ring-1 ring-inset transition inline-flex items-center gap-1.5 ${
            selectedPayments.length === 0
              ? "bg-slate-900 text-white ring-slate-900 dark:bg-white dark:text-slate-900"
              : "bg-white text-slate-600 ring-slate-200 hover:bg-slate-50 dark:bg-slate-900 dark:text-slate-300 dark:ring-slate-700"
          }`}
        >
          <span>All Payments</span>
        </button>

        {(["Paid", "Unpaid", "Partial"] as const).map((pStatus) => {
          const isActive = selectedPayments.includes(pStatus);
          return (
            <button
              key={pStatus}
              onClick={() => togglePayment(pStatus)}
              className={`rounded-full px-3.5 py-1.5 text-xs font-medium ring-1 ring-inset transition inline-flex items-center gap-1.5 ${
                isActive
                  ? "bg-emerald-600 text-white ring-emerald-600 shadow-sm"
                  : "bg-white text-slate-600 ring-slate-200 hover:bg-slate-50 dark:bg-slate-900 dark:text-slate-300 dark:ring-slate-700"
              }`}
              title={`Click to toggle ${pStatus} payment filter (OR condition)`}
            >
              <span>{pStatus}</span>
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

      {/* Active Filter Chips Bar (Odoo Facets) */}
      {hasActiveFilters && (
        <div className="mb-4 flex flex-wrap items-center gap-2 rounded-lg bg-blue-50/70 p-2.5 border border-blue-100 dark:bg-slate-800/70 dark:border-slate-700 text-xs text-slate-700 dark:text-slate-300 animate-in fade-in">
          <span className="font-semibold text-blue-900 dark:text-blue-300 text-[11px] uppercase tracking-wider flex items-center gap-1">
            <Filter className="h-3 w-3" /> Filters:
          </span>

          {selectedStatuses.length > 0 && (
            <span className="inline-flex items-center gap-1 rounded-md bg-white px-2 py-1 shadow-sm border border-slate-200 dark:bg-slate-900 dark:border-slate-700">
              <span className="text-slate-400 font-semibold">Status:</span>
              <span className="font-medium text-indigo-600 dark:text-indigo-400">
                {selectedStatuses.join(" OR ")}
              </span>
              <button onClick={() => setSelectedStatuses([])} className="ml-1 text-slate-400 hover:text-slate-600">
                <X className="h-3 w-3" />
              </button>
            </span>
          )}

          {selectedStatuses.length > 0 && (selectedPayments.length > 0 || dateFilter !== "all" || searchQuery.trim() !== "") && (
            <span className="text-[10px] font-bold text-slate-400 uppercase">AND</span>
          )}

          {selectedPayments.length > 0 && (
            <span className="inline-flex items-center gap-1 rounded-md bg-white px-2 py-1 shadow-sm border border-slate-200 dark:bg-slate-900 dark:border-slate-700">
              <span className="text-slate-400 font-semibold">Payment:</span>
              <span className="font-medium text-emerald-600 dark:text-emerald-400">
                {selectedPayments.join(" OR ")}
              </span>
              <button onClick={() => setSelectedPayments([])} className="ml-1 text-slate-400 hover:text-slate-600">
                <X className="h-3 w-3" />
              </button>
            </span>
          )}

          {selectedPayments.length > 0 && (dateFilter !== "all" || searchQuery.trim() !== "") && (
            <span className="text-[10px] font-bold text-slate-400 uppercase">AND</span>
          )}

          {dateFilter !== "all" && (
            <span className="inline-flex items-center gap-1 rounded-md bg-white px-2 py-1 shadow-sm border border-slate-200 dark:bg-slate-900 dark:border-slate-700">
              <span className="text-slate-400 font-semibold">
                {dateBasis === "placed" ? "Placed Date" : dateBasis === "delivered" ? "Delivery Date" : "Expected Date"}:
              </span>
              <span className="font-medium text-blue-600 dark:text-blue-400">
                {dateFilter === "today" ? "Today" : dateFilter === "week" ? "Last Week" : dateFilter === "month" ? "Last Month" : `${customStart} to ${customEnd}`}
              </span>
              <button onClick={() => setDateFilter("all")} className="ml-1 text-slate-400 hover:text-slate-600">
                <X className="h-3 w-3" />
              </button>
            </span>
          )}

          {dateFilter !== "all" && searchQuery.trim() !== "" && (
            <span className="text-[10px] font-bold text-slate-400 uppercase">AND</span>
          )}

          {searchQuery.trim() !== "" && (
            <span className="inline-flex items-center gap-1 rounded-md bg-white px-2 py-1 shadow-sm border border-slate-200 dark:bg-slate-900 dark:border-slate-700">
              <span className="text-slate-400 font-semibold">
                {searchTarget === "salon" ? "Salon:" : searchTarget === "orderNo" ? "Order #:" : searchTarget === "product" ? "Product:" : "Search:"}
              </span>
              <span className="font-medium text-slate-800 dark:text-slate-200">
                "{searchQuery}"
              </span>
              <button onClick={() => { setSearchQuery(""); setSearchTarget("all"); }} className="ml-1 text-slate-400 hover:text-slate-600">
                <X className="h-3 w-3" />
              </button>
            </span>
          )}

          {activePreset && (
            <span className="inline-flex items-center gap-1 rounded-md bg-white px-2 py-1 shadow-sm border border-slate-200 dark:bg-slate-900 dark:border-slate-700">
              <span className="text-slate-400 font-semibold">Preset:</span>
              <span className="font-medium text-amber-600">
                {activePreset === "toDeliver" ? "To Deliver" : activePreset === "lateSLA" ? "Late SLA" : activePreset === "deliveredUnpaid" ? "Delivered & Unpaid" : "Emergency SLA"}
              </span>
              <button onClick={() => setActivePreset(null)} className="ml-1 text-slate-400 hover:text-slate-600">
                <X className="h-3 w-3" />
              </button>
            </span>
          )}

          <button
            onClick={resetAllFilters}
            className="ml-auto text-xs text-rose-600 hover:text-rose-700 font-semibold hover:underline"
          >
            Clear All Filters
          </button>
        </div>
      )}

      {/* Sticky Omnibox Search Bar Container */}
      <div className="sticky top-[56px] z-10 bg-white/95 py-3 dark:bg-slate-900/95 backdrop-blur border-b border-slate-200/50 dark:border-slate-800/50 mb-4 mt-2 -mx-4 px-4" ref={searchContainerRef}>
        <div className="relative w-full max-w-xl">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <Input
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setShowSearchDropdown(true);
            }}
            onFocus={() => {
              if (searchQuery.trim()) setShowSearchDropdown(true);
            }}
            placeholder="Search by Order ID, Salon Name, Products, or Status..."
            className="pl-9 pr-24"
          />
          {searchQuery && (
            <button
              onClick={() => {
                setSearchQuery("");
                setSearchTarget("all");
                setShowSearchDropdown(false);
              }}
              className="absolute right-16 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-1"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}

          {/* Search Target Tag Badge */}
          {searchTarget !== "all" && (
            <span className="absolute right-2 top-1/2 -translate-y-1/2 bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300 text-[10px] font-semibold px-2 py-0.5 rounded">
              in {searchTarget}
            </span>
          )}

          {/* Odoo Style Omnibox Dropdown */}
          {showSearchDropdown && searchQuery.trim() && (
            <div className="absolute left-0 right-0 top-full mt-1.5 bg-white dark:bg-slate-800 rounded-xl shadow-xl border border-slate-200 dark:border-slate-700 py-1.5 z-30 overflow-hidden text-xs">
              <div className="px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                Filter Field Target:
              </div>

              <button
                onClick={() => {
                  setSearchTarget("all");
                  setShowSearchDropdown(false);
                }}
                className={`w-full px-3 py-2 text-left flex items-center justify-between hover:bg-slate-50 dark:hover:bg-slate-700/50 ${
                  searchTarget === "all" ? "bg-slate-50 font-semibold text-blue-600 dark:bg-slate-700/50" : "text-slate-700 dark:text-slate-200"
                }`}
              >
                <span className="flex items-center gap-2">
                  <Search className="h-3.5 w-3.5 text-slate-400" />
                  Search <strong>All Fields</strong> for <span className="text-blue-600 italic">"{searchQuery}"</span>
                </span>
                <span className="text-[10px] text-slate-400">General</span>
              </button>

              <button
                onClick={() => {
                  setSearchTarget("salon");
                  setShowSearchDropdown(false);
                }}
                className={`w-full px-3 py-2 text-left flex items-center justify-between hover:bg-slate-50 dark:hover:bg-slate-700/50 ${
                  searchTarget === "salon" ? "bg-slate-50 font-semibold text-blue-600 dark:bg-slate-700/50" : "text-slate-700 dark:text-slate-200"
                }`}
              >
                <span className="flex items-center gap-2">
                  <Search className="h-3.5 w-3.5 text-indigo-500" />
                  Search <strong>Salon / Customer</strong> for <span className="text-blue-600 italic">"{searchQuery}"</span>
                </span>
                <span className="text-[10px] text-slate-400">Customer</span>
              </button>

              <button
                onClick={() => {
                  setSearchTarget("orderNo");
                  setShowSearchDropdown(false);
                }}
                className={`w-full px-3 py-2 text-left flex items-center justify-between hover:bg-slate-50 dark:hover:bg-slate-700/50 ${
                  searchTarget === "orderNo" ? "bg-slate-50 font-semibold text-blue-600 dark:bg-slate-700/50" : "text-slate-700 dark:text-slate-200"
                }`}
              >
                <span className="flex items-center gap-2">
                  <Search className="h-3.5 w-3.5 text-emerald-500" />
                  Search <strong>Order Number #</strong> for <span className="text-blue-600 italic">"{searchQuery}"</span>
                </span>
                <span className="text-[10px] text-slate-400">Order ID</span>
              </button>

              <button
                onClick={() => {
                  setSearchTarget("product");
                  setShowSearchDropdown(false);
                }}
                className={`w-full px-3 py-2 text-left flex items-center justify-between hover:bg-slate-50 dark:hover:bg-slate-700/50 ${
                  searchTarget === "product" ? "bg-slate-50 font-semibold text-blue-600 dark:bg-slate-700/50" : "text-slate-700 dark:text-slate-200"
                }`}
              >
                <span className="flex items-center gap-2">
                  <PackagePlus className="h-3.5 w-3.5 text-amber-500" />
                  Search <strong>Products in Order</strong> for <span className="text-blue-600 italic">"{searchQuery}"</span>
                </span>
                <span className="text-[10px] text-slate-400">Line Items</span>
              </button>

              {/* Smart Omnibox Actions for Delivery, Dates, and Statuses */}
              {(() => {
                const qLower = searchQuery.trim().toLowerCase();
                const matchedStatus = STATUSES.find((s) => s.toLowerCase().includes(qLower));
                const isDeliveryQuery = qLower.includes("deliv") || qLower.includes("date") || qLower.includes("sla") || qLower.includes("eta");
                const isPaymentQuery = qLower.includes("pay") || qLower.includes("paid") || qLower.includes("unpaid");

                if (!matchedStatus && !isDeliveryQuery && !isPaymentQuery) return null;

                return (
                  <div className="border-t border-slate-100 dark:border-slate-700 mt-1 pt-1 space-y-0.5">
                    <div className="px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                      Smart Filter Shortcuts:
                    </div>

                    {isDeliveryQuery && (
                      <>
                        <button
                          onClick={() => {
                            setDateBasis("delivered");
                            if (dateFilter === "all") setDateFilter("month");
                            setSearchQuery("");
                            setShowSearchDropdown(false);
                          }}
                          className="w-full px-3 py-1.5 text-left flex items-center justify-between hover:bg-slate-50 dark:hover:bg-slate-700/50 text-emerald-600 dark:text-emerald-400 font-medium"
                        >
                          <span className="flex items-center gap-2">
                            <Truck className="h-3.5 w-3.5" />
                            Filter by: <strong>Actual Delivery Date</strong>
                          </span>
                          <span className="text-[10px] bg-emerald-50 text-emerald-700 dark:bg-emerald-950 px-1.5 py-0.5 rounded">
                            Date Basis
                          </span>
                        </button>

                        <button
                          onClick={() => {
                            setDateBasis("expected");
                            if (dateFilter === "all") setDateFilter("month");
                            setSearchQuery("");
                            setShowSearchDropdown(false);
                          }}
                          className="w-full px-3 py-1.5 text-left flex items-center justify-between hover:bg-slate-50 dark:hover:bg-slate-700/50 text-blue-600 dark:text-blue-400 font-medium"
                        >
                          <span className="flex items-center gap-2">
                            <Calendar className="h-3.5 w-3.5" />
                            Filter by: <strong>Expected Delivery Date (ETA)</strong>
                          </span>
                          <span className="text-[10px] bg-blue-50 text-blue-700 dark:bg-blue-950 px-1.5 py-0.5 rounded">
                            Date Basis
                          </span>
                        </button>

                        <button
                          onClick={() => {
                            applyPreset("toDeliver");
                            setSearchQuery("");
                            setShowSearchDropdown(false);
                          }}
                          className="w-full px-3 py-1.5 text-left flex items-center justify-between hover:bg-slate-50 dark:hover:bg-slate-700/50 text-indigo-600 dark:text-indigo-400 font-medium"
                        >
                          <span className="flex items-center gap-2">
                            <Truck className="h-3.5 w-3.5" />
                            Preset: <strong>To Deliver (Packed/Dispatched)</strong>
                          </span>
                          <span className="text-[10px] bg-indigo-50 text-indigo-700 dark:bg-indigo-950 px-1.5 py-0.5 rounded">
                            Preset
                          </span>
                        </button>

                        <button
                          onClick={() => {
                            applyPreset("deliveredUnpaid");
                            setSearchQuery("");
                            setShowSearchDropdown(false);
                          }}
                          className="w-full px-3 py-1.5 text-left flex items-center justify-between hover:bg-slate-50 dark:hover:bg-slate-700/50 text-amber-600 dark:text-amber-400 font-medium"
                        >
                          <span className="flex items-center gap-2">
                            <Zap className="h-3.5 w-3.5" />
                            Preset: <strong>Delivered & Unpaid</strong>
                          </span>
                          <span className="text-[10px] bg-amber-50 text-amber-700 dark:bg-amber-950 px-1.5 py-0.5 rounded">
                            Preset
                          </span>
                        </button>
                      </>
                    )}

                    {matchedStatus && (
                      <button
                        onClick={() => {
                          toggleStatus(matchedStatus);
                          setSearchQuery("");
                          setShowSearchDropdown(false);
                        }}
                        className="w-full px-3 py-1.5 text-left flex items-center justify-between hover:bg-slate-50 dark:hover:bg-slate-700/50 text-indigo-600 dark:text-indigo-400 font-medium"
                      >
                        <span className="flex items-center gap-2">
                          <Truck className="h-3.5 w-3.5" />
                          Apply Status Filter: <strong>{matchedStatus}</strong>
                        </span>
                        <span className="text-[10px] bg-indigo-50 text-indigo-700 dark:bg-indigo-950 px-1.5 py-0.5 rounded">
                          Add Status Chip
                        </span>
                      </button>
                    )}

                    {isPaymentQuery && (
                      <>
                        {["Unpaid", "Paid", "Partial"].map((p) => {
                          if (!p.toLowerCase().includes(qLower) && !qLower.includes("pay")) return null;
                          return (
                            <button
                              key={p}
                              onClick={() => {
                                togglePayment(p);
                                setSearchQuery("");
                                setShowSearchDropdown(false);
                              }}
                              className="w-full px-3 py-1.5 text-left flex items-center justify-between hover:bg-slate-50 dark:hover:bg-slate-700/50 text-emerald-600 dark:text-emerald-400 font-medium"
                            >
                              <span className="flex items-center gap-2">
                                <Zap className="h-3.5 w-3.5" />
                                Apply Payment Filter: <strong>{p}</strong>
                              </span>
                              <span className="text-[10px] bg-emerald-50 text-emerald-700 dark:bg-emerald-950 px-1.5 py-0.5 rounded">
                                Add Payment Chip
                              </span>
                            </button>
                          );
                        })}
                      </>
                    )}
                  </div>
                );
              })()}
            </div>
          )}
        </div>
      </div>

      <div className="space-y-3">
        {rows.map((o) => {
          const { billAmount, amountPaid, balanceAmount, statusText, statusColor } = getOrderPaymentInfo(o);
          return (
            <div key={o.id}>
              <Card className="p-4">
                <div className="flex flex-wrap items-center gap-3">
                  <div className="w-28 sm:w-32 shrink-0">
                    <div className="font-semibold text-slate-900 dark:text-white flex flex-col gap-0.5">
                      <span>{o.orderNo}</span>
                      {o.isAdminDeleted && (
                        <span className="text-[10px] font-bold text-rose-600 dark:text-rose-400 uppercase tracking-wider">
                          (Deleted from Admin)
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-slate-400 space-y-0.5 mt-1">
                      <div>Pl: {fmtDateTime(o.createdAt)}</div>
                      {o.deliveredAt ? (
                        <div className="text-emerald-600 dark:text-emerald-400 font-medium flex items-center gap-1" title="Delivered Date">
                          <Truck className="h-3 w-3 shrink-0" />
                          <span>Del: {fmtDate(o.deliveredAt)}</span>
                        </div>
                      ) : o.expectedDelivery ? (
                        <div
                          className={`font-medium flex items-center gap-1 ${
                            Date.now() > o.expectedDelivery && o.status !== "Delivered" && o.status !== "Cancelled" && o.status !== "Returned"
                              ? "text-rose-600 dark:text-rose-400 font-semibold"
                              : "text-blue-600 dark:text-blue-400"
                          }`}
                          title="Expected Delivery Date"
                        >
                          <Calendar className="h-3 w-3 shrink-0" />
                          <span>Exp: {fmtDate(o.expectedDelivery)}</span>
                        </div>
                      ) : null}
                      {o.updatedAt && Math.abs(o.updatedAt - o.createdAt) > 60000 && (
                        <div className="text-indigo-600 dark:text-indigo-400 font-medium" title="Last Updated">
                          Up: {fmtDateTime(o.updatedAt)}
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium text-slate-700 dark:text-slate-200">
                      {(() => {
                        const salonName = o.resolvedSalonName || o.salonName;
                        const custName = o.customerName;
                        if (salonName && salonName !== "-" && custName && custName !== "-" && custName !== salonName) {
                          return (
                            <span>
                              {salonName} <span className="text-xs text-slate-400 font-normal">({custName})</span>
                            </span>
                          );
                        }
                        return <span>{salonName || custName || "-"}</span>;
                      })()}
                    </div>
                    <div className="flex items-center gap-1.5 text-xs text-slate-400 flex-wrap">
                      <StatusBadge value={o.channel} />
                      <span>{o.lines.length} items</span>
                      <span>·</span>
                      <button
                        onClick={(e) => handlePaymentToggle(e, o)}
                        className="hover:scale-105 active:scale-95 transition cursor-pointer"
                        title={statusText === "Paid" ? "Click to mark as Unpaid" : "Click to mark as Paid"}
                      >
                        <Badge color={statusColor}>{statusText}</Badge>
                      </button>

                      {/* Direct Delivery Date Pill in Order Row */}
                      <span>·</span>
                      {(() => {
                        const now = Date.now();
                        const isLate = !!(
                          o.expectedDelivery &&
                          now > o.expectedDelivery &&
                          o.status !== "Delivered" &&
                          o.status !== "Cancelled" &&
                          o.status !== "Returned"
                        );

                        if (o.deliveredAt) {
                          return (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setDeliveryModalOrder(o);
                              }}
                              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100 hover:border-emerald-300 dark:bg-emerald-950/60 dark:text-emerald-300 dark:border-emerald-800 cursor-pointer transition shadow-xs"
                              title="Actual Delivered Date. Click to change or reschedule."
                            >
                              <Truck className="h-3 w-3 text-emerald-600 dark:text-emerald-400" />
                              <span>Delivered: {fmtDate(o.deliveredAt)}</span>
                              <Pencil className="h-2.5 w-2.5 opacity-60 ml-0.5" />
                            </button>
                          );
                        }

                        if (o.expectedDelivery) {
                          return (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setDeliveryModalOrder(o);
                              }}
                              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium border cursor-pointer transition shadow-xs ${
                                isLate
                                  ? "bg-rose-50 text-rose-700 border-rose-300 hover:bg-rose-100 dark:bg-rose-950/60 dark:text-rose-300 dark:border-rose-800"
                                  : "bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100 dark:bg-blue-950/60 dark:text-blue-300 dark:border-blue-800"
                              }`}
                              title={
                                isLate
                                  ? "Delivery SLA Overdue! Click to reschedule."
                                  : "Expected Delivery Date (ETA). Click to edit."
                              }
                            >
                              <Calendar className="h-3 w-3 text-blue-600 dark:text-blue-400" />
                              <span>Exp: {fmtDate(o.expectedDelivery)}</span>
                              {isLate && (
                                <span className="text-[9px] bg-rose-200 text-rose-800 dark:bg-rose-900 dark:text-rose-200 px-1 rounded font-bold">
                                  LATE
                                </span>
                              )}
                              <Pencil className="h-2.5 w-2.5 opacity-60 ml-0.5" />
                            </button>
                          );
                        }

                        return (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setDeliveryModalOrder(o);
                            }}
                            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium text-slate-500 bg-slate-50 border border-dashed border-slate-300 hover:border-blue-400 hover:text-blue-600 hover:bg-blue-50/50 dark:bg-slate-800/60 dark:border-slate-700 dark:text-slate-400 dark:hover:border-blue-500 dark:hover:text-blue-300 cursor-pointer transition"
                            title="No delivery date set. Click to add delivery date."
                          >
                            <Calendar className="h-3 w-3 text-slate-400" />
                            <span>+ Delivery Date</span>
                          </button>
                        );
                      })()}

                      {(o.paymentMethod || o.paymentMode) && (
                        <>
                          <span>·</span>
                          <span className="font-semibold text-slate-600 dark:text-slate-300">
                            {String(o.paymentMethod || o.paymentMode).toUpperCase()}
                          </span>
                        </>
                      )}
                      {(o.salesExecutive || o.createdBy) && (
                        <>
                          <span>·</span>
                          <span className="text-slate-500">
                            Exec: <span className="font-semibold text-indigo-600 dark:text-indigo-400">{o.salesExecutive || o.createdBy}</span>
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                  <div className="text-right flex flex-col justify-center items-end text-xs">
                    <div>Bill: <span className="font-semibold tabular-nums text-slate-900 dark:text-white">{inr(billAmount)}</span></div>
                    <div>Paid: <span className="font-semibold tabular-nums text-slate-700 dark:text-slate-200">{inr(amountPaid)}</span></div>
                    <div>Bal: <span className="font-semibold tabular-nums text-rose-600 dark:text-rose-400">{inr(balanceAmount)}</span></div>
                    <div className="text-[10px] text-emerald-600">Profit: +{inr(o.profit)} {o.subtotal > 0 && `(${((o.profit / o.subtotal) * 100).toFixed(1)}%)`}</div>
                  </div>
                  <Select value={o.status} onChange={(e) => changeStatus(o, e.target.value as SalesStatus)} className="w-auto cursor-pointer" onClick={(e) => e.stopPropagation()}>
                    {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                  </Select>
                  <Button variant="secondary" onClick={(e) => { e.stopPropagation(); navigate(`/orders/${o.id}`); }}><Eye className="h-4 w-4" /> Details</Button>
                  <Button
                    variant="secondary"
                    onClick={(e) => { e.stopPropagation(); setDeliveryModalOrder(o); }}
                    title={o.expectedDelivery || o.deliveredAt ? "Edit Delivery Date" : "Add Delivery Date"}
                    className={o.expectedDelivery || o.deliveredAt ? "text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-800" : ""}
                  >
                    <Calendar className="h-4 w-4" /> Delivery
                  </Button>
                  <Button variant="secondary" onClick={(e) => { e.stopPropagation(); setNotify(o); }}><Bell className="h-4 w-4" /> Notify</Button>
                  <Button variant="secondary" onClick={(e) => { e.stopPropagation(); setInvoice(o); }}><FileText className="h-4 w-4" /> Invoice</Button>
                  <button
                    onClick={(e) => { e.stopPropagation(); handleDeleteOrder(o); }}
                    className="rounded-lg p-2 text-slate-400 hover:bg-rose-50 hover:text-rose-500 dark:hover:bg-rose-950 dark:hover:text-rose-400 transition"
                    title="Delete Order"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </Card>
            </div>
          );
        })}
        {!rows.length && <p className="py-10 text-center text-sm text-slate-400">No orders match these filters.</p>}
      </div>

      <InvoiceModal order={invoice} onClose={() => setInvoice(null)} />
      <NotifyModal order={notify} onClose={() => setNotify(null)} />
      <DeliveryDateModal order={deliveryModalOrder} onClose={() => setDeliveryModalOrder(null)} />
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

function DeliveryDateModal({ order, onClose }: { order: SalesOrder | null; onClose: () => void }) {
  const [dateType, setDateType] = useState<"expected" | "delivered">("expected");
  const [dateValue, setDateValue] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!order) return;
    if (order.deliveredAt) {
      setDateType("delivered");
      setDateValue(new Date(order.deliveredAt).toISOString().slice(0, 10));
    } else if (order.expectedDelivery) {
      setDateType("expected");
      setDateValue(new Date(order.expectedDelivery).toISOString().slice(0, 10));
    } else {
      setDateType(order.status === "Delivered" ? "delivered" : "expected");
      setDateValue(new Date().toISOString().slice(0, 10));
    }
  }, [order]);

  if (!order) return null;

  const handleQuickPreset = (offsetDays: number) => {
    const d = new Date();
    d.setDate(d.getDate() + offsetDays);
    setDateValue(d.toISOString().slice(0, 10));
  };

  const handleSave = async () => {
    if (!dateValue) {
      toast.error("Please select a date");
      return;
    }
    setSaving(true);
    try {
      // Use noon to avoid timezone shift issues
      const ts = new Date(`${dateValue}T12:00:00`).getTime();
      const updates: { expectedDelivery?: number | null; deliveredAt?: number | null } = {};
      if (dateType === "expected") {
        updates.expectedDelivery = ts;
      } else {
        updates.deliveredAt = ts;
      }
      await saveOrderDeliveryDate(order.id, updates, order.orderNo);
      toast.success(
        `${dateType === "expected" ? "Expected delivery" : "Delivered"} date saved for ${order.orderNo}`
      );
      onClose();
    } catch (err: any) {
      console.error("Failed to save delivery date:", err);
      toast.error(`Error saving date: ${err.message || err}`);
    } finally {
      setSaving(false);
    }
  };

  const handleClear = async () => {
    if (!window.confirm(`Clear delivery date for order ${order.orderNo}?`)) return;
    setSaving(true);
    try {
      await saveOrderDeliveryDate(
        order.id,
        { expectedDelivery: null, deliveredAt: null },
        order.orderNo
      );
      toast.success(`Delivery date removed for ${order.orderNo}`);
      onClose();
    } catch (err: any) {
      toast.error(`Error removing date: ${err.message || err}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={!!order}
      onClose={onClose}
      title={`Set Delivery Date — ${order.orderNo}`}
      footer={
        <div className="flex w-full items-center justify-between gap-2">
          <div>
            {(order.expectedDelivery || order.deliveredAt) ? (
              <Button variant="danger" onClick={handleClear} disabled={saving}>
                <Trash2 className="h-4 w-4 mr-1.5" /> Clear Date
              </Button>
            ) : <span />}
          </div>
          <div className="flex items-center gap-2">
            <Button variant="secondary" onClick={onClose} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={saving || !dateValue}>
              <Save className="h-4 w-4 mr-1.5" /> Save Date
            </Button>
          </div>
        </div>
      }
    >
      <div className="space-y-4 py-2">
        <div className="rounded-lg bg-slate-50 dark:bg-slate-800/60 p-3 border border-slate-200 dark:border-slate-700 flex justify-between items-center text-xs">
          <div>
            <span className="text-slate-400 font-medium">Customer:</span>{" "}
            <span className="font-semibold text-slate-800 dark:text-slate-200">
              {(order as any).resolvedSalonName || order.salonName || (order as any).customerName || "-"}
            </span>
          </div>
          <div>
            <span className="text-slate-400 font-medium">Current Status:</span>{" "}
            <StatusBadge value={order.status} />
          </div>
        </div>

        {/* Date Type Selector */}
        <div>
          <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 block mb-1.5">
            Select Date Category:
          </label>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setDateType("expected")}
              className={`p-2.5 rounded-lg border text-left transition flex items-center gap-2 text-xs font-medium ${
                dateType === "expected"
                  ? "border-blue-600 bg-blue-50/70 text-blue-800 dark:bg-blue-950/50 dark:border-blue-500 dark:text-blue-300 ring-1 ring-blue-500"
                  : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"
              }`}
            >
              <Calendar className="h-4 w-4 text-blue-600 dark:text-blue-400 shrink-0" />
              <div>
                <div className="font-semibold">Expected Delivery (ETA)</div>
                <div className="text-[10px] text-slate-400">Scheduled arrival date</div>
              </div>
            </button>

            <button
              type="button"
              onClick={() => setDateType("delivered")}
              className={`p-2.5 rounded-lg border text-left transition flex items-center gap-2 text-xs font-medium ${
                dateType === "delivered"
                  ? "border-emerald-600 bg-emerald-50/70 text-emerald-800 dark:bg-emerald-950/50 dark:border-emerald-500 dark:text-emerald-300 ring-1 ring-emerald-500"
                  : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"
              }`}
            >
              <Truck className="h-4 w-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
              <div>
                <div className="font-semibold">Actual Delivered Date</div>
                <div className="text-[10px] text-slate-400">When package was received</div>
              </div>
            </button>
          </div>
        </div>

        {/* Date Picker Input */}
        <div>
          <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 block mb-1.5">
            {dateType === "expected" ? "Expected Delivery Date:" : "Delivered On:"}
          </label>
          <Input
            type="date"
            value={dateValue}
            onChange={(e) => setDateValue(e.target.value)}
            className="w-full text-sm py-2"
          />
        </div>

        {/* Quick Presets */}
        <div>
          <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 block mb-1.5">
            Quick Shortcuts:
          </span>
          <div className="flex flex-wrap gap-1.5">
            <button
              type="button"
              onClick={() => handleQuickPreset(0)}
              className="rounded-md border border-slate-200 bg-white px-2.5 py-1 text-xs text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
            >
              Today
            </button>
            <button
              type="button"
              onClick={() => handleQuickPreset(1)}
              className="rounded-md border border-slate-200 bg-white px-2.5 py-1 text-xs text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
            >
              Tomorrow
            </button>
            <button
              type="button"
              onClick={() => handleQuickPreset(2)}
              className="rounded-md border border-slate-200 bg-white px-2.5 py-1 text-xs text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
            >
              +2 Days
            </button>
            <button
              type="button"
              onClick={() => handleQuickPreset(3)}
              className="rounded-md border border-slate-200 bg-white px-2.5 py-1 text-xs text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
            >
              +3 Days
            </button>
            <button
              type="button"
              onClick={() => handleQuickPreset(7)}
              className="rounded-md border border-slate-200 bg-white px-2.5 py-1 text-xs text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
            >
              +1 Week
            </button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
