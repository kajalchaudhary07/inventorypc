import { create } from "zustand";
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
  setCollection: (key, value) => set({ [key]: value } as Partial<DataState>),
  loadSeed: () =>
    set({
      products: seedProducts,
      itemGroups: seedItemGroups,
      salons: seedSalons,
      vendors: seedVendors,
      stockMovements: seedStockMovements,
      purchaseOrders: seedPurchaseOrders,
      salesOrders: seedSalesOrders,
      activityLogs: seedActivityLogs,
      loaded: true,
    }),
}));
