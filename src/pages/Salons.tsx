import { useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import toast from "react-hot-toast";
import { type ColumnDef } from "@tanstack/react-table";
import { Plus, Store, Pencil, IndianRupee, Search, Trash2 } from "lucide-react";
import { Button, Field, Input, Textarea, PageHeader, StatCard, Badge } from "@/components/ui/primitives";
import { DataTable } from "@/components/ui/DataTable";
import { Modal } from "@/components/ui/Modal";
import { useDataStore } from "@/store/dataStore";
import { saveDoc, logActivity } from "@/services/data";
import { db } from "@/lib/firebase";
import { deleteDoc, doc } from "firebase/firestore";
import { inr, num, uid } from "@/lib/utils";
import type { Salon } from "@/types";

const schema = z.object({
  name: z.string().min(2, "Required"),
  ownerName: z.string().min(2, "Required"),
  phone: z.string().min(8, "Enter a valid phone"),
  gstin: z.string().optional(),
  address: z.string().optional(),
  region: z.string().optional(),
  branchNo: z.string().optional(),
  description: z.string().optional(),
});
type FormValues = z.infer<typeof schema>;

function SalonForm({ open, onClose, editing }: { open: boolean; onClose: () => void; editing: Salon | null }) {
  const { register, handleSubmit, formState: { errors } } = useForm<FormValues>({
    resolver: zodResolver(schema),
    values: editing ? { name: editing.name, ownerName: editing.ownerName, phone: editing.phone, gstin: editing.gstin, address: editing.address, region: editing.region, branchNo: editing.branchNo, description: editing.description } : { name: "", ownerName: "", phone: "", gstin: "", address: "", region: "", branchNo: "", description: "" },
  });
  const onSubmit = async (v: FormValues) => {
    const salon: Salon = {
      id: editing?.id ?? uid(),
      outstanding: editing?.outstanding ?? 0,
      totalPurchases: editing?.totalPurchases ?? 0,
      createdAt: editing?.createdAt ?? Date.now(),
      ...v,
    };
    await saveDoc("salons", salon);
    logActivity(editing ? "Edited salon" : "Added salon", "salon", salon.name);
    toast.success(editing ? "Salon updated" : "Salon added");
    onClose();
  };
  return (
    <Modal open={open} onClose={onClose} title={editing ? "Edit Salon" : "Add Salon"}
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button onClick={handleSubmit(onSubmit)}>{editing ? "Save" : "Add"}</Button></>}>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Salon name" error={errors.name?.message}><Input {...register("name")} /></Field>
        <Field label="Owner name" error={errors.ownerName?.message}><Input {...register("ownerName")} /></Field>
        <Field label="Phone" error={errors.phone?.message}><Input {...register("phone")} /></Field>
        <Field label="GSTIN"><Input {...register("gstin")} /></Field>
        <Field label="Region / City"><Input {...register("region")} placeholder="Mumbai, Thane, Pune…" /></Field>
        <Field label="Branch No"><Input {...register("branchNo")} placeholder="e.g. B-2 (optional)" /></Field>
        <div className="sm:col-span-2"><Field label="Address"><Input {...register("address")} /></Field></div>
        <div className="sm:col-span-2"><Field label="Description / notes"><Textarea rows={3} {...register("description")} placeholder="Preferred brands, delivery notes, payment terms…" /></Field></div>
      </div>
    </Modal>
  );
}

export default function Salons() {
  const { salons, salesOrders } = useDataStore();
  const adminCustomers = useDataStore((s: any) => s.adminCustomers || []);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Salon | null>(null);
  const [customerSearch, setCustomerSearch] = useState("");

  const enriched = useMemo(() => salons.map((s) => {
    const orders = salesOrders.filter((o) => o.salonId === s.id && o.status !== "Cancelled");
    return { salon: s, revenue: orders.reduce((a, o) => a + o.total, 0), profit: orders.reduce((a, o) => a + o.profit, 0), orders: orders.length };
  }), [salons, salesOrders]);

  const totals = {
    count: salons.length,
    revenue: enriched.reduce((s, e) => s + e.revenue, 0),
    outstanding: salons.reduce((s, x) => s + x.outstanding, 0),
  };

  const columns: ColumnDef<(typeof enriched)[number], unknown>[] = [
    { header: "Salon", accessorFn: (e) => e.salon.name, cell: ({ row }) => (<div><div className="font-medium text-slate-900 dark:text-white">{row.original.salon.name}{row.original.salon.branchNo ? <span className="ml-1.5 text-xs text-slate-400">· Branch {row.original.salon.branchNo}</span> : null}</div><div className="text-xs text-slate-400">{row.original.salon.ownerName} · {row.original.salon.phone}</div></div>) },
    { header: "GSTIN", accessorFn: (e) => e.salon.gstin || "—", cell: ({ getValue }) => <span className="text-slate-500">{getValue() as string}</span> },
    { header: "Orders", accessorKey: "orders", cell: ({ getValue }) => <span className="tabular-nums">{num(getValue() as number)}</span> },
    { header: "Revenue", accessorKey: "revenue", cell: ({ getValue }) => <span className="font-semibold tabular-nums">{inr(getValue() as number)}</span> },
    { header: "Profit", accessorKey: "profit", cell: ({ getValue }) => <span className="font-semibold tabular-nums text-emerald-600">{inr(getValue() as number)}</span> },
    { header: "Outstanding", accessorFn: (e) => e.salon.outstanding, cell: ({ getValue }) => { const v = getValue() as number; return v > 0 ? <Badge color="rose">{inr(v)}</Badge> : <Badge color="emerald">Clear</Badge>; } },
    { header: "", id: "actions", cell: ({ row }) => <button onClick={() => { setEditing(row.original.salon); setOpen(true); }} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"><Pencil className="h-4 w-4" /></button> },
  ];

  const handleDeleteCustomer = async (id: string, name: string) => {
    if (!window.confirm(`Delete customer "${name}"? This cannot be undone.`)) return;
    if (db) await deleteDoc(doc(db, "users", id));
    toast.success("Customer deleted");
  };

  const filteredCustomers = useMemo(() => {
    const q = customerSearch.trim().toLowerCase();
    if (!q) return adminCustomers;
    return adminCustomers.filter((c: any) =>
      (c.name || "").toLowerCase().includes(q) ||
      (c.email || "").toLowerCase().includes(q) ||
      (c.phone || "").toLowerCase().includes(q)
    );
  }, [adminCustomers, customerSearch]);

  return (
    <div>
      <PageHeader title="Salon Customers" subtitle="B2B customers, revenue and outstanding balances."
        actions={<Button onClick={() => { setEditing(null); setOpen(true); }}><Plus className="h-4 w-4" /> Add Salon</Button>} />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard icon={Store} label="Total Salons" value={num(totals.count)} />
        <StatCard icon={IndianRupee} label="Total Revenue" value={inr(totals.revenue)} accent="bg-indigo-50 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300" />
        <StatCard icon={IndianRupee} label="Outstanding" value={inr(totals.outstanding)} accent="bg-rose-50 text-rose-700 dark:bg-rose-950 dark:text-rose-300" />
      </div>

      <div className="mt-6">
        <DataTable data={enriched} columns={columns} searchPlaceholder="Search salons…" />
      </div>

      {/* ── App Customers (from admin dashboard, read-only) ─────────────── */}
      <div className="mt-10">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-slate-900 dark:text-white">App Customers</h2>
            <p className="text-xs text-slate-500">All users from the admin dashboard · {adminCustomers.length} total</p>
          </div>
          <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-900">
            <Search className="h-4 w-4 text-slate-400" />
            <input
              value={customerSearch}
              onChange={(e) => setCustomerSearch(e.target.value)}
              placeholder="Search customers…"
              className="w-48 bg-transparent text-sm outline-none placeholder:text-slate-400"
            />
          </div>
        </div>

        <div className="overflow-hidden rounded-xl border border-slate-200 dark:border-slate-700">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 dark:bg-slate-800">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Name</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Email</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Phone</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Status</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Joined</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {filteredCustomers.length === 0 ? (
                <tr><td colSpan={6} className="py-10 text-center text-slate-400">No customers found.</td></tr>
              ) : (
                filteredCustomers.map((c: any) => (
                  <tr key={c.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                    <td className="px-4 py-3 font-medium text-slate-900 dark:text-white">{c.name || c.displayName || "—"}</td>
                    <td className="px-4 py-3 text-slate-500">{c.email || "—"}</td>
                    <td className="px-4 py-3 text-slate-500">{c.phone || c.phoneNumber || "—"}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                        (c.status || "active") === "active"
                          ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300"
                          : "bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300"
                      }`}>
                        {c.status || "active"}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-500">
                      {c.createdAt ? new Date(typeof c.createdAt?.toDate === "function" ? c.createdAt.toDate() : c.createdAt).toLocaleDateString("en-IN") : "—"}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => handleDeleteCustomer(c.id, c.name || c.displayName || c.email || "this customer")}
                        className="rounded-lg p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-500 dark:hover:bg-rose-950 dark:hover:text-rose-400"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <SalonForm open={open} onClose={() => setOpen(false)} editing={editing} />
    </div>
  );
}
