import { useEffect, useState, useMemo } from "react";
import toast from "react-hot-toast";
import { Trash2, RotateCcw, Search, Trash } from "lucide-react";
import { Button, Card, PageHeader, Badge, Input } from "@/components/ui/primitives";
import { getBinItems, restoreFromBin, deletePermanently, pruneBinItems, saveBinItems, type BinItem } from "@/services/recycleBin";

const TYPE_LABELS: Record<BinItem["type"], string> = {
  salon: "Salon Customer",
  app_customer: "App Customer",
  vendor: "Vendor",
  sales_order: "Sales Order",
};

const TYPE_COLORS: Record<BinItem["type"], "indigo" | "amber" | "emerald" | "rose"> = {
  salon: "indigo",
  app_customer: "amber",
  vendor: "emerald",
  sales_order: "rose",
};

export default function RecycleBin() {
  const [items, setItems] = useState<BinItem[]>([]);
  const [search, setSearch] = useState("");

  const loadBin = () => {
    pruneBinItems();
    setItems(getBinItems());
  };

  useEffect(() => {
    loadBin();
  }, []);

  const handleRestore = async (item: BinItem) => {
    try {
      await restoreFromBin(item);
      toast.success(`Restored "${item.name}"`);
      loadBin();
    } catch (err: any) {
      console.error(err);
      toast.error(`Failed to restore: ${err.message || err}`);
    }
  };

  const handleDeletePermanently = (item: BinItem) => {
    if (!confirm(`Permanently delete "${item.name}"? This action is irreversible.`)) return;
    deletePermanently(item.id, item.type);
    toast.success(`Permanently deleted "${item.name}"`);
    loadBin();
  };

  const handleEmptyBin = () => {
    if (!confirm("Are you sure you want to permanently delete ALL items in the Recycle Bin? This cannot be undone.")) return;
    saveBinItems([]);
    toast.success("Recycle Bin emptied");
    loadBin();
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return items;
    return items.filter(
      (item) =>
        item.name.toLowerCase().includes(q) ||
        TYPE_LABELS[item.type].toLowerCase().includes(q)
    );
  }, [items, search]);

  return (
    <div>
      <PageHeader
        title="Recycle Bin"
        subtitle="Items deleted from Salons, App Customers, Vendors, and Sales Orders. Retained for 30 days before permanent automatic deletion."
        actions={
          items.length > 0 && (
            <Button variant="danger" onClick={handleEmptyBin} className="flex items-center gap-2">
              <Trash className="h-4 w-4" /> Empty Bin
            </Button>
          )
        }
      />

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <div className="relative w-full max-w-xs">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search deleted items..."
            className="pl-9"
          />
        </div>
        <span className="text-xs text-slate-400">{filtered.length} deleted items</span>
      </div>

      <div className="mt-4 overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 dark:bg-slate-800/60">
            <tr className="text-left text-xs uppercase tracking-wide text-slate-500">
              <th className="px-4 py-3 font-semibold">Name / Key</th>
              <th className="px-4 py-3 font-semibold">Type</th>
              <th className="px-4 py-3 font-semibold">Deleted At</th>
              <th className="px-4 py-3 font-semibold">Days Left</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-10 text-center text-sm text-slate-400">
                  No deleted items found.
                </td>
              </tr>
            ) : (
              filtered.map((item) => {
                const daysElapsed = Math.floor((Date.now() - item.deletedAt) / (24 * 60 * 60 * 1000));
                const daysRemaining = Math.max(0, 30 - daysElapsed);
                return (
                  <tr key={`${item.type}-${item.id}`} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                    <td className="px-4 py-3 font-medium text-slate-900 dark:text-white">
                      {item.name}
                      <span className="block text-[10px] text-slate-400 font-mono select-all">ID: {item.id}</span>
                    </td>
                    <td className="px-4 py-3">
                      <Badge color={TYPE_COLORS[item.type]}>{TYPE_LABELS[item.type]}</Badge>
                    </td>
                    <td className="px-4 py-3 text-slate-500">
                      {new Date(item.deletedAt).toLocaleString("en-IN", {
                        day: "2-digit",
                        month: "short",
                        year: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`font-semibold ${daysRemaining <= 5 ? "text-rose-500 animate-pulse" : "text-slate-600 dark:text-slate-300"}`}>
                        {daysRemaining} day{daysRemaining !== 1 ? "s" : ""}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          onClick={() => handleRestore(item)}
                          className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-850"
                          title="Restore"
                        >
                          <RotateCcw className="h-3.5 w-3.5" /> Restore
                        </button>
                        <button
                          onClick={() => handleDeletePermanently(item)}
                          className="rounded-lg p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-500 dark:hover:bg-rose-950 dark:hover:text-rose-400"
                          title="Delete Permanently"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
