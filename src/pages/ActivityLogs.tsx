import { type ColumnDef } from "@tanstack/react-table";
import { ScrollText, FileDown } from "lucide-react";
import { Button, PageHeader, Badge } from "@/components/ui/primitives";
import { DataTable } from "@/components/ui/DataTable";
import { useDataStore } from "@/store/dataStore";
import { fmtDateTime, exportCsv } from "@/lib/utils";
import type { ActivityLog } from "@/types";

const ENTITY_COLOR: Record<string, Parameters<typeof Badge>[0]["color"]> = {
  product: "blue",
  salesOrder: "emerald",
  purchaseOrder: "indigo",
  salon: "violet",
  vendor: "amber",
  itemGroup: "slate",
  session: "slate",
};

export default function ActivityLogs() {
  const logs = useDataStore((s) => s.activityLogs);
  const products = useDataStore((s) => s.products);
  const adminProducts = useDataStore((s: any) => s.adminProducts || []);
  const salons = useDataStore((s) => s.salons);
  const vendors = useDataStore((s) => s.vendors);

  const rows = [...logs].sort((a, b) => b.createdAt - a.createdAt);

  const parseLogDetail = (log: ActivityLog) => {
    const fallback = log.detail || "-";
    if (log.entity === "product" || log.entity === "inventoryProduct") {
      const prod = products.find(p => p.id === log.entityId || p.sku === log.entityId)
        || adminProducts.find((p: any) => p.id === log.entityId || p.sku === log.entityId);
      
      const name = prod?.name || log.detail || "-";
      const sku = prod?.sku || log.entityId || "-";
      const costPrice = prod?.costPrice != null ? `₹${prod.costPrice}` : "-";
      const sellingPrice = (prod?.price ?? prod?.sellingPrice) != null ? `₹${prod?.price ?? prod?.sellingPrice}` : "-";
      return `Product: ${name} (SKU: ${sku}) · CP: ${costPrice} · SP: ${sellingPrice}`;
    }

    if (log.entity === "salon") {
      const salon = salons.find(s => s.id === log.entityId || s.name === log.detail);
      const name = salon?.name || log.detail || "-";
      const tier = (salon as any)?.tier || (salon as any)?.type || "-";
      const region = salon?.region || "-";
      return `Salon: ${name} · Tier/Type: ${tier} · Region: ${region}`;
    }

    if (log.entity === "vendor") {
      const vendor = vendors.find(v => v.id === log.entityId || v.name === log.detail);
      const name = vendor?.name || log.detail || "-";
      const category = (vendor as any)?.category || "-";
      return `Vendor: ${name} · Category: ${category}`;
    }

    if (log.entity === "session" || log.action === "User Login") {
      const email = log.user || "-";
      const formattedTime = log.createdAt ? fmtDateTime(log.createdAt) : "-";
      return `Session: User ${email} logged in at ${formattedTime}`;
    }

    return fallback;
  };

  const columns: ColumnDef<ActivityLog, unknown>[] = [
    { 
      header: "Time", 
      accessorKey: "createdAt", 
      cell: ({ row }) => {
        const log = row.original;
        const val = log.createdAt;
        if (log.entity === "session" || log.action === "User Login") {
          return <span className="font-semibold text-slate-700 dark:text-slate-200">{val ? fmtDateTime(val) : "-"}</span>;
        }
        return <span className="text-slate-500">{val ? fmtDateTime(val) : "-"}</span>;
      }
    },
    { 
      header: "Action", 
      accessorKey: "action", 
      cell: ({ getValue }) => <span className="font-medium text-slate-900 dark:text-white">{getValue() as string || "-"}</span> 
    },
    { 
      header: "Entity", 
      accessorKey: "entity", 
      cell: ({ row }) => { 
        const log = row.original;
        const e = log.entity || "-";
        let displayEntity = e;
        if (log.action === "User Login" || e === "session") {
          displayEntity = "session";
        } else if (e === "inventoryProduct") {
          displayEntity = "product";
        }
        return <Badge color={ENTITY_COLOR[displayEntity] ?? "slate"}>{displayEntity}</Badge>; 
      } 
    },
    { 
      header: "Detail", 
      accessorKey: "detail", 
      cell: ({ row }) => <span className="text-slate-500">{parseLogDetail(row.original)}</span> 
    },
    { 
      header: "User", 
      accessorKey: "user", 
      cell: ({ row }) => {
        const log = row.original;
        const u = log.user || "-";
        if (log.entity === "session" || log.action === "User Login") {
          return <span className="font-semibold text-slate-700 dark:text-slate-200">{u}</span>;
        }
        return <span className="text-xs text-slate-400">{u}</span>;
      }
    },
  ];

  return (
    <div>
      <PageHeader title="Activity Logs" subtitle="Audit trail of product, stock, order and price changes."
        actions={<Button variant="secondary" onClick={() => exportCsv(rows.map((l) => ({ time: fmtDateTime(l.createdAt), action: l.action || "-", entity: l.entity || "-", detail: parseLogDetail(l), user: l.user || "-" })), "activity-logs")}><FileDown className="h-4 w-4" /> Export</Button>} />
      {rows.length ? (
        <DataTable data={rows} columns={columns} searchPlaceholder="Search activity…" pageSize={15} />
      ) : (
        <div className="flex flex-col items-center py-16 text-center text-slate-400">
          <ScrollText className="mb-3 h-8 w-8" />
          <p className="text-sm">No activity yet — actions you take will appear here.</p>
        </div>
      )}
    </div>
  );
}
