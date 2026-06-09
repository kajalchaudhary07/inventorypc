import { useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import toast from "react-hot-toast";
import { type ColumnDef } from "@tanstack/react-table";
import { Plus, Users, Pencil, IndianRupee } from "lucide-react";
import { Button, Field, Input, PageHeader, StatCard, Badge } from "@/components/ui/primitives";
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
});
type FormValues = z.infer<typeof schema>;

function VendorForm({ open, onClose, editing }: { open: boolean; onClose: () => void; editing: Vendor | null }) {
  const { register, handleSubmit, formState: { errors } } = useForm<FormValues>({
    resolver: zodResolver(schema),
    values: editing ? { name: editing.name, contactName: editing.contactName, phone: editing.phone, email: editing.email ?? "", gstin: editing.gstin, address: editing.address } : { name: "", contactName: "", phone: "", email: "", gstin: "", address: "" },
  });
  const onSubmit = async (v: FormValues) => {
    const vendor: Vendor = {
      id: editing?.id ?? uid(),
      totalPurchased: editing?.totalPurchased ?? 0,
      outstanding: editing?.outstanding ?? 0,
      createdAt: editing?.createdAt ?? Date.now(),
      ...v,
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
      </div>
    </Modal>
  );
}

export default function Vendors() {
  const { vendors, purchaseOrders } = useDataStore();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Vendor | null>(null);

  const enriched = useMemo(() => vendors.map((v) => {
    const pos = purchaseOrders.filter((p) => p.vendorId === v.id);
    return { vendor: v, purchased: pos.reduce((a, p) => a + p.total, 0), orders: pos.length };
  }), [vendors, purchaseOrders]);

  const totals = {
    count: vendors.length,
    purchased: enriched.reduce((s, e) => s + e.purchased, 0),
    outstanding: vendors.reduce((s, v) => s + v.outstanding, 0),
  };

  const columns: ColumnDef<(typeof enriched)[number], unknown>[] = [
    { header: "Vendor", accessorFn: (e) => e.vendor.name, cell: ({ row }) => (<div><div className="font-medium text-slate-900 dark:text-white">{row.original.vendor.name}</div><div className="text-xs text-slate-400">{row.original.vendor.contactName} · {row.original.vendor.phone}</div></div>) },
    { header: "GSTIN", accessorFn: (e) => e.vendor.gstin || "—", cell: ({ getValue }) => <span className="text-slate-500">{getValue() as string}</span> },
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

      <div className="mt-6">
        <DataTable data={enriched} columns={columns} searchPlaceholder="Search vendors…" />
      </div>

      <VendorForm open={open} onClose={() => setOpen(false)} editing={editing} />
    </div>
  );
}
