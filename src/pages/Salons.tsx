import { useMemo, useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import toast from "react-hot-toast";
import { type ColumnDef } from "@tanstack/react-table";
import { Plus, Store, Pencil, IndianRupee, Search, Trash2, Eye, Calendar } from "lucide-react";
import { Button, Field, Input, Textarea, PageHeader, StatCard, Badge, Select } from "@/components/ui/primitives";
import { DataTable } from "@/components/ui/DataTable";
import { Modal } from "@/components/ui/Modal";
import { useDataStore } from "@/store/dataStore";
import { saveDoc, logActivity } from "@/services/data";
import { db } from "@/lib/firebase";
import { deleteDoc, doc, updateDoc } from "firebase/firestore";
import { deleteToBin } from "@/services/recycleBin";
import { inr, num, uid, getOrderPaymentInfo } from "@/lib/utils";
import type { Salon } from "@/types";

const getField = (obj: any, keys: string[]) => {
  for (const key of keys) {
    if (obj && obj[key] !== undefined && obj[key] !== null && obj[key] !== "") {
      return obj[key];
    }
  }
  return "";
};

const extractName = (obj: any) => getField(obj, ["name", "customerName", "ownerName", "displayName", "salonName"]);
const extractPhone = (obj: any) => getField(obj, ["phone", "mobile", "phoneNumber", "customerPhone", "ownerPhone"]);
const extractEmail = (obj: any) => getField(obj, ["email", "customerEmail", "ownerEmail", "salonEmail", "userEmail"]);

const getCustomerSalonName = (c: any, salons: any[]) => {
  const direct = getField(c, ["salonName", "salon"]);
  if (direct) return direct;
  const salonId = c.salonId || c.id || "";
  const found = salons.find((s: any) => s.id === salonId);
  return found ? found.name : "";
};

const schema = z.object({
  name: z.string().min(2, "Required"),
  ownerName: z.string().min(2, "Required"),
  phone: z.string().min(8, "Enter a valid phone"),
  email: z.string().optional(),
  gstin: z.string().optional(),
  address: z.string().optional(),
  region: z.string().optional(),
  branchNo: z.string().optional(),
  description: z.string().optional(),
  status: z.string().optional(),
});
type FormValues = z.infer<typeof schema>;

function SalonForm({ open, onClose, editing }: { open: boolean; onClose: () => void; editing: Salon | null }) {
  const initialStatus = useMemo(() => {
    if (!editing) return "Active";
    // Read from Firestore doc field first, then localStorage fallback
    if (editing.status) return editing.status;
    const localStatusesStr = localStorage.getItem("pc_salon_statuses");
    const localStatuses = localStatusesStr ? JSON.parse(localStatusesStr) : {};
    return localStatuses[editing.id] || "Active";
  }, [editing, open]);

  const { register, handleSubmit, formState: { errors } } = useForm<FormValues>({
    resolver: zodResolver(schema),
    values: editing
      ? { 
          name: editing.name, 
          ownerName: editing.ownerName, 
          phone: editing.phone, 
          email: editing.email || "",
          gstin: editing.gstin || "", 
          address: editing.address || "", 
          region: editing.region || "", 
          branchNo: editing.branchNo || "", 
          description: editing.description || "", 
          status: initialStatus 
        }
      : { 
          name: "", 
          ownerName: "", 
          phone: "", 
          email: "",
          gstin: "", 
          address: "", 
          region: "", 
          branchNo: "", 
          description: "", 
          status: "Active" 
        },
  });

  const onSubmit = async (v: FormValues) => {
    const id = editing?.id ?? uid();
    const status = v.status || "Active";

    const salon: Salon = {
      id,
      outstanding: editing?.outstanding ?? 0,
      totalPurchases: editing?.totalPurchases ?? 0,
      createdAt: editing?.createdAt ?? Date.now(),
      name: v.name,
      ownerName: v.ownerName,
      phone: v.phone,
      email: v.email || "",
      gstin: v.gstin,
      address: v.address,
      region: v.region,
      branchNo: v.branchNo,
      description: v.description,
      status,
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
        <Field label="Email" error={errors.email?.message}><Input {...register("email")} placeholder="optional" /></Field>
        <Field label="GSTIN"><Input {...register("gstin")} /></Field>
        <Field label="Region / City"><Input {...register("region")} placeholder="Mumbai, Thane, Pune…" /></Field>
        <Field label="Branch No"><Input {...register("branchNo")} placeholder="e.g. B-2 (optional)" /></Field>
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
        <div className="sm:col-span-2"><Field label="Address"><Input {...register("address")} /></Field></div>
        <div className="sm:col-span-2"><Field label="Description / notes"><Textarea rows={3} {...register("description")} placeholder="Preferred brands, delivery notes, payment terms…" /></Field></div>
      </div>
    </Modal>
  );
}

function SalonDetailsModal({ salon, orders, onClose }: { salon: Salon; orders: any[]; onClose: () => void }) {
  const [dateFilter, setDateFilter] = useState<"all" | "30days" | "90days" | "custom">("all");
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");
  const [breakdownTab, setBreakdownTab] = useState<"week" | "month" | "year">("month");

  // Filter orders by date
  const filteredOrders = orders.filter((o) => {
    if (dateFilter === "all") return true;
    const ts = o.createdAt;
    if (dateFilter === "30days") {
      return ts >= Date.now() - 30 * 24 * 60 * 60 * 1000;
    }
    if (dateFilter === "90days") {
      return ts >= Date.now() - 90 * 24 * 60 * 60 * 1000;
    }
    if (dateFilter === "custom") {
      const start = customStart ? new Date(customStart).getTime() : 0;
      const end = customEnd ? new Date(customEnd).getTime() + 86400000 - 1 : Infinity;
      return ts >= start && ts <= end;
    }
    return true;
  });

  // Calculate totals
  const totalOrders = filteredOrders.length;
  const totalSales = filteredOrders.reduce((sum, o) => sum + o.total, 0);
  const totalProfit = filteredOrders.reduce((sum, o) => sum + o.profit, 0);

  // Group by helpers
  const getWeekKey = (timestamp: number) => {
    const d = new Date(timestamp);
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1); // Monday start
    const startOfWeek = new Date(d.setDate(diff));
    const endOfWeek = new Date(startOfWeek);
    endOfWeek.setDate(startOfWeek.getDate() + 6);
    const startStr = startOfWeek.toLocaleDateString("en-IN", { day: "2-digit", month: "short" });
    const endStr = endOfWeek.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "2-digit" });
    return `${startStr} - ${endStr}`;
  };

  const getMonthKey = (timestamp: number) => {
    return new Date(timestamp).toLocaleDateString("en-IN", { month: "short", year: "numeric" });
  };

  const getYearKey = (timestamp: number) => {
    return new Date(timestamp).getFullYear().toString();
  };

  // Build breakdown data
  const breakdownData = useMemo(() => {
    const groups: Record<string, { label: string; count: number; sales: number; profit: number; minTs: number }> = {};

    filteredOrders.forEach((o) => {
      let key = "";
      if (breakdownTab === "week") key = getWeekKey(o.createdAt);
      else if (breakdownTab === "month") key = getMonthKey(o.createdAt);
      else key = getYearKey(o.createdAt);

      if (!groups[key]) {
        groups[key] = { label: key, count: 0, sales: 0, profit: 0, minTs: o.createdAt };
      }
      groups[key].count += 1;
      groups[key].sales += o.total;
      groups[key].profit += o.profit;
      groups[key].minTs = Math.min(groups[key].minTs, o.createdAt);
    });

    return Object.values(groups).sort((a, b) => b.minTs - a.minTs);
  }, [filteredOrders, breakdownTab]);

  return (
    <Modal open={!!salon} onClose={onClose} title={`Salon Details & Performance: ${salon.name}`} wide
      footer={<Button onClick={onClose}>Close</Button>}>
      <div className="space-y-6">
        {/* General Info Section */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-800/50 text-sm">
          <div>
            <span className="block text-xs font-semibold uppercase tracking-wider text-slate-400">Owner Name</span>
            <span className="font-semibold text-slate-900 dark:text-white">{salon.ownerName || "—"}</span>
          </div>
          <div>
            <span className="block text-xs font-semibold uppercase tracking-wider text-slate-400">Phone</span>
            <span className="font-semibold text-slate-900 dark:text-white">{salon.phone || "—"}</span>
          </div>
          <div>
            <span className="block text-xs font-semibold uppercase tracking-wider text-slate-400">Email</span>
            <span className="font-semibold text-slate-900 dark:text-white">{salon.email || "—"}</span>
          </div>
          <div>
            <span className="block text-xs font-semibold uppercase tracking-wider text-slate-400">GSTIN</span>
            <span className="font-semibold text-slate-900 dark:text-white">{salon.gstin || "—"}</span>
          </div>
          <div>
            <span className="block text-xs font-semibold uppercase tracking-wider text-slate-400">Branch No</span>
            <span className="font-semibold text-slate-900 dark:text-white">{salon.branchNo || "—"}</span>
          </div>
          <div>
            <span className="block text-xs font-semibold uppercase tracking-wider text-slate-400">Region / City</span>
            <span className="font-semibold text-slate-900 dark:text-white">{salon.region || "—"}</span>
          </div>
          <div className="md:col-span-2">
            <span className="block text-xs font-semibold uppercase tracking-wider text-slate-400">Address</span>
            <span className="font-semibold text-slate-900 dark:text-white">{salon.address || "—"}</span>
          </div>
          {salon.description && (
            <div className="md:col-span-2 lg:col-span-4">
              <span className="block text-xs font-semibold uppercase tracking-wider text-slate-400">Description / Notes</span>
              <span className="text-slate-600 dark:text-slate-300">{salon.description}</span>
            </div>
          )}
        </div>

        {/* Date Filter */}
        <div className="flex flex-wrap items-center gap-2 rounded-lg bg-slate-50 p-3 dark:bg-slate-800/50">
          <span className="text-xs font-semibold uppercase tracking-wider text-slate-400 mr-2">Time Period:</span>
          <div className="flex rounded-lg bg-slate-200/60 p-0.5 dark:bg-slate-900/60">
            {(["all", "30days", "90days", "custom"] as const).map((mode) => (
              <button
                key={mode}
                onClick={() => setDateFilter(mode)}
                className={`rounded-md px-3 py-1 text-xs font-medium transition ${
                  dateFilter === mode
                    ? "bg-white text-slate-900 shadow-sm dark:bg-slate-800 dark:text-white"
                    : "text-slate-500 hover:text-slate-900 dark:hover:text-white"
                }`}
              >
                {mode === "all" ? "All Time" : mode === "30days" ? "30 Days" : mode === "90days" ? "90 Days" : "Custom"}
              </button>
            ))}
          </div>

          {dateFilter === "custom" && (
            <div className="flex items-center gap-2 animate-in slide-in-from-left-2 duration-200">
              <input
                type="date"
                value={customStart}
                onChange={(e) => setCustomStart(e.target.value)}
                className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-white focus:outline-none"
              />
              <span className="text-xs text-slate-400">to</span>
              <input
                type="date"
                value={customEnd}
                onChange={(e) => setCustomEnd(e.target.value)}
                className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-white focus:outline-none"
              />
            </div>
          )}
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-3 gap-4">
          <div className="rounded-xl border border-slate-200 p-4 bg-white dark:border-slate-700 dark:bg-slate-900">
            <div className="text-xs font-medium text-slate-500">Total Orders</div>
            <div className="text-2xl font-bold mt-1 text-slate-900 dark:text-white">{totalOrders}</div>
          </div>
          <div className="rounded-xl border border-slate-200 p-4 bg-white dark:border-slate-700/50 dark:bg-slate-900">
            <div className="text-xs font-medium text-slate-500">Total Sales/Bill</div>
            <div className="text-2xl font-bold mt-1 text-slate-900 dark:text-white">{inr(totalSales)}</div>
          </div>
          <div className="rounded-xl border border-slate-200 p-4 bg-white dark:border-slate-700/50 dark:bg-slate-900">
            <div className="text-xs font-medium text-slate-500">Total Profit</div>
            <div className="text-2xl font-bold mt-1 text-emerald-600 dark:text-emerald-400">{inr(totalProfit)}</div>
          </div>
        </div>

        {/* Frequency Breakdown Section */}
        <div className="space-y-3">
          <div className="flex items-center justify-between border-b border-slate-200 pb-2 dark:border-slate-700">
            <h3 className="font-semibold text-slate-900 dark:text-white">Order Frequency</h3>
            
            {/* Tabs for Week/Month/Year */}
            <div className="flex rounded-lg bg-slate-100 p-0.5 dark:bg-slate-800">
              {(["week", "month", "year"] as const).map((tab) => (
                <button
                  key={tab}
                  onClick={() => setBreakdownTab(tab)}
                  className={`rounded-md px-2.5 py-1 text-xs font-medium transition ${
                    breakdownTab === tab
                      ? "bg-white text-slate-900 shadow-sm dark:bg-slate-700 dark:text-white"
                      : "text-slate-500 hover:text-slate-900 dark:hover:text-white"
                  }`}
                >
                  {tab === "week" ? "Weekly" : tab === "month" ? "Monthly" : "Yearly"}
                </button>
              ))}
            </div>
          </div>

          <div className="overflow-hidden rounded-xl border border-slate-200 dark:border-slate-700">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 dark:bg-slate-800">
                <tr className="text-left text-xs uppercase text-slate-500">
                  <th className="px-4 py-2.5 font-semibold">Period</th>
                  <th className="px-4 py-2.5 font-semibold text-right">Orders</th>
                  <th className="px-4 py-2.5 font-semibold text-right">Sales</th>
                  <th className="px-4 py-2.5 font-semibold text-right">Profit</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {breakdownData.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="py-8 text-center text-slate-400">No data for this period.</td>
                  </tr>
                ) : (
                  breakdownData.map((row) => (
                    <tr key={row.label} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                      <td className="px-4 py-2.5 font-medium text-slate-900 dark:text-white">{row.label}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums">{row.count}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums font-semibold">{inr(row.sales)}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-emerald-600 font-semibold">{inr(row.profit)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </Modal>
  );
}

const SALON_STATUSES = ["Active", "Inactive", "Pending Approval", "Suspended", "Closed", "Archived"];

export default function Salons() {
  const { salons, salesOrders } = useDataStore();
  const adminCustomers = useDataStore((s: any) => s.adminCustomers || []);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Salon | null>(null);
  const [detailsSalon, setDetailsSalon] = useState<Salon | null>(null);
  const [detailsCustomer, setDetailsCustomer] = useState<any>(null);
  const [editingCustomer, setEditingCustomer] = useState<any>(null);
  const [customerSearch, setCustomerSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const [localVersion, setLocalVersion] = useState(0);

  const getSalonStatus = (salon: Salon) => {
    // Priority 1: Firestore doc field
    if (salon.status) return salon.status;
    // Priority 2: localStorage fallback
    const localStatusesStr = typeof window !== "undefined" ? localStorage.getItem("pc_salon_statuses") : null;
    const localStatuses = localStatusesStr ? JSON.parse(localStatusesStr) : {};
    return localStatuses[salon.id] || "Active";
  };

  const enriched = useMemo(() => salons.map((s) => {
    const orders = salesOrders.filter((o) => o.salonId === s.id && o.status !== "Cancelled");
    const status = getSalonStatus(s);

    // Outstanding Balance = Total Bill Amount of all orders for this salon minus Total Amount Paid across all orders for this salon
    const totalBill = orders.reduce((a, o) => a + o.total, 0);
    const totalPaid = orders.reduce((a, o) => {
      const { amountPaid } = getOrderPaymentInfo(o);
      return a + amountPaid;
    }, 0);
    const outstanding = Math.max(0, totalBill - totalPaid);

    return { 
      salon: { ...s, status, outstanding }, 
      revenue: totalBill, 
      profit: orders.reduce((a, o) => a + o.profit, 0), 
      orders: orders.length,
      status,
      outstanding
    };
  }), [salons, salesOrders, localVersion]);

  const filteredRows = useMemo(() => {
    return enriched.filter((e) => filter === "all" || e.status === filter);
  }, [enriched, filter]);

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: enriched.length };
    SALON_STATUSES.forEach((s) => {
      c[s] = enriched.filter((e) => e.status === s).length;
    });
    return c;
  }, [enriched]);

  const totals = {
    count: filteredRows.length,
    revenue: filteredRows.reduce((s, e) => s + e.revenue, 0),
    outstanding: filteredRows.reduce((s, e) => s + e.salon.outstanding, 0),
  };

  const columns: ColumnDef<(typeof enriched)[number], unknown>[] = [
    { 
      header: "Salon", 
      accessorFn: (e) => {
        const s = e.salon;
        const name = extractName(s) || "";
        const owner = s.ownerName || "";
        const phone = extractPhone(s) || "";
        const email = extractEmail(s) || "";
        return `${name} ${owner} ${phone} ${email}`;
      }, 
      cell: ({ row }) => {
        const s = row.original.salon;
        const name = extractName(s) || "-";
        const owner = s.ownerName || "-";
        const phone = extractPhone(s) || "-";
        const email = extractEmail(s) || "-";
        const branchStr = s.branchNo ? ` · Branch ${s.branchNo}` : "";
        return (
          <div>
            <div className="font-medium text-slate-900 dark:text-white">
              {name}
              {s.branchNo ? <span className="ml-1.5 text-xs text-slate-400">{branchStr}</span> : null}
            </div>
            <div className="text-xs text-slate-400">
              {owner} · {phone} · {email}
            </div>
          </div>
        );
      } 
    },
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
    { header: "Orders", accessorKey: "orders", cell: ({ getValue }) => <span className="tabular-nums">{num(getValue() as number)}</span> },
    { header: "Revenue", accessorKey: "revenue", cell: ({ getValue }) => <span className="font-semibold tabular-nums">{inr(getValue() as number)}</span> },
    { header: "Profit", accessorKey: "profit", cell: ({ getValue }) => <span className="font-semibold tabular-nums text-emerald-600">{inr(getValue() as number)}</span> },
    { header: "Outstanding", accessorFn: (e) => e.salon.outstanding, cell: ({ getValue }) => { const v = getValue() as number; return v > 0 ? <Badge color="rose">{inr(v)}</Badge> : <Badge color="emerald">Clear</Badge>; } },
    { 
      header: "", 
      id: "actions", 
      cell: ({ row }) => (
        <div className="flex items-center gap-1">
          <button 
            onClick={() => { setEditing(row.original.salon); setOpen(true); }} 
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-900 dark:hover:bg-slate-800 dark:hover:text-white transition"
            title="Edit Salon"
          >
            <Pencil className="h-4 w-4" />
          </button>
          <button 
            onClick={() => handleDeleteSalon(row.original.salon)} 
            className="rounded-lg p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-500 dark:hover:bg-rose-950 dark:hover:text-rose-400 transition"
            title="Delete Salon"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      )
    },
  ];

  const handleDeleteSalon = async (salon: Salon) => {
    if (!window.confirm(`Delete salon "${salon.name}"? This item can be restored from the Recycle Bin.`)) return;
    await deleteToBin("salon", salon.id, salon.name, salon, "salons");
    toast.success("Salon moved to Recycle Bin");
    setLocalVersion((v) => v + 1);
  };

  const handleDeleteCustomer = async (c: any) => {
    const name = extractName(c) || c.email || "this customer";
    if (!window.confirm(`Delete customer "${name}"? This item can be restored from the Recycle Bin.`)) return;
    await deleteToBin("app_customer", c.id, name, c, "users");
    toast.success("Customer moved to Recycle Bin");
    setLocalVersion((v) => v + 1);
  };

  const filteredCustomers = useMemo(() => {
    const q = customerSearch.trim().toLowerCase();
    if (!q) return adminCustomers;
    return adminCustomers.filter((c: any) => {
      const cName = (extractName(c) || "").toLowerCase();
      const cPhone = (extractPhone(c) || "").toLowerCase();
      const cEmail = (extractEmail(c) || "").toLowerCase();
      const cSalon = (getCustomerSalonName(c, salons) || "").toLowerCase();
      return cName.includes(q) || cPhone.includes(q) || cEmail.includes(q) || cSalon.includes(q);
    });
  }, [adminCustomers, customerSearch, salons]);

  return (
    <div>
      <PageHeader title="Salon Customers" subtitle="B2B customers, revenue and outstanding balances."
        actions={<Button onClick={() => { setEditing(null); setOpen(true); }}><Plus className="h-4 w-4" /> Add Salon</Button>} />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard icon={Store} label="Total Salons" value={num(totals.count)} />
        <StatCard icon={IndianRupee} label="Total Revenue" value={inr(totals.revenue)} accent="bg-indigo-50 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300" />
        <StatCard icon={IndianRupee} label="Outstanding" value={inr(totals.outstanding)} accent="bg-rose-50 text-rose-700 dark:bg-rose-950 dark:text-rose-300" />
      </div>

      {/* Top Status Filter */}
      <div className="mb-4 mt-6 flex flex-wrap gap-2">
        {["all", ...SALON_STATUSES].map((s) => {
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
        <DataTable data={filteredRows} columns={columns} searchPlaceholder="Search salons…" onRowClick={(row) => setDetailsSalon(row.salon)} />
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
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Customer</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Status</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Joined</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {filteredCustomers.length === 0 ? (
                <tr><td colSpan={4} className="py-10 text-center text-slate-400">No customers found.</td></tr>
              ) : (
                filteredCustomers.map((c: any) => {
                  const name = extractName(c) || "-";
                  const email = extractEmail(c) || "-";
                  const phone = extractPhone(c) || "-";
                  const salonName = getCustomerSalonName(c, salons);
                  return (
                    <tr key={c.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                      <td className="px-4 py-3">
                        <div>
                          <div className="font-medium text-slate-900 dark:text-white">
                            {name}
                            {salonName ? <span className="ml-1.5 text-xs text-slate-400"> · {salonName}</span> : null}
                          </div>
                          <div className="text-xs text-slate-400">
                            {email} · {phone}
                          </div>
                        </div>
                      </td>
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
                        {c.createdAt ? new Date(typeof c.createdAt?.toDate === "function" ? c.createdAt.toDate() : c.createdAt).toLocaleDateString("en-IN") : "-"}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() => setDetailsCustomer(c)}
                            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-900 dark:hover:bg-slate-800 dark:hover:text-white transition"
                            title="View Details"
                          >
                            <Eye className="h-4 w-4" />
                          </button>
                          <button
                            onClick={() => setEditingCustomer(c)}
                            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-900 dark:hover:bg-slate-800 dark:hover:text-white transition"
                            title="Edit Status"
                          >
                            <Pencil className="h-4 w-4" />
                          </button>
                          <button
                            onClick={() => handleDeleteCustomer(c)}
                            className="rounded-lg p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-500 dark:hover:bg-rose-950 dark:hover:text-rose-400 transition"
                            title="Delete Customer"
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

      <SalonForm open={open} onClose={() => { setOpen(false); setLocalVersion((v) => v + 1); }} editing={editing} />
      {detailsSalon && (
        <SalonDetailsModal 
          salon={detailsSalon} 
          orders={salesOrders.filter((o) => o.salonId === detailsSalon.id && o.status !== "Cancelled")} 
          onClose={() => setDetailsSalon(null)} 
        />
      )}
      {detailsCustomer && (
        <AppCustomerDetailsModal
          customer={detailsCustomer}
          salonName={getCustomerSalonName(detailsCustomer, salons)}
          onClose={() => setDetailsCustomer(null)}
        />
      )}
      {editingCustomer && (
        <EditAppCustomerModal
          customer={editingCustomer}
          onClose={() => setEditingCustomer(null)}
          onUpdated={() => setLocalVersion((v) => v + 1)}
        />
      )}
    </div>
  );
}

function AppCustomerDetailsModal({ customer, salonName, onClose }: { customer: any; salonName: string; onClose: () => void }) {
  const joinedDate = customer.createdAt ? new Date(typeof customer.createdAt?.toDate === "function" ? customer.createdAt.toDate() : customer.createdAt).toLocaleString("en-IN") : "—";
  return (
    <Modal open={!!customer} onClose={onClose} title={`App Customer Details: ${customer.name || customer.displayName || "—"}`}
      footer={<Button onClick={onClose}>Close</Button>}>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 text-sm">
        <div>
          <span className="block text-xs font-semibold uppercase tracking-wider text-slate-400">Name</span>
          <span className="font-semibold text-slate-900 dark:text-white">{customer.name || customer.displayName || "—"}</span>
        </div>
        <div>
          <span className="block text-xs font-semibold uppercase tracking-wider text-slate-400">Email</span>
          <span className="font-semibold text-slate-900 dark:text-white">{customer.email || "—"}</span>
        </div>
        <div>
          <span className="block text-xs font-semibold uppercase tracking-wider text-slate-400">Phone</span>
          <span className="font-semibold text-slate-900 dark:text-white">{customer.phone || customer.mobile || "—"}</span>
        </div>
        <div>
          <span className="block text-xs font-semibold uppercase tracking-wider text-slate-400">Salon Name</span>
          <span className="font-semibold text-slate-900 dark:text-white">{salonName || "—"}</span>
        </div>
        <div>
          <span className="block text-xs font-semibold uppercase tracking-wider text-slate-400">Status</span>
          <span className="font-semibold text-slate-900 dark:text-white capitalize">{customer.status || "active"}</span>
        </div>
        <div>
          <span className="block text-xs font-semibold uppercase tracking-wider text-slate-400">Joined</span>
          <span className="font-semibold text-slate-900 dark:text-white">{joinedDate}</span>
        </div>
        {customer.uid && (
          <div>
            <span className="block text-xs font-semibold uppercase tracking-wider text-slate-400">User UID</span>
            <span className="font-mono text-xs text-slate-500">{customer.uid}</span>
          </div>
        )}
        {Object.entries(customer).map(([key, val]) => {
          if (["id", "name", "displayName", "email", "phone", "mobile", "status", "createdAt", "uid", "salonName", "salon", "salonId"].includes(key)) return null;
          if (typeof val === "object" && val !== null) return null;
          return (
            <div key={key}>
              <span className="block text-xs font-semibold uppercase tracking-wider text-slate-400 capitalize">{key}</span>
              <span className="font-semibold text-slate-900 dark:text-white">{String(val)}</span>
            </div>
          );
        })}
      </div>
    </Modal>
  );
}

function EditAppCustomerModal({ customer, onClose, onUpdated }: { customer: any; onClose: () => void; onUpdated: () => void }) {
  const [status, setStatus] = useState(customer.status || "active");
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    try {
      if (db) {
        await updateDoc(doc(db, "users", customer.id), { status });
      } else {
        const state = useDataStore.getState() as any;
        const adminCustomers = state.adminCustomers || [];
        const next = adminCustomers.map((c: any) => c.id === customer.id ? { ...c, status } : c);
        state.setCollection("adminCustomers", next);
      }
      toast.success("Customer status updated");
      onUpdated();
      onClose();
    } catch (err: any) {
      console.error(err);
      toast.error(`Error updating status: ${err.message || err}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open={!!customer} onClose={onClose} title={`Edit Customer Status: ${customer.name || customer.displayName || ""}`}
      footer={<><Button variant="secondary" onClick={onClose} disabled={saving}>Cancel</Button><Button onClick={handleSave} disabled={saving}>{saving ? "Saving…" : "Save"}</Button></>}>
      <Field label="Status">
        <Select value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
          <option value="suspended">Suspended</option>
          <option value="pending">Pending</option>
        </Select>
      </Field>
    </Modal>
  );
}
