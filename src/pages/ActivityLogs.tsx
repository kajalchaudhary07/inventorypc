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
};

export default function ActivityLogs() {
  const logs = useDataStore((s) => s.activityLogs);
  const rows = [...logs].sort((a, b) => b.createdAt - a.createdAt);

  const columns: ColumnDef<ActivityLog, unknown>[] = [
    { header: "Time", accessorKey: "createdAt", cell: ({ getValue }) => <span className="text-slate-500">{fmtDateTime(getValue() as number)}</span> },
    { header: "Action", accessorKey: "action", cell: ({ getValue }) => <span className="font-medium text-slate-900 dark:text-white">{getValue() as string}</span> },
    { header: "Entity", accessorKey: "entity", cell: ({ getValue }) => { const e = getValue() as string; return <Badge color={ENTITY_COLOR[e] ?? "slate"}>{e}</Badge>; } },
    { header: "Detail", accessorKey: "detail", cell: ({ getValue }) => <span className="text-slate-500">{getValue() as string}</span> },
    { header: "User", accessorKey: "user", cell: ({ getValue }) => <span className="text-xs text-slate-400">{getValue() as string}</span> },
  ];

  return (
    <div>
      <PageHeader title="Activity Logs" subtitle="Audit trail of product, stock, order and price changes."
        actions={<Button variant="secondary" onClick={() => exportCsv(rows.map((l) => ({ time: fmtDateTime(l.createdAt), action: l.action, entity: l.entity, detail: l.detail, user: l.user })), "activity-logs")}><FileDown className="h-4 w-4" /> Export</Button>} />
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
