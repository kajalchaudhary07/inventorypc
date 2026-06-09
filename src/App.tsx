import { Suspense, lazy, useEffect, useState } from "react";
import { BrowserRouter, Route, Routes, Navigate } from "react-router-dom";
import { onAuthStateChanged, signOut } from "firebase/auth";
import { Toaster } from "react-hot-toast";
import { auth, isFirebaseConfigured } from "@/lib/firebase";
import { useAuthStore } from "@/store/authStore";
import { useUIStore } from "@/store/uiStore";
import { initData } from "@/services/data";
import { ErrorBoundary } from "@/components/ui/ErrorBoundary";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Skeleton } from "@/components/ui/primitives";
import Login from "@/pages/Login";

const DashboardHome = lazy(() => import("@/pages/DashboardHome"));
const Products = lazy(() => import("@/pages/Products"));
const ProductDetails = lazy(() => import("@/pages/ProductDetails"));
const AppProducts = lazy(() => import("@/pages/AppProducts"));
const AppCustomers = lazy(() => import("@/pages/AppCustomers"));
const AppOrders = lazy(() => import("@/pages/AppOrders"));
const ItemGroups = lazy(() => import("@/pages/ItemGroups"));
const StockManagement = lazy(() => import("@/pages/StockManagement"));
const PurchaseOrders = lazy(() => import("@/pages/PurchaseOrders"));
const SalesOrders = lazy(() => import("@/pages/SalesOrders"));
const OrderDetails = lazy(() => import("@/pages/OrderDetails"));
const ManualOrderEntry = lazy(() => import("@/pages/ManualOrderEntry"));
const Salons = lazy(() => import("@/pages/Salons"));
const Vendors = lazy(() => import("@/pages/Vendors"));
const Analytics = lazy(() => import("@/pages/Analytics"));
const BusinessIntelligence = lazy(() => import("@/pages/BusinessIntelligence"));
const ActivityLogs = lazy(() => import("@/pages/ActivityLogs"));
const Settings = lazy(() => import("@/pages/Settings"));

function PageSkeleton() {
  return (
    <div className="space-y-4 p-6">
      <Skeleton className="h-8 w-64" />
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24" />)}
      </div>
      <Skeleton className="h-72" />
    </div>
  );
}

export default function App() {
  const theme = useUIStore((s) => s.theme);
  const { user, ready, setUser, setReady } = useAuthStore();
  const [isAdmin, setIsAdmin] = useState(!isFirebaseConfigured);

  // Apply theme to <html>
  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
  }, [theme]);

  // Auth
  useEffect(() => {
    if (!isFirebaseConfigured || !auth) {
      setReady(true);
      return;
    }
    return onAuthStateChanged(auth, async (u) => {
      if (!u) {
        setUser(null);
        setIsAdmin(false);
        setReady(true);
        return;
      }
      
      // Check Firebase Custom Claims for admin role
      try {
        const tokenResult = await u.getIdTokenResult(true);
        const isAdminUser = tokenResult.claims.admin === true || tokenResult.claims.superAdmin === true;
        setIsAdmin(isAdminUser);
      } catch {
        setIsAdmin(false);
      }
      
      setUser({ uid: u.uid, email: u.email ?? "" });
      setReady(true);
    });
  }, [setReady, setUser]);

  // Data: demo seeds immediately; live attaches listeners once authorized.
  useEffect(() => {
    if (!isFirebaseConfigured) return initData();
    if (user && isAdmin) return initData();
  }, [user, isAdmin]);

  if (!ready) {
    return <div className="grid min-h-screen place-items-center bg-slate-900 text-slate-300">Loading…</div>;
  }

  if (!user) return <Login />;

  if (isFirebaseConfigured && !isAdmin) {
    return (
      <div className="grid min-h-screen place-items-center bg-slate-900 px-4 text-center">
        <div className="max-w-sm rounded-2xl bg-white p-8 shadow-2xl">
          <h1 className="text-lg font-bold text-slate-900">Access denied</h1>
          <p className="mt-2 text-sm text-slate-500">
            Your account is signed in, but does not have admin permissions. Ask a super admin to grant the admin role, then sign out and sign in again.
          </p>
          <button onClick={() => auth && signOut(auth)} className="mt-5 w-full rounded-lg bg-slate-900 py-2.5 text-sm font-semibold text-white">
            Sign out
          </button>
        </div>
      </div>
    );
  }

  return (
    <ErrorBoundary>
      <BrowserRouter>
        <Toaster position="top-right" toastOptions={{ style: { fontSize: 14 } }} />
        <Suspense fallback={<PageSkeleton />}>
          <Routes>
            <Route element={<DashboardLayout />}>
              <Route index element={<DashboardHome />} />
              <Route path="app-products" element={<AppProducts />} />
              <Route path="app-customers" element={<AppCustomers />} />
              <Route path="app-orders" element={<AppOrders />} />
              <Route path="products" element={<Navigate to="/app-products" replace />} />
              <Route path="products/:id" element={<ProductDetails />} />
              <Route path="item-groups" element={<ItemGroups />} />
              <Route path="stock" element={<StockManagement />} />
              <Route path="purchase-orders" element={<PurchaseOrders />} />
              <Route path="sales-orders" element={<SalesOrders />} />
              <Route path="orders/:id" element={<OrderDetails />} />
              <Route path="new-order" element={<ManualOrderEntry />} />
              <Route path="salons" element={<Salons />} />
              <Route path="vendors" element={<Vendors />} />
              <Route path="analytics" element={<Analytics />} />
              <Route path="business-intelligence" element={<BusinessIntelligence />} />
              <Route path="activity" element={<ActivityLogs />} />
              <Route path="settings" element={<Settings />} />
            </Route>
          </Routes>
        </Suspense>
      </BrowserRouter>
    </ErrorBoundary>
  );
}
