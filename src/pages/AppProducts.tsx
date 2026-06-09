import { useMemo, useState, useRef, useEffect } from "react";
import { Package, Search, Plus, ChevronDown, ChevronRight, Trash2, Pencil, FileDown } from "lucide-react";
import { useDataStore } from "@/store/dataStore";
import { saveInventoryProduct, deleteInventoryProduct, updateProductField, updateInventoryProductField, updateVariantField } from "@/services/data";
import { Button, Card, PageHeader, Input } from "@/components/ui/primitives";
import { Modal } from "@/components/ui/Modal";
import { uid, exportCsv } from "@/lib/utils";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyRecord = Record<string, any>;

const fmt = (amount: number | undefined | null) => {
  if (!amount && amount !== 0) return "-";
  return `₹${Number(amount).toLocaleString("en-IN")}`;
};

// ─── Inline Editable Cell ────────────────────────────────────────────────────

function InlineEditCell({
  productId,
  variantId,
  field,
  value,
  prefix = "₹",
  isAdmin,
}: {
  productId: string;
  variantId?: string;
  field: string;
  value: number | undefined | null;
  prefix?: string;
  isAdmin: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const startEdit = (e: React.MouseEvent) => {
    e.stopPropagation();
    setDraft(value != null ? String(value) : "");
    setEditing(true);
    setTimeout(() => inputRef.current?.select(), 30);
  };

  const commit = async () => {
    const num = parseFloat(draft);
    if (!isNaN(num) && num !== value) {
      setSaving(true);
      try {
        if (variantId) await updateVariantField(productId, variantId, field, num);
        else if (isAdmin) await updateProductField(productId, field, num);
        else await updateInventoryProductField(productId, field, num);
      } finally {
        setSaving(false);
      }
    }
    setEditing(false);
  };

  if (editing) {
    return (
      <input
        ref={inputRef}
        type="number"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => { if (e.key === "Enter") commit(); if (e.key === "Escape") setEditing(false); }}
        onClick={(e) => e.stopPropagation()}
        disabled={saving}
        className="w-24 rounded border border-blue-400 px-2 py-0.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
      />
    );
  }

  return (
    <span
      onClick={startEdit}
      className="group inline-flex items-center gap-1 cursor-pointer rounded px-1 -mx-1 hover:bg-slate-100 transition"
      title="Click to edit"
    >
      <span className={value != null ? "font-medium" : "text-slate-300 italic text-xs"}>
        {value != null ? `${prefix}${Number(value).toLocaleString("en-IN")}` : "—"}
      </span>
      <Pencil size={10} className="text-slate-300 opacity-0 group-hover:opacity-100 transition" />
    </span>
  );
}

// ─── Manual Product Modal (Add + Edit) ───────────────────────────────────────

const EMPTY_FORM = {
  name: "", sku: "", category: "", brand: "", unit: "pcs",
  costPrice: "", sellingPrice: "", mrp: "", stock: "", barcode: "", notes: "",
};

function toForm(p: AnyRecord) {
  return {
    name: p.name || "",
    sku: p.sku || "",
    category: p.category || "",
    brand: p.brand || "",
    unit: p.unit || "pcs",
    costPrice: p.costPrice != null ? String(p.costPrice) : "",
    sellingPrice: p.sellingPrice != null ? String(p.sellingPrice) : "",
    mrp: p.mrp != null ? String(p.mrp) : "",
    stock: p.stock != null ? String(p.stock) : "",
    barcode: p.barcode || "",
    notes: p.notes || "",
  };
}

function ManualProductModal({
  open, onClose, editing,
}: {
  open: boolean; onClose: () => void; editing: AnyRecord | null;
}) {
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);

  useEffect(() => {
    setForm(editing ? toForm(editing) : EMPTY_FORM);
  }, [editing, open]);

  const set = (field: string, value: string) =>
    setForm((prev) => ({ ...prev, [field]: value }));

  const handleSave = async () => {
    if (!form.name.trim()) return alert("Product name is required");
    setSaving(true);
    try {
      await saveInventoryProduct({
        ...(editing ?? {}),
        id: editing?.id ?? uid(),
        name: form.name.trim(),
        sku: form.sku.trim() || uid().slice(0, 8).toUpperCase(),
        category: form.category.trim(),
        brand: form.brand.trim(),
        unit: form.unit,
        costPrice: form.costPrice ? Number(form.costPrice) : undefined,
        sellingPrice: form.sellingPrice ? Number(form.sellingPrice) : undefined,
        mrp: form.mrp ? Number(form.mrp) : undefined,
        stock: form.stock !== "" ? Number(form.stock) : 0,
        barcode: form.barcode.trim() || undefined,
        notes: form.notes.trim() || undefined,
        source: "manual",
      });
      onClose();
    } catch (err) {
      console.error("Save failed:", err);
      alert("Failed to save. Check console for details.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={editing ? `Edit: ${editing.name || "Product"}` : "Add Manual Product"}
      wide
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? "Saving..." : editing ? "Update Product" : "Save Product"}
          </Button>
        </>
      }
    >
      <div className="p-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <div className="mb-1 text-xs font-medium text-slate-600">Product Name *</div>
          <Input value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="e.g. Wella Hair Serum 200ml" />
        </div>
        <div>
          <div className="mb-1 text-xs font-medium text-slate-600">SKU</div>
          <Input value={form.sku} onChange={(e) => set("sku", e.target.value)} placeholder="Auto-generated if blank" />
        </div>
        <div>
          <div className="mb-1 text-xs font-medium text-slate-600">Barcode</div>
          <Input value={form.barcode} onChange={(e) => set("barcode", e.target.value)} placeholder="Optional" />
        </div>
        <div>
          <div className="mb-1 text-xs font-medium text-slate-600">Category</div>
          <Input value={form.category} onChange={(e) => set("category", e.target.value)} placeholder="e.g. Hair Care" />
        </div>
        <div>
          <div className="mb-1 text-xs font-medium text-slate-600">Brand</div>
          <Input value={form.brand} onChange={(e) => set("brand", e.target.value)} placeholder="e.g. Wella" />
        </div>
        <div>
          <div className="mb-1 text-xs font-medium text-slate-600">Unit</div>
          <select value={form.unit} onChange={(e) => set("unit", e.target.value)}
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900">
            {["pcs", "ml", "L", "g", "kg", "box", "bottle", "pair", "set"].map((u) => (
              <option key={u} value={u}>{u}</option>
            ))}
          </select>
        </div>
        <div>
          <div className="mb-1 text-xs font-medium text-slate-600">Stock Qty</div>
          <Input type="number" value={form.stock} onChange={(e) => set("stock", e.target.value)} placeholder="0" />
        </div>
        <div>
          <div className="mb-1 text-xs font-medium text-slate-600">Cost Price (₹)</div>
          <Input type="number" value={form.costPrice} onChange={(e) => set("costPrice", e.target.value)} placeholder="Your purchase cost" />
        </div>
        <div>
          <div className="mb-1 text-xs font-medium text-slate-600">Selling Price / SP (₹)</div>
          <Input type="number" value={form.sellingPrice} onChange={(e) => set("sellingPrice", e.target.value)} placeholder="Price you sell at" />
        </div>
        <div>
          <div className="mb-1 text-xs font-medium text-slate-600">MRP (₹)</div>
          <Input type="number" value={form.mrp} onChange={(e) => set("mrp", e.target.value)} placeholder="Maximum Retail Price" />
        </div>
        <div className="sm:col-span-2">
          <div className="mb-1 text-xs font-medium text-slate-600">Notes</div>
          <Input value={form.notes} onChange={(e) => set("notes", e.target.value)} placeholder="Optional internal notes" />
        </div>
        {!editing && (
          <div className="sm:col-span-2 rounded-lg bg-amber-50 border border-amber-200 px-4 py-2 text-xs text-amber-800">
            ⚠️ This product is <strong>inventory-only</strong> and will <strong>NOT</strong> appear in the PureCuts app.
          </div>
        )}
      </div>
    </Modal>
  );
}

// ─── Variant Rows ───────────────────────────────────────────────────────────

function VariantRows({ productId, variants, showDelete }: { productId: string; variants: AnyRecord[]; showDelete?: boolean }) {
  if (!variants || variants.length === 0) return null;
  return (
    <>
      {variants.map((v) => (
        <tr key={v.id} className="bg-slate-50 border-t border-dashed border-slate-200" onClick={(e) => e.stopPropagation()}>
          <td className="pl-14 pr-6 py-2 text-xs text-slate-500">
            ↳ {v.name || v.shadeName || v.variantName || (v.attribute && v.value ? `${v.attribute}: ${v.value}` : null) || Object.entries(v.attributes || {}).map(([k, val]) => `${k}: ${val}`).join(", ") || v.id}
          </td>
          <td className="px-6 py-2 text-xs text-slate-400 font-mono">{v.sku || "-"}</td>
          <td className="px-6 py-2 text-xs">
            <InlineEditCell productId={productId} variantId={v.id} field="costPrice" value={v.costPrice ?? v.cost ?? null} isAdmin />
          </td>
          <td className="px-6 py-2 text-xs">
            <InlineEditCell productId={productId} variantId={v.id} field="price" value={v.price ?? v.sellingPrice ?? null} isAdmin />
          </td>
          <td className="px-6 py-2 text-xs">
            <InlineEditCell productId={productId} variantId={v.id} field="mrp" value={v.originalPrice ?? v.mrp ?? null} isAdmin />
          </td>
          <td className="px-6 py-2 text-center text-xs">
            {v.stock != null ? (
              <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${v.stock > 0 ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800"}`}>{v.stock}</span>
            ) : "-"}
          </td>
          {showDelete && <td className="px-4 py-2" />}
        </tr>
      ))}
    </>
  );
}

// ─── Main Page ──────────────────────────────────────────────────────────────

export default function AppProductsPage() {
  const [search, setSearch] = useState("");
  const [showModal, setShowModal] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [activeTab, setActiveTab] = useState<"admin" | "manual">("admin");
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [editingProduct, setEditingProduct] = useState<AnyRecord | null>(null);
  const [catFilter, setCatFilter] = useState("all");
  const [stockFilter, setStockFilter] = useState("all");

  const adminProducts = useDataStore((state: any) => state.adminProducts || []) as AnyRecord[];
  const inventoryProducts = useDataStore((state: any) => state.inventoryProducts || []) as AnyRecord[];
  const products = activeTab === "admin" ? adminProducts : inventoryProducts;

  const categories = useMemo(() => {
    const cats = products.map((p) => p.category || p.categoryName || "").filter(Boolean);
    return ["all", ...Array.from(new Set(cats)).sort()];
  }, [products]);

  const filtered = useMemo(() => {
    let list = products;
    if (catFilter !== "all")
      list = list.filter((p) => (p.category || p.categoryName) === catFilter);
    if (stockFilter === "out")
      list = list.filter((p) => (p.stock || 0) === 0);
    else if (stockFilter === "low")
      list = list.filter((p) => (p.stock || 0) > 0 && (p.stock || 0) <= 5);
    const q = search.trim().toLowerCase();
    if (q)
      list = list.filter((p) =>
        (p.name?.toLowerCase() || "").includes(q) ||
        (p.sku?.toLowerCase() || "").includes(q) ||
        (p.category?.toLowerCase() || p.categoryName?.toLowerCase() || "").includes(q)
      );
    return list;
  }, [products, search, catFilter, stockFilter]);

  const handleExport = () => {
    exportCsv(
      filtered.map((p) => ({
        Name: p.name || "",
        SKU: p.sku || "",
        Category: p.category || p.categoryName || "",
        Brand: p.brand || "",
        Cost: p.costPrice ?? "",
        SP: p.price ?? p.sellingPrice ?? "",
        MRP: p.originalPrice ?? p.mrp ?? "",
        Stock: p.stock ?? 0,
      })),
      `products-${activeTab}-${new Date().toISOString().slice(0, 10)}`
    );
  };

  const toggleExpand = (id: string) =>
    setExpanded((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this manual product?")) return;
    setDeletingId(id);
    try { await deleteInventoryProduct(id); } finally { setDeletingId(null); }
  };

  const openModal = (product: AnyRecord | null = null) => {
    setEditingProduct(product);
    setShowModal(true);
  };

  const closeModal = () => {
    setShowModal(false);
    setEditingProduct(null);
  };

  return (
    <>
      <PageHeader>
        <div className="flex items-center justify-between w-full">
          <div>
            <h1 className="text-3xl font-bold">Products</h1>
            <p className="text-gray-500 text-sm mt-1">
              {activeTab === "admin" ? "Click Cost, SP, or Stock to edit inline — saves to Firestore instantly" : "Inventory-only products (not visible in PureCuts app)"}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="secondary" onClick={handleExport} className="flex items-center gap-2">
              <FileDown size={15} /> Export
            </Button>
            {activeTab === "manual" && (
              <Button onClick={() => openModal(null)} className="flex items-center gap-2">
                <Plus size={16} /> Add Manual Product
              </Button>
            )}
          </div>
        </div>
      </PageHeader>

      {/* Tabs */}
      <div className="flex gap-1 mb-4 border-b border-slate-200">
        {(["admin", "manual"] as const).map((tab) => (
          <button key={tab} onClick={() => { setActiveTab(tab); setCatFilter("all"); setStockFilter("all"); }}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition ${
              activeTab === tab ? "border-slate-900 text-slate-900" : "border-transparent text-slate-500 hover:text-slate-700"
            }`}>
            {tab === "admin" ? `App Products (${adminProducts.length})` : `Manual Products (${inventoryProducts.length})`}
          </button>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2 mb-5">
        <select value={catFilter} onChange={(e) => setCatFilter(e.target.value)}
          className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900 bg-white">
          {categories.map((c) => <option key={c} value={c}>{c === "all" ? "All categories" : c}</option>)}
        </select>
        <select value={stockFilter} onChange={(e) => setStockFilter(e.target.value)}
          className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900 bg-white">
          <option value="all">All stock levels</option>
          <option value="low">Low stock (≤ 5)</option>
          <option value="out">Out of stock</option>
        </select>
        {(catFilter !== "all" || stockFilter !== "all" || search) && (
          <button onClick={() => { setCatFilter("all"); setStockFilter("all"); setSearch(""); }}
            className="px-3 py-1.5 text-xs text-slate-500 hover:text-slate-900 underline">
            Clear filters
          </button>
        )}
        <span className="ml-auto text-xs text-slate-400 self-center">{filtered.length} of {products.length} products</span>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-4 mb-6">
        <Card><div className="p-4"><p className="text-sm text-gray-500">Showing</p><p className="text-3xl font-bold">{filtered.length}</p></div></Card>
        <Card><div className="p-4"><p className="text-sm text-gray-500">Total Stock</p><p className="text-3xl font-bold">{filtered.reduce((s, p) => s + (Number(p.stock) || 0), 0)}</p></div></Card>
      </div>

      {/* Table */}
      <Card>
        <div className="p-4 border-b">
          <div className="flex items-center gap-2 px-4 py-2 bg-gray-50 rounded-lg border">
            <Search size={18} className="text-gray-400 shrink-0" />
            <Input placeholder="Search by name, SKU, or category..." value={search}
              onChange={(e) => setSearch(e.target.value)} className="border-none bg-transparent" />
          </div>
        </div>

        {filtered.length === 0 ? (
          <div className="p-10 text-center">
            <Package size={48} className="mx-auto text-gray-300 mb-4" />
            <p className="text-gray-500">No products found</p>
            {activeTab === "manual" && (
              <Button className="mt-4" onClick={() => { setEditingProduct(null); setShowModal(true); }}>
                <Plus size={14} className="mr-1" /> Add First Manual Product
              </Button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-xs text-gray-600 uppercase">
                <tr>
                  <th className="px-6 py-3 text-left">Product</th>
                  <th className="px-6 py-3 text-left">SKU</th>
                  <th className="px-6 py-3 text-left">Category</th>
                  <th className="px-6 py-3 text-left">Cost</th>
                  <th className="px-6 py-3 text-left">SP</th>
                  <th className="px-6 py-3 text-left">MRP</th>
                  <th className="px-6 py-3 text-center">Stock</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.map((product) => {
                  const hasVariants = product.variants && product.variants.length > 0;
                  const isOpen = expanded.has(product.id);
                  return (
                    <>
                      <tr key={product.id} className="hover:bg-gray-50 cursor-pointer"
                        onClick={() => hasVariants && toggleExpand(product.id)}>
                        <td className="px-6 py-3">
                          <div className="flex items-center gap-3">
                            {hasVariants && (
                              <span className="text-slate-400 shrink-0">
                                {isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                              </span>
                            )}
                            {(product.image || product.imageUrl || product.thumbnailUrl) && (
                              <img
                                src={product.image || product.imageUrl || product.thumbnailUrl}
                                alt={product.name}
                                className="h-9 w-9 rounded object-cover shrink-0"
                                onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                              />
                            )}
                            <div className="min-w-0">
                              <p className="font-medium truncate max-w-[220px]">{product.name || "-"}</p>
                              {product.brand && <p className="text-xs text-slate-400">{product.brand}</p>}
                              {hasVariants && (
                                <span className="text-[10px] text-blue-600 font-medium">
                                  {product.variants.length} variant{product.variants.length > 1 ? "s" : ""}
                                </span>
                              )}
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-3 text-slate-500 font-mono text-xs">{product.sku || "-"}</td>
                        <td className="px-6 py-3 text-slate-600">{product.category || product.categoryName || "-"}</td>
                        <td className="px-6 py-3">
                          <InlineEditCell
                            productId={product.id}
                            field="costPrice"
                            value={product.costPrice ?? null}
                            isAdmin={activeTab === "admin"}
                          />
                        </td>
                        <td className="px-6 py-3">
                          <InlineEditCell
                            productId={product.id}
                            field={activeTab === "admin" ? "price" : "sellingPrice"}
                            value={product.price ?? product.sellingPrice ?? null}
                            isAdmin={activeTab === "admin"}
                          />
                        </td>
                        <td className="px-6 py-3 text-slate-500">{fmt(product.originalPrice ?? product.mrp)}</td>
                        <td className="px-6 py-3 text-center">
                          <InlineEditCell
                            productId={product.id}
                            field="stock"
                            value={product.stock ?? 0}
                            prefix=""
                            isAdmin={activeTab === "admin"}
                          />
                        </td>
                        {activeTab === "manual" && (
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-1">
                              <button
                                onClick={(e) => { e.stopPropagation(); setEditingProduct(product); setShowModal(true); }}
                                className="p-1 text-slate-400 hover:text-blue-600 transition" title="Edit">
                                <Pencil size={13} />
                              </button>
                              <button
                                onClick={(e) => { e.stopPropagation(); handleDelete(product.id); }}
                                disabled={deletingId === product.id}
                                className="p-1 text-slate-400 hover:text-red-500 transition" title="Delete">
                                <Trash2 size={13} />
                              </button>
                            </div>
                          </td>
                        )}
                        {activeTab === "admin" && (
                          <td className="px-4 py-3" />
                        )}
                      </tr>
                      {hasVariants && isOpen && <VariantRows productId={product.id} variants={product.variants} showDelete={activeTab === "manual"} />}
                    </>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {activeTab === "admin" && (
        <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-lg text-xs text-blue-800">
          📌 <strong>Cost, SP, and Stock are editable</strong> — click any value to update it. Changes save directly to Firestore.
        </div>
      )}

      <ManualProductModal
        open={showModal}
        onClose={() => { setShowModal(false); setEditingProduct(null); }}
        editing={editingProduct}
      />
    </>
  );
}
