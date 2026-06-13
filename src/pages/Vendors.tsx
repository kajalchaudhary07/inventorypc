import { useMemo, useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import toast from "react-hot-toast";
import { type ColumnDef } from "@tanstack/react-table";
import { Plus, Users, Pencil, IndianRupee } from "lucide-react";
import { Button, Field, Input, PageHeader, StatCard, Badge, Select } from "@/components/ui/primitives";
import { DataTable } from "@/components/ui/DataTable";
import { Modal } from "@/components/ui/Modal";
import { useDataStore } from "@/store/dataStore";
import { saveDoc, logActivity } from "@/services/data";
import { inr, num, uid } from "@/lib/utils";
import type { Vendor } from "@/types";

const schema = z.object({
  name: z.string().min(2, "Required"),
  contactName: z.string().min(2, "Required"),
  phone: z.string().min(8, "Enter a valid phone"),
  email: z.string().email("Invalid email").optional().or(z.literal("")),
  gstin: z.string().optional(),
  address: z.string().optional(),
  status: z.string().optional(),
});
type FormValues = z.infer<typeof schema>;

function VendorForm({ open, onClose, editing }: { open: boolean; onClose: () => void; editing: Vendor | null }) {
  const initialStatus = useMemo(() => {
    if (!editing) return "Active";
    // Read from Firestore doc field first, then localStorage fallback
    if (editing.status) return editing.status;
    const localStatusesStr = localStorage.getItem("pc_vendor_statuses");
    const localStatuses = localStatusesStr ? JSON.parse(localStatusesStr) : {};
    return localStatuses[editing.id] || "Active";
  }, [editing, open]);

  const { register, handleSubmit, formState: { errors } } = useForm<FormValues>({
    resolver: zodResolver(schema),
    values: editing
      ? { name: editing.name, contactName: editing.contactName, phone: editing.phone, email: editing.email ?? "", gstin: editing.gstin, address: editing.address, status: initialStatus }
      : { name: "", contactName: "", phone: "", email: "", gstin: "", address: "", status: "Active" },
  });

  const onSubmit = async (v: FormValues) => {
    const id = editing?.id ?? uid();
    const status = v.status || "Active";

    const vendor: Vendor = {
      id,
      totalPurchased: editing?.totalPurchased ?? 0,
      outstanding: editing?.outstanding ?? 0,
      createdAt: editing?.createdAt ?? Date.now(),
      name: v.name,
      contactName: v.contactName,
      phone: v.phone,
      email: v.email,
      gstin: v.gstin,
      address: v.address,
      status,
    };
    await saveDoc("vendors", vendor);
    logActivity(editing ? "Edited vendor" : "Added vendor", "vendor", vendor.name);
    toast.success(editing ? "Vendor updated" : "Vendor added");
    onClose();
  };

  return (
    <Modal open={open} onClose={onClose} title={editing ? "Edit Vendor" : "Add Vendor"}
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button onClick={handleSubmit(onSubmit)}>{editing ? "Save" : "Add"}</Button></>}>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Vendor name" error={errors.name?.message}><Input {...register("name")} /></Field>
        <Field label="Contact person" error={errors.contactName?.message}><Input {...register("contactName")} /></Field>
        <Field label="Phone" error={errors.phone?.message}><Input {...register("phone")} /></Field>
        <Field label="Email" error={errors.email?.message}><Input {...register("email")} /></Field>
        <Field label="GSTIN"><Input {...register("gstin")} /></Field>
        <Field label="Address"><Input {...register("address")} /></Field>
        <Field label="Status">
          <Select {...register("status")}>
            <option value="Active">Active</option>
            <option value="Inactive">Inactive</option>
            <option value="Pending Approval">Pending Approval</option>
            <option value="Suspended">Suspended</option>
            <option value="Closed">Closed</option>
            <option value="Archived">Archived</option>
          </Select>
        </Field>
      </div>
    </Modal>
  );
}

const VENDOR_STATUSES = ["Active", "Inactive", "Pending Approval", "Suspended", "Closed", "Archived"];

export default function Vendors() {
  const { vendors, purchaseOrders } = useDataStore();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Vendor | null>(null);
  const [filter, setFilter] = useState("all");
  const [localVersion, setLocalVersion] = useState(0);

  const getVendorStatus = (vendor: Vendor) => {
    // Priority 1: Firestore doc field
    if (vendor.status) return vendor.status;
    // Priority 2: localStorage fallback
    const localStatusesStr = typeof window !== "undefined" ? localStorage.getItem("pc_vendor_statuses") : null;
    const localStatuses = localStatusesStr ? JSON.parse(localStatusesStr) : {};
    return localStatuses[vendor.id] || "Active";
  };

  const enriched = useMemo(() => {
    const localPoPaymentsStr = typeof window !== "undefined" ? localStorage.getItem("pc_po_payments") : null;
    const localPoPayments = localPoPaymentsStr ? JSON.parse(localPoPaymentsStr) : {};

    return vendors.map((v) => {
      const pos = purchaseOrders.filter((p) => p.vendorId === v.id && p.status !== "Cancelled");
      const status = getVendorStatus(v);
      
      const totalPurchased = pos.reduce((a, p) => a + p.total, 0);
      const totalPaid = pos.reduce((a, p) => {
        // Priority 1: Firestore-persisted field
        if (p.amountPaid !== undefined && p.amountPaid !== null) return a + Number(p.amountPaid);
        // Priority 2: localStorage fallback
        const paid = localPoPayments[p.id] !== undefined ? Number(localPoPayments[p.id]) : 0;
        return a + paid;
      }, 0);
      const outstanding = Math.max(0, totalPurchased - totalPaid);

      return {
        vendor: { ...v, status, outstanding },
        purchased: totalPurchased,
        orders: pos.length,
        status,
        outstanding
      };
    });
  }, [vendors, purchaseOrders, localVersion]);

  const filteredRows = useMemo(() => {
    return enriched.filter((e) => filter === "all" || e.status === filter);
  }, [enriched, filter]);

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: enriched.length };
    VENDOR_STATUSES.forEach((s) => {
      c[s] = enriched.filter((e) => e.status === s).length;
    });
    return c;
  }, [enriched]);

  const totals = {
    count: filteredRows.length,
    purchased: filteredRows.reduce((s, e) => s + e.purchased, 0),
    outstanding: filteredRows.reduce((s, e) => s + e.vendor.outstanding, 0),
  };

  const columns: ColumnDef<(typeof enriched)[number], unknown>[] = [
    { header: "Vendor", accessorFn: (e) => e.vendor.name, cell: ({ row }) => (<div><div className="font-medium text-slate-900 dark:text-white">{row.original.vendor.name}</div><div className="text-xs text-slate-400">{row.original.vendor.contactName} · {row.original.vendor.phone}</div></div>) },
    { header: "GSTIN", accessorFn: (e) => e.vendor.gstin || "—", cell: ({ getValue }) => <span className="text-slate-500">{getValue() as string}</span> },
    { header: "Status", accessorFn: (e) => e.status, cell: ({ getValue }) => {
        const s = getValue() as string;
        const color = {
          "Active": "emerald",
          "Inactive": "slate",
          "Pending Approval": "amber",
          "Suspended": "rose",
          "Closed": "rose",
          "Archived": "slate"
        }[s] || "slate";
        return <Badge color={color as any}>{s}</Badge>;
      }
    },
    { header: "POs", accessorKey: "orders", cell: ({ getValue }) => <span className="tabular-nums">{num(getValue() as number)}</span> },
    { header: "Purchased", accessorKey: "purchased", cell: ({ getValue }) => <span className="font-semibold tabular-nums">{inr(getValue() as number)}</span> },
    { header: "Outstanding", accessorFn: (e) => e.vendor.outstanding, cell: ({ getValue }) => { const v = getValue() as number; return v > 0 ? <Badge color="rose">{inr(v)}</Badge> : <Badge color="emerald">Clear</Badge>; } },
    { header: "", id: "actions", cell: ({ row }) => <button onClick={() => { setEditing(row.original.vendor); setOpen(true); }} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"><Pencil className="h-4 w-4" /></button> },
  ];

  return (
    <div>
      <PageHeader title="Vendors" subtitle="Suppliers, purchase history and payment tracking."
        actions={<Button onClick={() => { setEditing(null); setOpen(true); }}><Plus className="h-4 w-4" /> Add Vendor</Button>} />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard icon={Users} label="Total Vendors" value={num(totals.count)} />
        <StatCard icon={IndianRupee} label="Total Purchased" value={inr(totals.purchased)} accent="bg-indigo-50 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300" />
        <StatCard icon={IndianRupee} label="Payable" value={inr(totals.outstanding)} accent="bg-rose-50 text-rose-700 dark:bg-rose-950 dark:text-rose-300" />
      </div>

      {/* Top Status Filter */}
      <div className="mb-4 mt-6 flex flex-wrap gap-2">
        {["all", ...VENDOR_STATUSES].map((s) => {
          const isActive = filter === s;
          const count = s === "all" ? counts.all : counts[s];
          return (
            <button
              key={s}
              onClick={() => setFilter(s)}
              className={`rounded-full px-3.5 py-1.5 text-xs font-medium ring-1 ring-inset transition inline-flex items-center gap-1.5 ${
                isActive
                  ? "bg-slate-900 text-white ring-slate-900 dark:bg-white dark:text-slate-900"
                  : "bg-white text-slate-600 ring-slate-200 hover:bg-slate-50 dark:bg-slate-900 dark:text-slate-300 dark:ring-slate-700"
              }`}
            >
              <span>{s === "all" ? "All" : s}</span>
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
      </div>

      <div className="mt-6">
        <DataTable data={filteredRows} columns={columns} searchPlaceholder="Search vendors…" />
      </div>

      <VendorForm open={open} onClose={() => { setOpen(false); setLocalVersion((v) => v + 1); }} editing={editing} />
    </div>
  );
}
