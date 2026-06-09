import { useMemo, useState, useRef, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { Package, Search, Plus, ChevronDown, ChevronRight, Trash2, Pencil, FileDown, X, Eye } from "lucide-react";
import toast from "react-hot-toast";
import { useDataStore } from "@/store/dataStore";
import { saveInventoryProduct, deleteInventoryProduct, updateProductField, updateInventoryProductField, updateVariantField } from "@/services/data";
import { Button, Card, PageHeader, Input } from "@/components/ui/primitives";
import { Modal } from "@/components/ui/Modal";
import { uid, exportCsv } from "@/lib/utils";
import { 
  getProductOverride, 
  saveProductOverride, 
  getMergedProducts,
  mergeProductWithOverrides,
  type ProductOverride 
} from "@/services/productOverrides";

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
  suffix = "",
  isAdmin,
}: {
  productId: string;
  variantId?: string;
  field: string;
  value: number | undefined | null;
  prefix?: string;
  suffix?: string;
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
        {value != null ? `${prefix}${Number(value).toLocaleString("en-IN")}${suffix}` : "—"}
      </span>
      <Pencil size={10} className="text-slate-300 opacity-0 group-hover:opacity-100 transition" />
    </span>
  );
}

// ─── Edit App Product Modal ──────────────────────────────────────────────────

interface EditAppProductForm {
  costPrice: string;
  sellingPrice: string;
  stock: string;
  reorderLevel: string;
}

function EditAppProductModal({
  open,
  onClose,
  product,
}: {
  open: boolean;
  onClose: () => void;
  product: AnyRecord | null;
}) {
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<EditAppProductForm>({
    costPrice: "",
    sellingPrice: "",
    stock: "",
    reorderLevel: "",
  });

  useEffect(() => {
    if (product && open) {
      const override = getProductOverride(product.id);
      // Merge override with original product to show current values
      const merged = mergeProductWithOverrides(product, override);
      setForm({
        costPrice: merged.costPrice != null ? String(merged.costPrice) : "",
        sellingPrice: merged.sellingPrice ?? merged.price != null ? String(merged.sellingPrice ?? merged.price) : "",
        stock: merged.stock != null ? String(merged.stock) : "",
        reorderLevel: merged.reorderLevel != null ? String(merged.reorderLevel) : "",
      });
    }
  }, [product, open]);

  const handleSave = async () => {
    if (!product) return;
    setSaving(true);
    try {
      // Save overrides to localStorage
      const override: ProductOverride = {
        costPrice: form.costPrice ? Number(form.costPrice) : undefined,
        sellingPrice: form.sellingPrice ? Number(form.sellingPrice) : undefined,
        stock: form.stock !== "" ? Number(form.stock) : undefined,
        reorderLevel: form.reorderLevel !== "" ? Number(form.reorderLevel) : undefined,
      };
      saveProductOverride(product.id, override);
      toast.success("Product updated (frontend storage)");
      onClose();
    } catch (err) {
      console.error("Save failed:", err);
      toast.error("Failed to save");
    } finally {
      setSaving(false);
    }
  };

  if (!product) return null;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Edit: ${product.name}`}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? "Saving..." : "Save Changes"}
          </Button>
        </>
      }
    >
      <div className="p-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <div className="mb-1 text-xs font-medium text-slate-600">Cost Price (₹)</div>
          <Input
            type="number"
            step="0.01"
            value={form.costPrice}
            onChange={(e) => setForm({ ...form, costPrice: e.target.value })}
            placeholder="Your purchase cost"
          />
        </div>
        <div>
          <div className="mb-1 text-xs font-medium text-slate-600">Selling Price / SP (₹)</div>
          <Input
            type="number"
            step="0.01"
            value={form.sellingPrice}
            onChange={(e) => setForm({ ...form, sellingPrice: e.target.value })}
            placeholder="Price you sell at"
          />
        </div>
        <div>
          <div className="mb-1 text-xs font-medium text-slate-600">Stock Qty</div>
          <Input
            type="number"
            value={form.stock}
            onChange={(e) => setForm({ ...form, stock: e.target.value })}
            placeholder="Current stock quantity"
          />
        </div>
        <div>
          <div className="mb-1 text-xs font-medium text-slate-600">Reorder Level</div>
          <Input
            type="number"
            value={form.reorderLevel}
            onChange={(e) => setForm({ ...form, reorderLevel: e.target.value })}
            placeholder="Trigger level for low stock"
          />
        </div>
        <div className="sm:col-span-2 rounded-lg bg-blue-50 border border-blue-200 px-4 py-2 text-xs text-blue-800">
          ℹ️ Changes are saved <strong>locally in your browser</strong> and will persist after refresh. Backend data is not modified.
        </div>
      </div>
    </Modal>
  );
}

// ─── Manual Product Modal (Add + Edit) ───────────────────────────────────────

const EMPTY_FORM = {
  name: "", sku: "", category: "", brand: "", unit: "pcs",
  costPrice: "", sellingPrice: "", mrp: "", stock: "", reorderLevel: "", barcode: "", notes: "",
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
    reorderLevel: p.reorderLevel != null ? String(p.reorderLevel) : "",
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
        reorderLevel: form.reorderLevel !== "" ? Number(form.reorderLevel) : 0,
        barcode: form.barcode.trim() || undefined,
        notes: form.notes.trim() || undefined,
        source: "manual",
      });
      toast.success(editing ? "Product updated" : "Product saved");
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
          <div className="mb-1 text-xs font-medium text-slate-600">Reorder Level</div>
          <Input type="number" value={form.reorderLevel} onChange={(e) => set("reorderLevel", e.target.value)} placeholder="Trigger level for low stock alert" />
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
        <tr key={v.id} className="bg-slate-50 border-t border-dashed border-slate-200">
          <td className="pl-14 pr-6 py-2 text-xs text-slate-500">
            ↳ {v.name || v.shadeName || v.variantName || (v.attribute && v.value ? `${v.attribute}: ${v.value}` : null) || Object.entries(v.attributes || {}).map(([k, val]) => `${k}: ${val}`).join(", ") || v.id}
          </td>
          <td className="px-6 py-2 text-xs text-slate-400">-</td>
          <td className="px-6 py-2 text-xs text-slate-400">
            <InlineEditCell productId={productId} variantId={v.id} field="costPrice" value={v.costPrice ?? v.cost ?? null} isAdmin />
          </td>
          <td className="px-6 py-2 text-xs font-medium">
            <InlineEditCell productId={productId} variantId={v.id} field="price" value={v.price ?? v.sellingPrice ?? null} isAdmin />
          </td>
          <td className="px-6 py-2 text-xs text-slate-400">
            <InlineEditCell productId={productId} variantId={v.id} field="gstRate" value={v.gstRate ?? 0} prefix="" suffix="%" isAdmin />
          </td>
          <td className="px-6 py-2 text-xs text-slate-400">-</td>
          <td className="px-6 py-2 text-xs text-slate-500">
            <InlineEditCell productId={productId} variantId={v.id} field="mrp" value={v.originalPrice ?? v.mrp ?? null} isAdmin />
          </td>
          <td className="px-6 py-2 text-center text-xs">
            <InlineEditCell productId={productId} variantId={v.id} field="stock" value={v.stock ?? null} prefix="" isAdmin />
          </td>
          <td className="px-4 py-2" />
        </tr>
      ))}
    </>
  );
}

// ─── Main Page ──────────────────────────────────────────────────────────────

export default function AppProductsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [search, setSearch] = useState("");
  const [showModal, setShowModal] = useState(false);
  const [showEditAppProductModal, setShowEditAppProductModal] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [activeTab, setActiveTab] = useState<"admin" | "manual">("admin");
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [editingProduct, setEditingProduct] = useState<AnyRecord | null>(null);
  const [editingAppProduct, setEditingAppProduct] = useState<AnyRecord | null>(null);
  const [catFilter, setCatFilter] = useState("all");
  const [stockFilter, setStockFilter] = useState("all");
  const [selectedDetailProduct, setSelectedDetailProduct] = useState<AnyRecord | null>(null);

  // Synchronize stockFilter state with URL search param
  useEffect(() => {
    const s = searchParams.get("stock");
    if (s === "low" || s === "out") {
      setStockFilter(s);
      setActiveTab("admin"); // Sync tab to admin when clicking topbar badges
    } else {
      setStockFilter("all");
    }
  }, [searchParams]);

  const setStock = (v: string) => {
    setStockFilter(v);
    const newParams = new URLSearchParams(searchParams);
    if (v === "all") {
      newParams.delete("stock");
    } else {
      newParams.set("stock", v);
    }
    setSearchParams(newParams, { replace: true });
  };

  const adminProducts = useDataStore((state: any) => state.adminProducts || []) as AnyRecord[];
  const inventoryProducts = useDataStore((state: any) => state.inventoryProducts || []) as AnyRecord[];
  const adminOrders = useDataStore((state: any) => state.adminOrders || []) as AnyRecord[];
  const salesOrders = useDataStore((state: any) => state.salesOrders || []) as AnyRecord[];
  
  // Merge admin products with localStorage overrides
  const mergedAdminProducts = useMemo(() => getMergedProducts(adminProducts), [adminProducts]);
  
  const products = activeTab === "admin" ? mergedAdminProducts : inventoryProducts;

  const frequencies = useMemo(() => {
    if (!selectedDetailProduct) return { week: 0, month: 0, year: 0, hasAnySales: false };
    const pId = selectedDetailProduct.id;
    const now = Date.now();
    const weekAgo = now - 7 * 86400000;
    const monthAgo = now - 30 * 86400000;
    const yearAgo = now - 365 * 86400000;

    let weekQty = 0;
    let monthQty = 0;
    let yearQty = 0;
    let hasAnySales = false;

    const filterAndSum = (o: any) => {
      if (o.status === "Cancelled") return;
      
      let orderDateMs = now;
      if (o.createdAt) {
        if (typeof o.createdAt.toDate === "function") {
          orderDateMs = o.createdAt.toDate().getTime();
        } else if (typeof o.createdAt === "number") {
          orderDateMs = o.createdAt;
        } else {
          orderDateMs = new Date(o.createdAt).getTime();
        }
      }

      const rawLines = Array.isArray(o.lines) ? o.lines : Array.isArray(o.items) ? o.items : [];
      rawLines.forEach((l: any) => {
        const lProductId = l.productId || l.id || "";
        if (lProductId === pId || lProductId.startsWith(`${pId}__`)) {
          const qty = Number(l.qty ?? l.quantity ?? 1) || 1;
          hasAnySales = true;
          if (orderDateMs >= weekAgo) weekQty += qty;
          if (orderDateMs >= monthAgo) monthQty += qty;
          if (orderDateMs >= yearAgo) yearQty += qty;
        }
      });
    };

    (salesOrders || []).forEach(filterAndSum);
    (adminOrders || []).forEach(filterAndSum);

    return {
      week: hasAnySales ? weekQty : "No sales yet",
      month: hasAnySales ? monthQty : "No sales yet",
      year: hasAnySales ? yearQty : "No sales yet",
      hasAnySales
    };
  }, [selectedDetailProduct, salesOrders, adminOrders]);

  const categories = useMemo(() => {
    const cats = products.map((p) => p.category || p.categoryName || "").filter(Boolean);
    return ["all", ...Array.from(new Set(cats)).sort()];
  }, [products]);

  const filtered = useMemo(() => {
    let list = products;
    if (catFilter !== "all")
      list = list.filter((p) => (p.category || p.categoryName) === catFilter);
    if (stockFilter === "out")
      // Out of stock = stock is exactly 0
      list = list.filter((p) => p.status !== "archived" && (p.stock ?? 0) === 0);
    else if (stockFilter === "low")
      // Low stock = stock > 0 && stock <= trigger
      list = list.filter((p) => {
        const stock = p.stock ?? 0;
        const trigger = p.reorderTriggerValue || p.reorderLevel || 5;
        return p.status !== "archived" && stock > 0 && stock <= trigger;
      });
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

  const closeEditAppProductModal = () => {
    setShowEditAppProductModal(false);
    setEditingAppProduct(null);
  };

  return (
    <>
      <PageHeader
        title="Products"
        subtitle={activeTab === "admin" ? "Click Cost, SP, or Stock to edit inline — saves to browser locally. Click Edit icon for more fields" : "Inventory-only products (not visible in PureCuts app)"}
        actions={
          <>
            <Button variant="secondary" onClick={handleExport} className="flex items-center gap-2">
              <FileDown size={15} /> Export
            </Button>
            {activeTab === "manual" && (
              <Button onClick={() => openModal(null)} className="flex items-center gap-2">
                <Plus size={16} /> Add Manual Product
              </Button>
            )}
          </>
        }
      />

      {/* Tabs */}
      <div className="flex gap-1 mb-4 border-b border-slate-200">
        {(["admin", "manual"] as const).map((tab) => (
          <button key={tab} onClick={() => { setActiveTab(tab); setCatFilter("all"); setStock("all"); }}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition ${
              activeTab === tab ? "border-slate-900 text-slate-900" : "border-transparent text-slate-500 hover:text-slate-700"
            }`}>
            {tab === "admin" ? `App Products (${adminProducts.length})` : `Manual Products (${inventoryProducts.length})`}
          </button>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2 mb-5 items-center">
        <select value={catFilter} onChange={(e) => setCatFilter(e.target.value)}
          className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900 bg-white">
          {categories.map((c) => <option key={c} value={c}>{c === "all" ? "All categories" : c}</option>)}
        </select>
        <select value={stockFilter} onChange={(e) => setStock(e.target.value)}
          className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900 bg-white">
          <option value="all">All stock levels</option>
          <option value="low">Low stock</option>
          <option value="out">Out of stock</option>
        </select>
        {(catFilter !== "all" || stockFilter !== "all" || search) && (
          <button onClick={() => { setCatFilter("all"); setStock("all"); setSearch(""); }}
            className="px-3 py-1.5 text-xs text-slate-500 hover:text-slate-900 underline">
            Clear filters
          </button>
        )}
        {activeTab === "manual" && (
          <Button onClick={() => openModal(null)} className="ml-auto flex items-center gap-2">
            <Plus size={14} /> Add Product
          </Button>
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
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-xs text-gray-600 uppercase">
                <tr>
                  <th className="px-6 py-3 text-left">Product</th>
                  <th className="px-6 py-3 text-left">Category</th>
                  <th className="px-6 py-3 text-left">Cost</th>
                  <th className="px-6 py-3 text-left">SP</th>
                  <th className="px-6 py-3 text-left">GST</th>
                  <th className="px-6 py-3 text-left">Margin</th>
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
                        <td className="px-6 py-3">
                          <InlineEditCell
                            productId={product.id}
                            field="gstRate"
                            value={product.gstRate ?? 0}
                            prefix=""
                            suffix="%"
                            isAdmin={activeTab === "admin"}
                          />
                        </td>
                        <td className="px-6 py-3 text-sm">
                          {/* Margin calculation */}
                          {(() => {
                            const cost = product.costPrice;
                            const sp = product.price ?? product.sellingPrice;
                            if (cost == null || sp == null || sp === 0) return <span className="text-slate-300">-</span>;
                            const marginAmount = sp - cost;
                            const marginPercent = ((sp - cost) / sp) * 100;
                            const isNegative = marginAmount < 0;
                            return (
                              <span className={isNegative ? "text-red-500 font-semibold" : "font-medium"}>
                                ₹{marginAmount.toLocaleString("en-IN")} / {marginPercent.toFixed(1)}%
                              </span>
                            );
                          })()}
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
                                onClick={(e) => { e.stopPropagation(); setSelectedDetailProduct(product); }}
                                className="p-1 text-slate-400 hover:text-blue-600 transition" title="Detail">
                                <Eye size={13} />
                              </button>
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
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-1">
                              <button
                                onClick={(e) => { e.stopPropagation(); setSelectedDetailProduct(product); }}
                                className="p-1 text-slate-400 hover:text-blue-600 transition" title="Detail">
                                <Eye size={13} />
                              </button>
                              <button
                                onClick={(e) => { e.stopPropagation(); setEditingAppProduct(product); setShowEditAppProductModal(true); }}
                                className="p-1 text-slate-400 hover:text-blue-600 transition" title="Edit">
                                <Pencil size={13} />
                              </button>
                            </div>
                          </td>
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
          📌 <strong>Inline editing:</strong> Click Cost, SP, or Stock values to edit. Click the pencil icon for more fields. Changes save locally to your browser.
        </div>
      )}

      <ManualProductModal
        open={showModal}
        onClose={() => { setShowModal(false); setEditingProduct(null); }}
        editing={editingProduct}
      />

      <EditAppProductModal
        open={showEditAppProductModal}
        onClose={closeEditAppProductModal}
        product={editingAppProduct}
      />

      <ProductDetailModal
        open={!!selectedDetailProduct}
        onClose={() => setSelectedDetailProduct(null)}
        product={selectedDetailProduct}
        frequencies={frequencies}
      />
    </>
  );
}

// ─── Product Detail Modal ───────────────────────────────────────────────────

function ProductDetailModal({
  product,
  open,
  onClose,
  frequencies,
}: {
  product: AnyRecord | null;
  open: boolean;
  onClose: () => void;
  frequencies: { week: number | string; month: number | string; year: number | string; hasAnySales: boolean };
}) {
  if (!product) return null;

  // Calculate margin in frontend
  const cost = product.costPrice;
  const sp = product.price ?? product.sellingPrice;
  let marginText = "-";
  let isNegative = false;
  if (cost != null && sp != null && sp !== 0) {
    const marginAmount = sp - cost;
    const marginPercent = ((sp - cost) / sp) * 100;
    isNegative = marginAmount < 0;
    marginText = `₹${marginAmount.toLocaleString("en-IN")} / ${marginPercent.toFixed(1)}%`;
  }

  const mrp = product.originalPrice ?? product.mrp;
  const stock = product.stock ?? 0;
  const gst = `${product.gstRate ?? 0}%`;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Product Details: ${product.name}`}
      footer={
        <Button variant="ghost" onClick={onClose}>
          Close
        </Button>
      }
    >
      <div className="p-4 space-y-6 text-sm text-slate-600 dark:text-slate-300">
        {/* Basic Product Info */}
        <div className="grid grid-cols-2 gap-4 border-b pb-4 dark:border-slate-800">
          <div>
            <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider">SKU</div>
            <div className="mt-1 font-mono text-slate-800 dark:text-slate-200">{product.sku || "-"}</div>
          </div>
          <div>
            <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Category</div>
            <div className="mt-1 text-slate-800 dark:text-slate-200">{product.category || product.categoryName || "-"}</div>
          </div>
        </div>

        {/* Pricing & Stock Details */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 border-b pb-4 dark:border-slate-800">
          <div>
            <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Cost Price</div>
            <div className="mt-1 font-semibold text-slate-800 dark:text-slate-200">
              {cost != null ? `₹${cost.toLocaleString("en-IN")}` : "-"}
            </div>
          </div>
          <div>
            <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Selling Price (SP)</div>
            <div className="mt-1 font-semibold text-slate-800 dark:text-slate-200">
              {sp != null ? `₹${sp.toLocaleString("en-IN")}` : "-"}
            </div>
          </div>
          <div>
            <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider">MRP</div>
            <div className="mt-1 font-semibold text-slate-800 dark:text-slate-200">
              {mrp != null ? `₹${mrp.toLocaleString("en-IN")}` : "-"}
            </div>
          </div>
          <div>
            <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Current Stock</div>
            <div className="mt-1 font-semibold text-slate-800 dark:text-slate-200">
              {stock != null ? stock.toLocaleString("en-IN") : "-"}
            </div>
          </div>
        </div>

        {/* Margin & GST */}
        <div className="grid grid-cols-2 gap-4 border-b pb-4 dark:border-slate-800">
          <div>
            <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Margin</div>
            <div className={`mt-1 font-semibold ${isNegative ? "text-red-500" : "text-emerald-600"}`}>
              {marginText}
            </div>
          </div>
          <div>
            <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider">GST</div>
            <div className="mt-1 font-semibold text-slate-800 dark:text-slate-200">{gst}</div>
          </div>
        </div>

        {/* Sell Frequency (Calculated metrics) */}
        <div>
          <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">Product Sales Frequency</div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="bg-slate-50 dark:bg-slate-800/50 rounded-xl p-3 border dark:border-slate-800">
              <div className="text-xs text-slate-400">Past Week (7d)</div>
              <div className="mt-1 text-lg font-bold text-slate-800 dark:text-slate-200">
                {frequencies.week}
              </div>
            </div>
            <div className="bg-slate-50 dark:bg-slate-800/50 rounded-xl p-3 border dark:border-slate-800">
              <div className="text-xs text-slate-400">Past Month (30d)</div>
              <div className="mt-1 text-lg font-bold text-slate-800 dark:text-slate-200">
                {frequencies.month}
              </div>
            </div>
            <div className="bg-slate-50 dark:bg-slate-800/50 rounded-xl p-3 border dark:border-slate-800">
              <div className="text-xs text-slate-400">Past Year (365d)</div>
              <div className="mt-1 text-lg font-bold text-slate-800 dark:text-slate-200">
                {frequencies.year}
              </div>
            </div>
          </div>
        </div>
      </div>
    </Modal>
  );
}
