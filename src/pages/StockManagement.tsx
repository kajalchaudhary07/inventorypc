import { useMemo, useState } from "react";
import toast from "react-hot-toast";
import { type ColumnDef } from "@tanstack/react-table";
import { Warehouse, ArrowDownToLine, ArrowUpFromLine, IndianRupee, SlidersHorizontal } from "lucide-react";
import { Button, Card, Field, Input, Select, PageHeader, StatCard } from "@/components/ui/primitives";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { DataTable } from "@/components/ui/DataTable";
import { Modal } from "@/components/ui/Modal";
import { useDataStore } from "@/store/dataStore";
import { adjustStock } from "@/services/data";
import { inr, num, fmtDateTime, exportCsv } from "@/lib/utils";
import { invValue } from "@/lib/calc";
import type { MovementType, Product, StockMovement } from "@/types";

const TYPES: { value: MovementType; label: string; sign: number }[] = [
  { value: "adjustment", label: "Manual adjustment", sign: 1 },
  { value: "in", label: "Stock in", sign: 1 },
  { value: "out", label: "Stock out", sign: -1 },
  { value: "damaged", label: "Damaged", sign: -1 },
  { value: "expired", label: "Expired", sign: -1 },
];

function AdjustModal({ open, onClose, product }: { open: boolean; onClose: () => void; product: Product | null }) {
  const [type, setType] = useState<MovementType>("adjustment");
  const [qty, setQty] = useState(1);
  const [reason, setReason] = useState("");

  if (!product) return null;
  const conf = TYPES.find((t) => t.value === type)!;
  const signed = conf.sign * Math.abs(qty);

  const submit = async () => {
    if (!qty) { toast.error("Enter a quantity"); return; }
    await adjustStock(product, type, signed, reason || conf.label);
    toast.success("Stock updated");
    setQty(1); setReason("");
    onClose();
  };

  return (
    <Modal
      open={open} onClose={onClose} title={`Adjust stock — ${product.name}`}
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button onClick={submit}>Apply</Button></>}
    >
      <div className="mb-3 rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-600 dark:bg-slate-800 dark:text-slate-300">
        Current stock: <b>{num(product.stock)}</b> {product.unit} · New balance:{" "}
        <b className={signed < 0 ? "text-rose-600" : "text-emerald-600"}>{num(product.stock + signed)}</b>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <Field label="Movement type">
          <Select value={type} onChange={(e) => setType(e.target.value as MovementType)}>
            {TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
          </Select>
        </Field>
        <Field label="Quantity"><Input type="number" min={1} value={qty} onChange={(e) => setQty(Number(e.target.value))} /></Field>
      </div>
      <Field label="Reason / note"><Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Stock count correction, breakage…" /></Field>
    </Modal>
  );
}

export default function StockManagement() {
  const { products, stockMovements } = useDataStore();
  const [selected, setSelected] = useState<Product | null>(null);
  const [open, setOpen] = useState(false);
  const [typeFilter, setTypeFilter] = useState("all");
  const [productFilter, setProductFilter] = useState("all");

  const totals = useMemo(() => {
    const stockIn = stockMovements.filter((m) => m.qty > 0).reduce((s, m) => s + m.qty, 0);
    const stockOut = stockMovements.filter((m) => m.qty < 0).reduce((s, m) => s + Math.abs(m.qty), 0);
    const valuation = products.reduce((s, p) => s + invValue(p), 0);
    const currentUnits = products.reduce((s, p) => s + p.stock, 0);
    return { stockIn, stockOut, valuation, currentUnits };
  }, [products, stockMovements]);

  const moves = stockMovements
    .filter((m) => (typeFilter === "all" || m.type === typeFilter) && (productFilter === "all" || m.productId === productFilter))
    .sort((a, b) => b.createdAt - a.createdAt);

  const columns: ColumnDef<StockMovement, unknown>[] = [
    { header: "Date", accessorKey: "createdAt", cell: ({ getValue }) => <span className="text-slate-500">{fmtDateTime(getValue() as number)}</span> },
    { header: "Product", accessorKey: "productName", cell: ({ getValue }) => <span className="font-medium text-slate-900 dark:text-white">{getValue() as string}</span> },
    { header: "Type", accessorKey: "type", cell: ({ getValue }) => <StatusBadge value={getValue() as string} /> },
    { header: "Qty", accessorKey: "qty", cell: ({ getValue }) => { const q = getValue() as number; return <span className={`font-semibold tabular-nums ${q >= 0 ? "text-emerald-600" : "text-rose-600"}`}>{q > 0 ? "+" : ""}{q}</span>; } },
    { header: "Balance", accessorKey: "balanceAfter", cell: ({ getValue }) => <span className="tabular-nums text-slate-500">{num(getValue() as number)}</span> },
    { header: "Reason", accessorKey: "reason", cell: ({ getValue, row }) => <span className="text-slate-500">{(getValue() as string) || "—"}{row.original.refNo ? ` · ${row.original.refNo}` : ""}</span> },
  ];

  return (
    <div>
      <PageHeader
        title="Stock Management"
        subtitle="Adjustments, damaged & expired stock, and full movement history."
        actions={<Button variant="secondary" onClick={() => exportCsv(moves.map((m) => ({ date: fmtDateTime(m.createdAt), product: m.productName, type: m.type, qty: m.qty, balance: m.balanceAfter, reason: m.reason })), "stock-movements")}>Export</Button>}
      />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard icon={ArrowDownToLine} label="Total Stock In" value={num(totals.stockIn)} accent="bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300" />
        <StatCard icon={ArrowUpFromLine} label="Total Stock Out" value={num(totals.stockOut)} accent="bg-rose-50 text-rose-700 dark:bg-rose-950 dark:text-rose-300" />
        <StatCard icon={Warehouse} label="Current Units" value={num(totals.currentUnits)} />
        <StatCard icon={IndianRupee} label="Stock Valuation" value={inr(totals.valuation)} accent="bg-indigo-50 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300" />
      </div>

      <Card className="mt-6 p-5">
        <h3 className="mb-3 text-sm font-semibold text-slate-900 dark:text-white">Quick adjust</h3>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {products.filter((p) => p.status === "active").map((p) => (
            <button key={p.id} onClick={() => { setSelected(p); setOpen(true); }} className="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2.5 text-left hover:border-slate-900 dark:border-slate-700 dark:hover:border-slate-400">
              <div className="min-w-0">
                <div className="truncate text-sm font-medium text-slate-900 dark:text-white">{p.name}</div>
                <div className="text-xs text-slate-400">{num(p.stock)} {p.unit}</div>
              </div>
              <SlidersHorizontal className="h-4 w-4 shrink-0 text-slate-400" />
            </button>
          ))}
        </div>
      </Card>

      <div className="mt-6">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <h3 className="mr-auto text-sm font-semibold text-slate-900 dark:text-white">Movement History</h3>
          <Select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} className="w-auto">
            <option value="all">All types</option>
            {TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
            <option value="return">Return</option>
          </Select>
          <Select value={productFilter} onChange={(e) => setProductFilter(e.target.value)} className="w-auto">
            <option value="all">All products</option>
            {products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </Select>
        </div>
        <DataTable data={moves} columns={columns} searchPlaceholder="Search movements…" />
      </div>

      <AdjustModal open={open} onClose={() => setOpen(false)} product={selected} />
    </div>
  );
}
