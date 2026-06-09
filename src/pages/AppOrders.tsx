import { useMemo, useState } from "react";
import { ShoppingCart, Search } from "lucide-react";
import { useDataStore } from "@/store/dataStore";
import { Button, Card, PageHeader, Input } from "@/components/ui/primitives";
import { StatusBadge } from "@/components/ui/StatusBadge";

interface AppOrder {
  id: string;
  orderId?: string;
  orderRef?: string;
  customerName?: string;
  amount?: number;
  orderStatus?: string;
  status?: string;
  createdAt?: number;
  [key: string]: any;
}

const formatDate = (timestamp: number | null | undefined) => {
  if (!timestamp) return "-";
  const date = new Date(timestamp);
  return date.toLocaleDateString("en-IN");
};

const formatCurrency = (amount: number | undefined) => {
  if (!amount) return "₹0";
  return `₹${amount.toLocaleString("en-IN")}`;
};

export default function AppOrdersPage() {
  const [search, setSearch] = useState("");
  const adminOrders = useDataStore((state: any) => state.adminOrders || []);
  const orders = useMemo(() => adminOrders, [adminOrders]) as AppOrder[];
  const stats = useMemo(() => {
    const totalOrders = orders.length;
    const totalRevenue = orders.reduce((sum: number, o: any) => sum + (Number(o.amount) || 0), 0);
    const totalCustomers = new Set(
      orders.map((o: any) => o.userId || o.uid || o.customerId)
    ).size;
    const ordersByStatus = orders.reduce((acc: any, o: any) => {
      const status = (o.orderStatus || o.status || "pending").toLowerCase();
      acc[status] = (acc[status] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
    return {
      totalOrders,
      totalRevenue,
      totalCustomers,
      ordersByStatus,
    };
  }, [orders]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return orders;

    return orders.filter((o) =>
      (o.orderId?.toLowerCase() || "").includes(q) ||
      (o.orderRef?.toLowerCase() || "").includes(q) ||
      (o.customerName?.toLowerCase() || "").includes(q)
    );
  }, [orders, search]);

  const getOrderStatus = (order: AppOrder) => {
    return order.orderStatus || order.status || "pending";
  };

  const getOrderId = (order: AppOrder) => {
    return order.orderId || order.orderRef || order.id || "-";
  };

  return (
    <>
      <PageHeader
        title="App Orders"
        subtitle="View all orders from admin dashboard (Read-only)"
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-4 mb-6">
        <Card>
          <div className="p-4">
            <p className="text-sm text-gray-500">Total Orders</p>
            <p className="text-3xl font-bold">{stats.totalOrders}</p>
          </div>
        </Card>
        <Card>
          <div className="p-4">
            <p className="text-sm text-gray-500">Total Revenue</p>
            <p className="text-2xl font-bold">{formatCurrency(stats.totalRevenue)}</p>
          </div>
        </Card>
        <Card>
          <div className="p-4">
            <p className="text-sm text-gray-500">Unique Customers</p>
            <p className="text-3xl font-bold">{stats.totalCustomers}</p>
          </div>
        </Card>
        <Card>
          <div className="p-4">
            <p className="text-sm text-gray-500">Avg Order Value</p>
            <p className="text-2xl font-bold">
              {stats.totalOrders > 0
                ? formatCurrency(stats.totalRevenue / stats.totalOrders)
                : "₹0"}
            </p>
          </div>
        </Card>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        {Object.entries(stats.ordersByStatus).map(([status, count]) => (
          <Card key={status}>
            <div className="p-4">
              <p className="text-sm text-gray-500 capitalize">{status} Orders</p>
              <p className="text-3xl font-bold">{String(count)}</p>
            </div>
          </Card>
        ))}
      </div>

      <Card>
        <div className="p-4 border-b">
          <div className="flex items-center gap-2 px-4 py-2 bg-gray-50 rounded-lg border">
            <Search size={20} className="text-gray-400" />
            <Input
              placeholder="Search by order ID, reference, or customer name..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="border-none bg-transparent"
            />
          </div>
        </div>

        {filtered.length === 0 ? (
          <div className="p-8 text-center">
            <ShoppingCart size={48} className="mx-auto text-gray-300 mb-4" />
            <p className="text-gray-500">No orders found</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-600 uppercase">Order ID</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-600 uppercase">Customer</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-600 uppercase">Amount</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-600 uppercase">Status</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-600 uppercase">Date</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {filtered.map((order) => (
                  <tr key={order.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4">
                      <span className="font-medium">{getOrderId(order)}</span>
                    </td>
                    <td className="px-6 py-4">
                      <span className="text-sm">{order.customerName || "-"}</span>
                    </td>
                    <td className="px-6 py-4 font-medium">{formatCurrency(order.amount)}</td>
                    <td className="px-6 py-4">
                      <StatusBadge value={getOrderStatus(order)} />
                    </td>
                    <td className="px-6 py-4 text-sm">{formatDate(order.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <div className="mt-4 p-4 bg-blue-50 border border-blue-200 rounded-lg">
        <p className="text-sm text-blue-800">
          📌 <strong>Read-only view:</strong> These orders are managed in the admin dashboard. Changes made there will automatically appear here.
        </p>
      </div>
    </>
  );
}
