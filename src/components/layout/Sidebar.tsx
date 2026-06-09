import { NavLink } from "react-router-dom";
import {
  LayoutDashboard,
  Package,
  Layers,
  Boxes,
  Warehouse,
  ShoppingCart,
  Truck,
  ClipboardList,
  Store,
  Users,
  BarChart3,
  TrendingUp,
  ScrollText,
  Settings as SettingsIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useUIStore } from "@/store/uiStore";

const NAV = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard, end: true },
  
  // PRIMARY SECTION - Admin Dashboard (Read-only)
  { section: "App Management" },
  { to: "/app-products", label: "Products", icon: Package },
  
  // SECONDARY SECTION - Inventory Operations
  { section: "Inventory Operations" },
  { to: "/item-groups", label: "Item Groups", icon: Layers },
  { to: "/stock", label: "Stock Management", icon: Warehouse },
  { to: "/purchase-orders", label: "Purchase Orders", icon: Truck },
  { to: "/sales-orders", label: "Sales Orders", icon: ShoppingCart },
  { to: "/new-order", label: "Manual Order", icon: ClipboardList },
  { to: "/salons", label: "Salon Customers", icon: Store },
  { to: "/vendors", label: "Vendors", icon: Users },
  
  // ANALYTICS & SETTINGS
  { section: "Analytics & Settings" },
  { to: "/analytics", label: "Analytics", icon: BarChart3 },
  { to: "/business-intelligence", label: "Business Intelligence", icon: TrendingUp },
  { to: "/activity", label: "Activity Logs", icon: ScrollText },
  { to: "/settings", label: "Settings", icon: SettingsIcon },
];

export function Sidebar() {
  const sidebarOpen = useUIStore((s) => s.sidebarOpen);
  return (
    <aside
      className={cn(
        "hidden shrink-0 flex-col border-r border-slate-200 bg-white transition-all dark:border-slate-800 dark:bg-slate-900 md:flex",
        sidebarOpen ? "w-60" : "w-16"
      )}
    >
      <div className="flex h-14 items-center gap-2.5 px-4">
        <div className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-slate-900 text-white dark:bg-white dark:text-slate-900">
          <Boxes className="h-5 w-5" />
        </div>
        {sidebarOpen && (
          <div className="min-w-0">
            <div className="truncate text-sm font-bold text-slate-900 dark:text-white">Salon Inventory</div>
            <div className="text-[10px] uppercase tracking-wider text-slate-400">Admin Console</div>
          </div>
        )}
      </div>
      <nav className="flex-1 space-y-0.5 overflow-y-auto p-2">
        {NAV.map((n) => {
          // Handle section headers
          if ("section" in n) {
            return sidebarOpen ? (
              <div key={n.section} className="px-3 py-2 mt-4 first:mt-0">
                <p className="text-xs uppercase font-semibold tracking-wide text-slate-500 dark:text-slate-400">{n.section}</p>
              </div>
            ) : null;
          }

          // Handle navigation links
          return (
            <NavLink
              key={n.to}
              to={n.to}
              end={n.end}
              className={({ isActive }) =>
                cn(
                  "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition",
                  isActive
                    ? "bg-slate-900 text-white dark:bg-white dark:text-slate-900"
                    : "text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
                )
              }
            >
              <n.icon className="h-5 w-5 shrink-0" />
              {sidebarOpen && <span className="truncate">{n.label}</span>}
            </NavLink>
          );
        })}
      </nav>
    </aside>
  );
}
