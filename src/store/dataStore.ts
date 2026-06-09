import { create } from "zustand";
import { isFirebaseConfigured } from "@/lib/firebase";
import type {
  ActivityLog,
  ItemGroup,
  Product,
  PurchaseOrder,
  Salon,
  SalesOrder,
  StockMovement,
  Vendor,
} from "@/types";
import {
  seedActivityLogs,
  seedItemGroups,
  seedProducts,
  seedPurchaseOrders,
  seedSalesOrders,
  seedSalons,
  seedStockMovements,
  seedVendors,
} from "@/lib/seed";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyRecord = Record<string, any>;

interface DataState {
  // Inventory-specific collections
  products: Product[];
  itemGroups: ItemGroup[];
  salons: Salon[];
  vendors: Vendor[];
  stockMovements: StockMovement[];
  purchaseOrders: PurchaseOrder[];
  salesOrders: SalesOrder[];
  activityLogs: ActivityLog[];
  // Admin dashboard collections (read-only)
  adminProducts: AnyRecord[];
  adminCustomers: AnyRecord[];
  adminOrders: AnyRecord[];
  // Inventory-only products (manual products - never shown in Flutter app)
  inventoryProducts: AnyRecord[];
  loaded: boolean;
  setCollection: <K extends keyof DataState>(key: K, value: DataState[K]) => void;
  loadSeed: () => void;
}

export const useDataStore = create<DataState>((set) => ({
  products: [],
  itemGroups: [],
  salons: [],
  vendors: [],
  stockMovements: [],
  purchaseOrders: [],
  salesOrders: [],
  activityLogs: [],
  adminProducts: [],
  adminCustomers: [],
  adminOrders: [],
  inventoryProducts: [],
  loaded: false,
  setCollection: (key, value) => {
    set({ [key]: value } as Partial<DataState>);
    // Save to localStorage if Firebase is not configured
    if (!isFirebaseConfigured) {
      try {
        localStorage.setItem(`pc_inv_${String(key)}`, JSON.stringify(value));
      } catch (err) {
        console.error(`Error saving ${String(key)} to localStorage:`, err);
      }
    }
  },
  loadSeed: () => {
    const getLocal = <T>(key: string, fallback: T): T => {
      try {
        const val = localStorage.getItem(`pc_inv_${key}`);
        return val ? JSON.parse(val) : fallback;
      } catch {
        return fallback;
      }
    };

    set({
      products: getLocal("products", seedProducts),
      itemGroups: getLocal("itemGroups", seedItemGroups),
      salons: getLocal("salons", seedSalons),
      vendors: getLocal("vendors", seedVendors),
      stockMovements: getLocal("stockMovements", seedStockMovements),
      purchaseOrders: getLocal("purchaseOrders", seedPurchaseOrders),
      salesOrders: getLocal("salesOrders", seedSalesOrders),
      activityLogs: getLocal("activityLogs", seedActivityLogs),
      inventoryProducts: getLocal("inventoryProducts", []),
      adminProducts: getLocal("adminProducts", seedProducts),
      adminCustomers: getLocal("adminCustomers", []),
      adminOrders: getLocal("adminOrders", []),
      loaded: true,
    });
  },
}));
