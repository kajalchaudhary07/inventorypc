import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Menu, Moon, Sun, Search, LogOut, AlertTriangle, XCircle } from "lucide-react";
import { useUIStore } from "@/store/uiStore";
import { useAuthStore } from "@/store/authStore";
import { useDataStore } from "@/store/dataStore";
import { isFirebaseConfigured, auth } from "@/lib/firebase";
import { signOut } from "firebase/auth";
import { available, isLow, isOut } from "@/lib/calc";
import { getMergedProducts } from "@/services/productOverrides";

export function Topbar() {
  const navigate = useNavigate();
  const { toggleSidebar, toggleTheme, theme } = useUIStore();
  const user = useAuthStore((s) => s.user);
  const { products: invProducts } = useDataStore();
  const adminProducts = useDataStore((s) => (s as any).adminProducts || []);
  const inventoryProducts = useDataStore((s) => (s as any).inventoryProducts || []);

  const products = useMemo(() => {
    const map = new Map<string, any>();
    (invProducts || []).forEach((p: any) => map.set(p.id, p));
    const mergedAdmin = getMergedProducts(adminProducts);
    mergedAdmin.forEach((p: any) => map.set(p.id, p));
    (inventoryProducts || []).forEach((p: any) => map.set(p.id, p));
    return Array.from(map.values());
  }, [invProducts, adminProducts, inventoryProducts]);

  const active = products.filter((p: any) => p.status !== "archived");
  const lowCount = active.filter((p: any) => isLow(p)).length;
  const outCount = active.filter((p: any) => isOut(p)).length;

  const handleSignOut = async () => {
    if (isFirebaseConfigured && auth) await signOut(auth);
    else useAuthStore.getState().setUser(null);
  };

  return (
    <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-slate-200 bg-white/90 px-4 backdrop-blur dark:border-slate-800 dark:bg-slate-900/90">
      <button onClick={toggleSidebar} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800">
        <Menu className="h-5 w-5" />
      </button>

      <div className="relative hidden max-w-sm flex-1 sm:block">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <input
          onFocus={() => navigate("/app-products")}
          placeholder="Search products, orders, salons…"
          className="w-full rounded-lg border border-slate-200 bg-slate-50 py-1.5 pl-9 pr-3 text-sm outline-none focus:bg-white dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
        />
      </div>

      <div className="ml-auto flex items-center gap-2">
        {!isFirebaseConfigured && (
          <span className="hidden items-center gap-1.5 rounded-full bg-amber-50 px-3 py-1 text-xs font-medium text-amber-700 ring-1 ring-inset ring-amber-200 dark:bg-amber-950 dark:text-amber-300 dark:ring-amber-900 lg:inline-flex">
            <AlertTriangle className="h-3.5 w-3.5" /> Demo mode — add Firebase env to go live
          </span>
        )}
        {lowCount > 0 && (
          <button
            onClick={() => {
              const params = new URLSearchParams(window.location.search);
              if (window.location.pathname === "/app-products" && params.get("stock") === "low") {
                navigate("/app-products");
              } else {
                navigate("/app-products?stock=low");
              }
            }}
            title="View low stock products"
            className="hidden items-center gap-1.5 rounded-full bg-amber-50 px-3 py-1 text-xs font-medium text-amber-700 ring-1 ring-inset ring-amber-200 transition hover:bg-amber-100 dark:bg-amber-950 dark:text-amber-300 dark:ring-amber-900 dark:hover:bg-amber-900 sm:inline-flex"
          >
            <AlertTriangle className="h-3.5 w-3.5" /> {lowCount} low stock
          </button>
        )}
        {outCount > 0 && (
          <button
            onClick={() => {
              const params = new URLSearchParams(window.location.search);
              if (window.location.pathname === "/app-products" && params.get("stock") === "out") {
                navigate("/app-products");
              } else {
                navigate("/app-products?stock=out");
              }
            }}
            title="View out of stock products"
            className="hidden items-center gap-1.5 rounded-full bg-rose-50 px-3 py-1 text-xs font-medium text-rose-700 ring-1 ring-inset ring-rose-200 transition hover:bg-rose-100 dark:bg-rose-950 dark:text-rose-300 dark:ring-rose-900 dark:hover:bg-rose-900 sm:inline-flex"
          >
            <XCircle className="h-3.5 w-3.5" /> {outCount} out of stock
          </button>
        )}
        <button onClick={toggleTheme} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800">
          {theme === "light" ? <Moon className="h-5 w-5" /> : <Sun className="h-5 w-5" />}
        </button>
        <div className="hidden text-right sm:block">
          <div className="text-xs font-semibold text-slate-700 dark:text-slate-200">{user?.email}</div>
          <div className="text-[10px] text-slate-400">Super Admin</div>
        </div>
        <div className="grid h-8 w-8 place-items-center rounded-full bg-slate-900 text-xs font-bold uppercase text-white dark:bg-white dark:text-slate-900">
          {(user?.email || "SA").slice(0, 2)}
        </div>
        <button onClick={handleSignOut} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800" title="Sign out">
          <LogOut className="h-5 w-5" />
        </button>
      </div>
    </header>
  );
}
