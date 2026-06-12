import { useMemo, useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import { Search, Plus, Minus, Trash2, ShoppingCart, Store, UserPlus, ChevronRight, ArrowLeft, Play, Trash, ChevronDown } from "lucide-react";
import { Button, Card, Input, Textarea, Select, PageHeader, Field } from "@/components/ui/primitives";
import { Modal } from "@/components/ui/Modal";
import { useDataStore } from "@/store/dataStore";
import { useUIStore } from "@/store/uiStore";
import { createSalesOrder, saveDoc, logActivity } from "@/services/data";
import { inr, uid } from "@/lib/utils";
import { orderTotals } from "@/lib/calc";
import type { OrderLine, PaymentStatus, SalesChannel, Salon } from "@/types";
import { getMergedProducts } from "@/services/productOverrides";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyRecord = Record<string, any>;

interface SalonDraft {
  salonId: string;
  salonName: string;
  lines: OrderLine[];
  channel: SalesChannel;
  payment: PaymentStatus;
  updatedAt: number;
}

export default function ManualOrderEntry() {
  const navigate = useNavigate();
  const { salons } = useDataStore();
  const adminProducts = useDataStore((s: any) => s.adminProducts || []) as AnyRecord[];
  const inventoryProducts = useDataStore((s: any) => s.inventoryProducts || []) as AnyRecord[];
  const adminCustomers = useDataStore((s: any) => s.adminCustomers || []);
  const defaultGst = useUIStore((s) => s.settings.defaultGst);

  // View state: "dashboard" or "entry"
  const [view, setView] = useState<"dashboard" | "entry">("dashboard");
  const [drafts, setDrafts] = useState<Record<string, SalonDraft>>({});

  // Active order entry state
  const [salonId, setSalonId] = useState("");
  const [channel, setChannel] = useState<SalesChannel>("manual");
  const [payment, setPayment] = useState<PaymentStatus>("Unpaid");
  const [search, setSearch] = useState("");
  const [lines, setLines] = useState<OrderLine[]>([]);
  const [newSalonOpen, setNewSalonOpen] = useState(false);
  const [variantPickerProduct, setVariantPickerProduct] = useState<AnyRecord | null>(null);

  // Searchable combobox states & refs
  const [customerSearchQuery, setCustomerSearchQuery] = useState("");
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const selectContainerRef = useRef<HTMLDivElement>(null);

  // Helper to resolve salon/customer name
  const getSalonName = (id: string) => {
    if (!id) return "Unassigned Draft";
    const s = salons.find((x) => x.id === id);
    if (s) return s.name;
    const c = adminCustomers.find((x: any) => x.id === id);
    if (c) return c.name || c.displayName || c.email || "Customer";
    return "Unknown Customer";
  };

  // Unified list of B2B Salons and App Customers
  const combinedCustomersList = useMemo(() => {
    const list: Array<{
      id: string;
      name: string;
      ownerName: string;
      phone: string;
      email: string;
      gstin: string;
      type: "B2B" | "App";
      description?: string;
    }> = [];

    salons.forEach((s) => {
      list.push({
        id: s.id,
        name: s.name || "",
        ownerName: s.ownerName || "",
        phone: s.phone || "",
        email: s.email || "",
        gstin: s.gstin || "",
        type: "B2B",
        description: s.description,
      });
    });

    adminCustomers.forEach((c: any) => {
      const salonName = c.salonName || c.salon || c.name || c.displayName || "Unknown Customer";
      const ownerName = (c.salonName || c.salon) ? (c.name || c.displayName || "") : "";
      list.push({
        id: c.id,
        name: salonName,
        ownerName: ownerName,
        phone: c.phone || c.phoneNumber || "",
        email: c.email || "",
        gstin: "",
        type: "App",
      });
    });

    return list;
  }, [salons, adminCustomers]);

  // Sync typed text with selected salonId
  useEffect(() => {
    if (salonId) {
      const match = combinedCustomersList.find((x) => x.id === salonId);
      if (match) {
        setCustomerSearchQuery(match.name);
      } else {
        setCustomerSearchQuery("");
      }
    } else {
      setCustomerSearchQuery("");
    }
  }, [salonId, combinedCustomersList]);

  // Click outside to close dropdown
  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (selectContainerRef.current && !selectContainerRef.current.contains(e.target as Node)) {
        setIsDropdownOpen(false);
        if (salonId) {
          const match = combinedCustomersList.find((x) => x.id === salonId);
          if (match) {
            setCustomerSearchQuery(match.name);
          }
        } else {
          setCustomerSearchQuery("");
        }
      }
    };
    document.addEventListener("mousedown", handleOutsideClick);
    return () => document.removeEventListener("mousedown", handleOutsideClick);
  }, [salonId, combinedCustomersList]);

  // Fuzzy multi-attribute filter matching criteria
  const filteredCustomers = useMemo(() => {
    const q = customerSearchQuery.trim().toLowerCase();
    if (!q) return combinedCustomersList;

    return combinedCustomersList.filter((item) => {
      const nameMatch = item.name.toLowerCase().includes(q);
      const ownerMatch = item.ownerName.toLowerCase().includes(q);
      const phoneMatch = item.phone.toLowerCase().includes(q);
      const emailMatch = item.email.toLowerCase().includes(q);
      const gstinMatch = item.gstin.toLowerCase().includes(q);

      return nameMatch || ownerMatch || phoneMatch || emailMatch || gstinMatch;
    });
  }, [combinedCustomersList, customerSearchQuery]);

  // ── Load all drafts from localStorage on mount ───────────────────────────
  useEffect(() => {
    try {
      const saved = localStorage.getItem("pc_manual_drafts");
      if (saved) {
        setDrafts(JSON.parse(saved));
      }
    } catch {
      // ignore
    }
  }, []);

  const saveAllDrafts = (updatedDrafts: Record<string, SalonDraft>) => {
    setDrafts(updatedDrafts);
    localStorage.setItem("pc_manual_drafts", JSON.stringify(updatedDrafts));
  };

  // ── Auto-save active draft to drafts record on changes ────────────────────
  useEffect(() => {
    if (view !== "entry") return;
    const key = salonId || "unsigned";
    const current = drafts[key];
    const nextLines = lines;
    const nextChannel = channel;
    const nextPayment = payment;

    if (
      JSON.stringify(current?.lines) !== JSON.stringify(nextLines) ||
      current?.channel !== nextChannel ||
      current?.payment !== nextPayment
    ) {
      const updated = {
        ...drafts,
        [key]: {
          salonId,
          salonName: getSalonName(salonId),
          lines: nextLines,
          channel: nextChannel,
          payment: nextPayment,
          updatedAt: Date.now(),
        },
      };
      saveAllDrafts(updated);
    }
  }, [lines, channel, payment, salonId, view]);

  // Handle switching salonId inside Order Entry
  const handleSalonChange = (newSalonId: string) => {
    const key = newSalonId || "unsigned";
    const existing = drafts[key];
    if (existing) {
      setLines(existing.lines || []);
      setChannel(existing.channel || "manual");
      setPayment(existing.payment || "Unpaid");
    } else {
      const oldKey = salonId || "unsigned";
      const oldDraft = drafts[oldKey];
      if (oldDraft && oldDraft.lines?.length) {
        const nextDrafts = { ...drafts };
        delete nextDrafts[oldKey];
        nextDrafts[key] = {
          salonId: newSalonId,
          salonName: getSalonName(newSalonId),
          lines: oldDraft.lines,
          channel: oldDraft.channel,
          payment: oldDraft.payment,
          updatedAt: Date.now(),
        };
        saveAllDrafts(nextDrafts);
      }
    }
    setSalonId(newSalonId);
  };

  // Start new manual order
  const startNewOrder = () => {
    setSalonId("");
    setLines([]);
    setChannel("manual");
    setPayment("Unpaid");
    setView("entry");
  };

  // Open existing draft
  const continueDraft = (draft: SalonDraft) => {
    setSalonId(draft.salonId);
    setLines(draft.lines || []);
    setChannel(draft.channel || "manual");
    setPayment(draft.payment || "Unpaid");
    setView("entry");
  };

  // Delete draft
  const deleteDraft = (key: string) => {
    if (!confirm("Are you sure you want to delete this draft order?")) return;
    const next = { ...drafts };
    delete next[key];
    saveAllDrafts(next);
    toast.success("Draft deleted");
  };

  const activeDraftsList = useMemo(() => {
    return Object.entries(drafts).filter(([_, d]) => d.lines && d.lines.length > 0);
  }, [drafts]);

  const formatTime = (ts: number) => {
    if (!ts) return "-";
    return new Date(ts).toLocaleString("en-IN", {
      hour: "2-digit",
      minute: "2-digit",
      day: "2-digit",
      month: "short",
    });
  };

  // ── Existing entry billing features ─────────────────────────────────────
  const mergedAdminProducts = useMemo(() => getMergedProducts(adminProducts), [adminProducts]);

  const allProducts = useMemo(() => {
    return [...mergedAdminProducts, ...inventoryProducts];
  }, [mergedAdminProducts, inventoryProducts]);

  const matches = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return [];
    return allProducts
      .filter((p: AnyRecord) => {
        const name = (p.name || "").toLowerCase();
        const sku = (p.sku || "").toLowerCase();
        const brand = (p.brand || "").toLowerCase();
        const category = (p.category || p.categoryName || "").toLowerCase();
        const barcode = (p.barcode || "").toLowerCase();
        return (
          name.includes(q) ||
          sku.includes(q) ||
          brand.includes(q) ||
          category.includes(q) ||
          barcode.includes(q)
        );
      })
      .slice(0, 8);
  }, [search, allProducts]);

  const addProduct = (p: AnyRecord, variant?: AnyRecord) => {
    const lineId = variant ? `${p.id}__${variant.id}` : p.id;
    const name = variant
      ? `${p.name} — ${variant.value || variant.shadeName || variant.name || variant.attribute || ""}`
      : p.name;
    const sku = variant?.sku || p.sku || "";
    const price = variant?.price ?? p.price ?? p.sellingPrice ?? 0;
    const cost = p.costPrice ?? 0;
    const gstRate = p.gstRate ?? 0;

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

    // Clear active draft from list
    const key = salonId || "unsigned";
    const nextDrafts = { ...drafts };
    delete nextDrafts[key];
    saveAllDrafts(nextDrafts);

    toast.success("Order created & stock updated");
    navigate("/sales-orders");
  };

  const clearActiveDraft = () => {
    if (!confirm("Are you sure you want to clear the active draft?")) return;
    const key = salonId || "unsigned";
    const nextDrafts = { ...drafts };
    delete nextDrafts[key];
    saveAllDrafts(nextDrafts);

    setLines([]);
    setSalonId("");
    setChannel("manual");
    setPayment("Unpaid");
    setView("dashboard");
    toast.success("Draft cleared");
  };

  const handleSalonCreated = (salon: Salon) => {
    handleSalonChange(salon.id);
    setNewSalonOpen(false);
  };

  // ── Render Dashboard View ───────────────────────────────────────────────
  if (view === "dashboard") {
    return (
      <div>
        <PageHeader 
          title="Manual Orders Dashboard" 
          subtitle="Manage active draft orders or create new sales invoices."
          actions={
            <Button onClick={startNewOrder} className="flex items-center gap-2">
              <Plus size={16} /> Create New Manual Order
            </Button>
          }
        />

        <div className="mt-6">
          <Card className="p-5">
            <h3 className="mb-4 text-sm font-semibold text-slate-900 dark:text-white">Active Draft Orders</h3>
            {activeDraftsList.length === 0 ? (
              <div className="py-12 text-center text-slate-400">
                <ShoppingCart className="mx-auto mb-4 h-12 w-12 text-slate-300" />
                <p className="text-sm font-medium">No active draft orders found.</p>
                <p className="text-xs text-slate-400 mt-1">Click the button above to start a new manual order.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 text-left text-xs uppercase text-slate-400 dark:border-slate-700">
                      <th className="pb-2">Salon / Customer Name</th>
                      <th className="pb-2 text-center">Items Qty</th>
                      <th className="pb-2 text-right">Draft Total</th>
                      <th className="pb-2 text-right">Last Updated</th>
                      <th className="pb-2 text-center">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {activeDraftsList.map(([key, d]) => {
                      const draftTotal = orderTotals(d.lines).total;
                      const itemCount = d.lines.reduce((acc, l) => acc + l.qty, 0);
                      return (
                        <tr key={key} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                          <td className="py-3 font-semibold text-slate-900 dark:text-white">
                            {d.salonName}
                          </td>
                          <td className="py-3 text-center tabular-nums text-slate-600">
                            {itemCount} item{itemCount !== 1 ? "s" : ""}
                          </td>
                          <td className="py-3 text-right font-semibold tabular-nums text-slate-800 dark:text-slate-200">
                            {inr(draftTotal)}
                          </td>
                          <td className="py-3 text-right text-slate-400 tabular-nums">
                            {formatTime(d.updatedAt)}
                          </td>
                          <td className="py-3 text-center">
                            <div className="flex items-center justify-center gap-2">
                              <Button variant="secondary" onClick={() => continueDraft(d)} className="flex items-center gap-1 text-xs py-1 px-2.5">
                                <Play size={12} className="text-slate-500" /> Continue
                              </Button>
                              <Button variant="secondary" onClick={() => deleteDraft(key)} className="flex items-center gap-1 text-xs py-1 px-2.5 text-rose-600 hover:bg-rose-50 hover:text-rose-700">
                                <Trash size={12} /> Clear
                              </Button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </div>
      </div>
    );
  }

  // ── Render Order Entry Form ─────────────────────────────────────────────
  return (
    <div>
      <PageHeader 
        title="Manual Order Entry" 
        subtitle="Fast billing for phone & WhatsApp orders." 
        actions={
          <Button variant="secondary" onClick={() => setView("dashboard")} className="flex items-center gap-2">
            <ArrowLeft className="h-4 w-4" /> Back to Dashboard
          </Button>
        }
      />

      {lines.length > 0 && (
        <div className="mb-4 flex items-center justify-between rounded-lg border border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-800">
          <span>📋 Draft saved — {lines.length} item{lines.length > 1 ? "s" : ""} in order</span>
          <button onClick={clearActiveDraft} className="text-xs underline hover:text-amber-900">Clear draft</button>
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
            <div ref={selectContainerRef} className="relative w-full">
              <div className="relative">
                <Input
                  type="text"
                  value={customerSearchQuery}
                  onChange={(e) => {
                    setCustomerSearchQuery(e.target.value);
                    setIsDropdownOpen(true);
                    if (e.target.value === "") {
                      setSalonId("");
                    }
                  }}
                  onFocus={(e) => {
                    e.target.select();
                    setIsDropdownOpen(true);
                  }}
                  placeholder="— select customer —"
                  className="pr-10"
                />
                <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400">
                  <ChevronDown size={16} />
                </div>
              </div>

              {isDropdownOpen && (
                <div className="absolute left-0 z-50 mt-1 max-h-60 w-full overflow-y-auto rounded-lg border border-slate-200 bg-white py-1 shadow-lg dark:border-slate-700 dark:bg-slate-800">
                  {filteredCustomers.length === 0 ? (
                    <div className="px-3 py-2 text-sm text-slate-400 text-center">No matches found</div>
                  ) : (
                    <>
                      {/* B2B Salons Group */}
                      {filteredCustomers.some(x => x.type === "B2B") && (
                        <div>
                          <div className="bg-slate-50 dark:bg-slate-700/50 px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                            Salon Customers (B2B)
                          </div>
                          {filteredCustomers
                            .filter(x => x.type === "B2B")
                            .map((s) => {
                              const isSelected = s.id === salonId;
                              const matchDetails = [
                                s.ownerName && `Owner: ${s.ownerName}`,
                                s.phone && `Phone: ${s.phone}`,
                                s.email && `Email: ${s.email}`,
                                s.gstin && `GSTIN: ${s.gstin}`,
                              ].filter(Boolean).join(" | ");

                              return (
                                <button
                                  key={s.id}
                                  type="button"
                                  onClick={() => {
                                    handleSalonChange(s.id);
                                    setIsDropdownOpen(false);
                                  }}
                                  className={`flex w-full flex-col px-3 py-2 text-left text-sm hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors ${
                                    isSelected 
                                      ? "bg-indigo-50 dark:bg-indigo-950/40 text-indigo-950 dark:text-indigo-200" 
                                      : "text-slate-700 dark:text-slate-300"
                                  }`}
                                >
                                  <span className="font-medium">{s.name}</span>
                                  {matchDetails && (
                                    <span className="text-[10px] text-slate-400 truncate w-full">
                                      {matchDetails}
                                    </span>
                                  )}
                                </button>
                              );
                            })}
                        </div>
                      )}

                      {/* App Customers Group */}
                      {filteredCustomers.some(x => x.type === "App") && (
                        <div className={filteredCustomers.some(x => x.type === "B2B") ? "border-t border-slate-100 dark:border-slate-700/50 mt-1 pt-1" : ""}>
                          <div className="bg-slate-50 dark:bg-slate-700/50 px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                            App Customers
                          </div>
                          {filteredCustomers
                            .filter(x => x.type === "App")
                            .map((c) => {
                              const isSelected = c.id === salonId;
                              const matchDetails = [
                                c.ownerName && `Owner: ${c.ownerName}`,
                                c.phone && `Phone: ${c.phone}`,
                                c.email && `Email: ${c.email}`,
                              ].filter(Boolean).join(" | ");

                              return (
                                <button
                                  key={c.id}
                                  type="button"
                                  onClick={() => {
                                    handleSalonChange(c.id);
                                    setIsDropdownOpen(false);
                                  }}
                                  className={`flex w-full flex-col px-3 py-2 text-left text-sm hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors ${
                                    isSelected 
                                      ? "bg-indigo-50 dark:bg-indigo-950/40 text-indigo-950 dark:text-indigo-200" 
                                      : "text-slate-700 dark:text-slate-300"
                                  }`}
                                >
                                  <span className="font-medium">{c.name}</span>
                                  {matchDetails && (
                                    <span className="text-[10px] text-slate-400 truncate w-full">
                                      {matchDetails}
                                    </span>
                                  )}
                                </button>
                              );
                            })}
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}
            </div>
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
