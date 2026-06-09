import { useMemo, useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import toast from "react-hot-toast";
import { type ColumnDef } from "@tanstack/react-table";
import {
  Plus, FileDown, LayoutGrid, List, Pencil, Copy, Archive, Trash2, Package, MoreVertical,
} from "lucide-react";
import { Button, Card, Field, Input, Select, PageHeader } from "@/components/ui/primitives";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { DataTable } from "@/components/ui/DataTable";
import { Modal } from "@/components/ui/Modal";
import { useDataStore } from "@/store/dataStore";
import { saveDoc, removeDoc, logActivity } from "@/services/data";
import { inr, num, uid, exportCsv, cn } from "@/lib/utils";
import { available, margin, profitPerUnit, isLow, isOut } from "@/lib/calc";
import type { Product } from "@/types";

const schema = z.object({
  name: z.string().min(2, "Required"),
  sku: z.string().min(1, "Required"),
  brand: z.string().min(1, "Required"),
  category: z.string().min(1, "Required"),
  unit: z.string().min(1, "Required"),
  stock: z.coerce.number().min(0),
  reorderLevel: z.coerce.number().min(0),
  costPrice: z.coerce.number().min(0),
  sellingPrice: z.coerce.number().min(0),
  gstRate: z.coerce.number().min(0).max(28),
  vendorName: z.string().optional(),
  barcode: z.string().optional(),
  isInventoryOnly: z.boolean().optional(),
});
type FormValues = z.input<typeof schema>;

function ProductForm({ open, onClose, editing }: { open: boolean; onClose: () => void; editing: Product | null }) {
  const vendors = useDataStore((s) => s.vendors);
  const {
    register, handleSubmit, reset, formState: { errors }, watch,
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    values: editing
      ? { ...editing }
      : { name: "", sku: "", brand: "", category: "", unit: "pcs", stock: 0, reorderLevel: 10, costPrice: 0, sellingPrice: 0, gstRate: 18, vendorName: "", barcode: "", isInventoryOnly: false },
  });

  const onSubmit = async (v: FormValues) => {
    const p: Product = {
      id: editing?.id ?? uid(),
      reserved: editing?.reserved ?? 0,
      status: editing?.status ?? "active",
      createdAt: editing?.createdAt ?? Date.now(),
      updatedAt: Date.now(),
      ...v,
      stock: Number(v.stock),
      reorderLevel: Number(v.reorderLevel),
      costPrice: Number(v.costPrice),
      sellingPrice: Number(v.sellingPrice),
      gstRate: Number(v.gstRate),
      isInventoryOnly: Boolean(v.isInventoryOnly),
    };
    
    // If editing existing product, update in products collection
    if (editing) {
      await saveDoc("products", p);
      logActivity("Edited product", "product", p.name, p.sku);
      toast.success("Product updated");
    } else {
      // For new products, save as pending for admin approval
      const pendingProduct = {
        ...p,
        isPendingInventoryProduct: true,
        inventoryUser: (useDataStore.getState() as any).currentUser?.email || "system",
        pendingStatus: "pending",
      };
      await saveDoc("pendingProducts", pendingProduct);
      logActivity("Added pending product", "product", p.name, p.sku);
      toast.success("Product added to pending. Admin approval required to appear in app.");
    }
    
    reset();
    onClose();
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={editing ? "Edit Product" : "Add Product"}
      wide
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSubmit(onSubmit)}>{editing ? "Save changes" : "Add product"}</Button>
        </>
      }
    >
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Product name" error={errors.name?.message}><Input {...register("name")} /></Field>
        <Field label="SKU" error={errors.sku?.message}><Input {...register("sku")} /></Field>
        <Field label="Brand" error={errors.brand?.message}><Input {...register("brand")} /></Field>
        <Field label="Category" error={errors.category?.message}><Input {...register("category")} /></Field>
        <Field label="Unit"><Input {...register("unit")} placeholder="bottle, tube, pcs…" /></Field>
        <Field label="Barcode"><Input {...register("barcode")} /></Field>
        <Field label="Opening stock"><Input type="number" {...register("stock")} /></Field>
        <Field label="Reorder level"><Input type="number" {...register("reorderLevel")} /></Field>
        <Field label="Cost price (₹)"><Input type="number" step="0.01" {...register("costPrice")} /></Field>
        <Field label="Selling price (₹)"><Input type="number" step="0.01" {...register("sellingPrice")} /></Field>
        <Field label="GST %"><Input type="number" {...register("gstRate")} /></Field>
        <Field label="Vendor">
          <Select {...register("vendorName")}>
            <option value="">— none —</option>
            {vendors.map((v) => <option key={v.id} value={v.name}>{v.name}</option>)}
          </Select>
        </Field>
        <div className="flex items-center gap-2 sm:col-span-2">
          <input type="checkbox" {...register("isInventoryOnly")} className="h-4 w-4 rounded border-slate-300" />
          <label className="text-sm font-medium text-slate-700 dark:text-slate-300">Inventory only (hide from app)</label>
        </div>
      </div>
    </Modal>
  );
}

export default function Products() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const products = useDataStore((s) => s.products);
  const [view, setView] = useState<"table" | "grid">("table");
  const [cat, setCat] = useState("all");
  const [status, setStatus] = useState("all");
  const [stockFilter, setStockFilter] = useState<"all" | "low" | "out">("all");
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Product | null>(null);
  const [menu, setMenu] = useState<string | null>(null);
  
  // Track editing state with a Map for each cell
  const [editingCell, setEditingCell] = useState<string | null>(null);
  const [cellValues, setCellValues] = useState<Map<string, string>>(new Map());

  // Allow other pages to deep-link here, e.g. /products?stock=low or ?stock=out
  useEffect(() => {
    const s = searchParams.get("stock");
    if (s === "low" || s === "out") setStockFilter(s);
    else if (s === "all" || s === null) setStockFilter("all");
  }, [searchParams]);

  const setStock = (v: "all" | "low" | "out") => {
    setStockFilter(v);
    if (v === "all") searchParams.delete("stock");
    else searchParams.set("stock", v);
    setSearchParams(searchParams, { replace: true });
  };

  const categories = useMemo(() => ["all", ...new Set(products.map((p) => p.category))], [products]);
  const rows = products.filter(
    (p) =>
      (cat === "all" || p.category === cat) &&
      (status === "all" || p.status === status) &&
      (stockFilter === "all" || (stockFilter === "out" ? isOut(p) : isLow(p) && !isOut(p)))
  );

  const openAdd = () => { setEditing(null); setFormOpen(true); };
  const openEdit = (p: Product) => { setEditing(p); setFormOpen(true); setMenu(null); };
  const duplicate = async (p: Product) => {
    await saveDoc("products", { ...p, id: uid(), name: `${p.name} (copy)`, sku: `${p.sku}-C`, createdAt: Date.now(), updatedAt: Date.now() });
    toast.success("Duplicated"); setMenu(null);
  };
  const archive = async (p: Product) => {
    await saveDoc("products", { ...p, status: p.status === "active" ? "archived" : "active", updatedAt: Date.now() });
    toast.success(p.status === "active" ? "Archived" : "Restored"); setMenu(null);
  };
  const del = async (p: Product) => {
    if (!confirm(`Delete "${p.name}"? This cannot be undone.`)) return;
    await removeDoc("products", p.id);
    logActivity("Deleted product", "product", p.name, p.sku);
    toast.success("Deleted"); setMenu(null);
  };

  const statusBadge = (p: Product) =>
    isOut(p) ? <StatusBadge value="Out" /> : isLow(p) ? <StatusBadge value="Low" /> : p.status === "archived" ? <StatusBadge value="Archived" /> : <StatusBadge value="In stock" />;

  const updateField = async (p: Product, field: "stock" | "costPrice" | "originalPrice" | "sellingPrice", newValue: number) => {
    const current = p[field];
    if (newValue === current) {
      return;
    }
    try {
      const updated = { ...p, [field]: newValue, updatedAt: Date.now() };
      await saveDoc("products", updated);
      
      // Update the local store to reflect changes immediately
      const allProducts = useDataStore.getState().products;
      const updated_products = allProducts.map(prod => prod.id === p.id ? updated : prod);
      useDataStore.getState().setCollection("products", updated_products);
      
      const fieldName = {
        stock: "Stock",
        costPrice: "Cost",
        originalPrice: "MRP",
        sellingPrice: "Sell price",
      }[field];
      toast.success(`${fieldName} updated`);
    } catch (err) {
      console.error("Error saving field:", field, err);
      toast.error(`Failed to save ${field}`);
    }
  };

  const EditableCell = ({ value, field, product }: { value: number; field: "stock" | "costPrice" | "originalPrice" | "sellingPrice"; product: Product }) => {
    const cellKey = `${product.id}-${field}`;
    const isEditing = editingCell === cellKey;
    const tempValue = isEditing ? (cellValues.get(cellKey) || value.toString()) : value.toString();

    const handleBlur = async () => {
      const savedValue = cellValues.get(cellKey) || value.toString();
      const numValue = parseFloat(savedValue);
      if (!isNaN(numValue)) {
        await updateField(product, field, numValue);
      }
      setEditingCell(null);
    };

    if (isEditing) {
      return (
        <input
          autoFocus
          type="number"
          step="0.01"
          value={tempValue}
          onChange={(e) => {
            const newMap = new Map(cellValues);
            newMap.set(cellKey, e.target.value);
            setCellValues(newMap);
          }}
          onBlur={handleBlur}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              handleBlur();
            } else if (e.key === "Escape") {
              setEditingCell(null);
            }
          }}
          className="w-24 rounded border-2 border-blue-500 bg-blue-50 px-2 py-1 text-sm tabular-nums dark:bg-slate-700 dark:text-white"
        />
      );
    }

    return (
      <button
        onClick={() => {
          const newMap = new Map(cellValues);
          newMap.set(cellKey, value.toString());
          setCellValues(newMap);
          setEditingCell(cellKey);
        }}
        className="w-24 rounded border border-slate-300 bg-white px-2 py-1 text-sm tabular-nums text-left hover:border-slate-400 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-800 dark:hover:bg-slate-700"
        title="Click to edit"
      >
        {value > 0 ? value.toLocaleString("en-IN") : "—"}
      </button>
    );
  };

  const columns: ColumnDef<Product, unknown>[] = [
    {
      header: "Product", accessorKey: "name",
      cell: ({ row }) => (
        <button onClick={() => navigate(`/products/${row.original.id}`)} className="text-left">
          <div className="font-medium text-slate-900 dark:text-white hover:underline">{row.original.name}</div>
          <div className="text-xs text-slate-400">SKU {row.original.sku} · {row.original.brand}</div>
        </button>
      ),
    },
    { header: "Category", accessorKey: "category", cell: ({ getValue }) => <span className="text-slate-500">{getValue() as string}</span> },
    {
      header: "Stock",
      accessorKey: "stock",
      cell: ({ row }) => <EditableCell value={row.original.stock} field="stock" product={row.original} />,
    },
    {
      header: "Cost",
      accessorKey: "costPrice",
      cell: ({ row }) => <EditableCell value={row.original.costPrice} field="costPrice" product={row.original} />,
    },
    {
      header: "MRP",
      accessorKey: "originalPrice",
      cell: ({ row }) => <EditableCell value={row.original.originalPrice || 0} field="originalPrice" product={row.original} />,
    },
    {
      header: "Sell",
      accessorKey: "sellingPrice",
      cell: ({ row }) => <EditableCell value={row.original.sellingPrice} field="sellingPrice" product={row.original} />,
    },
    {
      header: "Margin", accessorFn: (p) => margin(p),
      cell: ({ row }) => {
        const mg = margin(row.original);
        return (
          <div>
            <span className={cn("font-semibold tabular-nums", mg >= 45 ? "text-emerald-600" : mg >= 25 ? "text-amber-600" : "text-rose-600")}>{mg.toFixed(1)}%</span>
            <div className="text-[11px] text-slate-400 tabular-nums">{inr(profitPerUnit(row.original))}/unit</div>
          </div>
        );
      },
    },
    { header: "Status", id: "status", cell: ({ row }) => statusBadge(row.original) },
    {
      header: "", id: "actions",
      cell: ({ row }) => (
        <div className="relative flex justify-end">
          <button onClick={() => setMenu(menu === row.original.id ? null : row.original.id)} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800">
            <MoreVertical className="h-4 w-4" />
          </button>
          {menu === row.original.id && (
            <div className="absolute right-0 top-8 z-20 w-40 rounded-lg border border-slate-200 bg-white py-1 shadow-lg dark:border-slate-700 dark:bg-slate-800">
              <MenuItem icon={Pencil} label="Edit full" onClick={() => openEdit(row.original)} />
              <MenuItem icon={Copy} label="Duplicate" onClick={() => duplicate(row.original)} />
              <MenuItem icon={Archive} label={row.original.status === "active" ? "Archive" : "Restore"} onClick={() => archive(row.original)} />
              <MenuItem icon={Trash2} label="Delete" danger onClick={() => del(row.original)} />
            </div>
          )}
        </div>
      ),
    },
  ];

  return (
    <div>
      <PageHeader
        title="Products"
        subtitle={`${rows.length} products`}
        actions={
          <>
            <div className="flex overflow-hidden rounded-lg border border-slate-200 dark:border-slate-700">
              <button onClick={() => setView("table")} className={cn("p-2", view === "table" ? "bg-slate-900 text-white dark:bg-white dark:text-slate-900" : "text-slate-500")}><List className="h-4 w-4" /></button>
              <button onClick={() => setView("grid")} className={cn("p-2", view === "grid" ? "bg-slate-900 text-white dark:bg-white dark:text-slate-900" : "text-slate-500")}><LayoutGrid className="h-4 w-4" /></button>
            </div>
            <Button variant="secondary" onClick={() => exportCsv(rows.map((p) => ({ name: p.name, sku: p.sku, brand: p.brand, category: p.category, available: available(p), cost: p.costPrice, sell: p.sellingPrice, margin: margin(p).toFixed(1) + "%" })), "products")}>
              <FileDown className="h-4 w-4" /> Export
            </Button>
            <Button onClick={openAdd}><Plus className="h-4 w-4" /> Add Product</Button>
          </>
        }
      />

      <div className="mb-4 flex flex-wrap gap-2">
        <Select value={cat} onChange={(e) => setCat(e.target.value)} className="w-auto">
          {categories.map((c) => <option key={c} value={c}>{c === "all" ? "All categories" : c}</option>)}
        </Select>
        <Select value={status} onChange={(e) => setStatus(e.target.value)} className="w-auto">
          <option value="all">All statuses</option>
          <option value="active">Active</option>
          <option value="archived">Archived</option>
        </Select>
        <Select value={stockFilter} onChange={(e) => setStock(e.target.value as "all" | "low" | "out")} className="w-auto">
          <option value="all">All stock levels</option>
          <option value="low">Low stock only</option>
          <option value="out">Out of stock only</option>
        </Select>
      </div>

      {view === "table" ? (
        <DataTable data={rows} columns={columns} searchPlaceholder="Search products…" />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {rows.map((p) => (
            <Card key={p.id} className="p-4">
              <div className="mb-3 grid h-28 place-items-center rounded-lg bg-slate-100 dark:bg-slate-800">
                <Package className="h-8 w-8 text-slate-300" />
              </div>
              <div className="flex items-start justify-between gap-2">
                <button onClick={() => navigate(`/products/${p.id}`)} className="text-left text-sm font-semibold text-slate-900 hover:underline dark:text-white">{p.name}</button>
                {statusBadge(p)}
              </div>
              <div className="mt-1 text-xs text-slate-400">{p.brand} · {p.category}</div>
              <div className="mt-3 flex items-end justify-between">
                <div>
                  <div className="text-lg font-bold tabular-nums text-slate-900 dark:text-white">{inr(p.sellingPrice)}</div>
                  <div className="text-xs text-slate-400">{num(available(p))} {p.unit} left</div>
                </div>
                <span className="text-sm font-semibold text-emerald-600">{margin(p).toFixed(0)}%</span>
              </div>
            </Card>
          ))}
        </div>
      )}

      <ProductForm open={formOpen} onClose={() => setFormOpen(false)} editing={editing} />
    </div>
  );
}

function MenuItem({ icon: Icon, label, onClick, danger }: { icon: typeof Pencil; label: string; onClick: () => void; danger?: boolean }) {
  return (
    <button onClick={onClick} className={cn("flex w-full items-center gap-2 px-3 py-2 text-sm hover:bg-slate-100 dark:hover:bg-slate-700", danger ? "text-rose-600" : "text-slate-700 dark:text-slate-200")}>
      <Icon className="h-4 w-4" /> {label}
    </button>
  );
}
