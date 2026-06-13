import { useMemo, useState } from "react";
import { Users, Search } from "lucide-react";
import { useDataStore } from "@/store/dataStore";
import { Button, Card, PageHeader, Input } from "@/components/ui/primitives";
import { StatusBadge } from "@/components/ui/StatusBadge";

interface AppCustomer {
  id: string;
  name?: string;
  email?: string;
  phone?: string;
  status?: string;
  createdAt?: number;
  [key: string]: any;
}

const getField = (obj: any, keys: string[]) => {
  for (const key of keys) {
    if (obj && obj[key] !== undefined && obj[key] !== null && obj[key] !== "") {
      return obj[key];
    }
  }
  return "";
};

const extractSalonName = (obj: any) => getField(obj, ["salonName", "salon", "name", "customerName", "displayName"]);
const extractOwnerName = (obj: any) => {
  const salonName = getField(obj, ["salonName", "salon"]);
  const ownerName = getField(obj, ["ownerName", "name", "displayName"]);
  if (salonName === "" && ownerName !== "") {
    return "";
  }
  return ownerName;
};
const extractPhone = (obj: any) => getField(obj, ["phone", "mobile", "phoneNumber", "customerPhone", "ownerPhone"]);
const extractEmail = (obj: any) => getField(obj, ["email", "customerEmail", "ownerEmail", "salonEmail", "userEmail"]);

const formatDate = (timestamp: number | null | undefined) => {
  if (!timestamp) return "-";
  const date = new Date(timestamp);
  return date.toLocaleDateString("en-IN");
};

export default function AppCustomersPage() {
  const [search, setSearch] = useState("");
  const adminCustomers = useDataStore((state: any) => state.adminCustomers || []);
  const customers = useMemo(() => adminCustomers, [adminCustomers]) as AppCustomer[];

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return customers;

    return customers.filter((c) => {
      const cSalonName = extractSalonName(c).toLowerCase();
      const cOwnerName = extractOwnerName(c).toLowerCase();
      const cPhone = extractPhone(c).toLowerCase();
      const cEmail = extractEmail(c).toLowerCase();
      return cSalonName.includes(q) || cOwnerName.includes(q) || cPhone.includes(q) || cEmail.includes(q);
    });
  }, [customers, search]);

  return (
    <>
      <PageHeader
        title="App Customers"
        subtitle="View all customers from admin dashboard (Read-only)"
      />

      <Card>
        <div className="p-4 border-b">
          <div className="flex items-center gap-2 px-4 py-2 bg-gray-50 rounded-lg border">
            <Search size={20} className="text-gray-400" />
            <Input
              placeholder="Search by name, email, or phone..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="border-none bg-transparent"
            />
          </div>
        </div>

        {filtered.length === 0 ? (
          <div className="p-8 text-center">
            <Users size={48} className="mx-auto text-gray-300 mb-4" />
            <p className="text-gray-500">No customers found</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Customer</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Status</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Joined</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.map((customer) => {
                  const salonName = extractSalonName(customer) || "-";
                  const ownerName = extractOwnerName(customer);
                  const email = extractEmail(customer) || "-";
                  const phone = extractPhone(customer) || "-";
                  return (
                    <tr key={customer.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4">
                        <div>
                          <div className="font-medium text-slate-900">{salonName}</div>
                          <div className="text-xs text-slate-400">
                            {ownerName ? `${ownerName} · ` : ""}{email} · {phone}
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <StatusBadge value={customer.status || "active"} />
                      </td>
                      <td className="px-6 py-4 text-slate-500">{formatDate(customer.createdAt)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <div className="mt-4 p-4 bg-blue-50 border border-blue-200 rounded-lg">
        <p className="text-sm text-blue-800">
          📌 <strong>Read-only view:</strong> These customers are managed in the admin dashboard. Changes made there will automatically appear here.
        </p>
      </div>
    </>
  );
}
