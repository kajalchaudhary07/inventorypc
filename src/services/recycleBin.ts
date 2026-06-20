import { db } from "@/lib/firebase";
import { deleteDoc, doc, setDoc } from "firebase/firestore";
import { useDataStore } from "@/store/dataStore";

export interface BinItem {
  id: string;
  type: "salon" | "app_customer" | "vendor" | "sales_order";
  name: string;
  deletedAt: number;
  data: any;
}

export const getBinItems = (): BinItem[] => {
  try {
    const val = localStorage.getItem("pc_recycle_bin");
    return val ? JSON.parse(val) : [];
  } catch {
    return [];
  }
};

export const saveBinItems = (items: BinItem[]) => {
  try {
    localStorage.setItem("pc_recycle_bin", JSON.stringify(items));
  } catch (err) {
    console.error("Error saving bin items:", err);
  }
};

export const pruneBinItems = () => {
  const items = getBinItems();
  const now = Date.now();
  const thirtyDays = 30 * 24 * 60 * 60 * 1000;
  const filtered = items.filter((item) => now - item.deletedAt <= thirtyDays);
  if (filtered.length !== items.length) {
    saveBinItems(filtered);
  }
};

export const deleteToBin = async (
  type: BinItem["type"],
  id: string,
  name: string,
  data: any,
  collectionName: string
) => {
  // 1. Add to localStorage bin
  const items = getBinItems();
  const newItem: BinItem = {
    id,
    type,
    name,
    deletedAt: Date.now(),
    data,
  };
  saveBinItems([newItem, ...items]);

  // 2. Delete from Firestore if db is configured
  if (db) {
    await deleteDoc(doc(db, collectionName, id));
    // If it's a sales order, also try to delete from "orders" collection (app orders)
    if (type === "sales_order") {
      try {
        await deleteDoc(doc(db, "orders", id));
      } catch (e) {
        // ignore
      }
    }
  }

  // 3. Always remove from local Zustand state
  const state = useDataStore.getState() as any;
  const cur = state[collectionName] || [];
  state.setCollection(collectionName as any, cur.filter((x: any) => x.id !== id));

  // If it's an app customer, we also need to filter it from adminCustomers in store
  if (type === "app_customer") {
    const adminCustomers = state.adminCustomers || [];
    state.setCollection("adminCustomers", adminCustomers.filter((x: any) => x.id !== id));
  }
  // If it's a sales order, we also need to filter it from adminOrders in store
  if (type === "sales_order") {
    const adminOrders = state.adminOrders || [];
    state.setCollection("adminOrders", adminOrders.filter((x: any) => x.id !== id));
  }
};

export const restoreFromBin = async (item: BinItem) => {
  const collectionMap: Record<BinItem["type"], string> = {
    salon: "salons",
    app_customer: "users",
    vendor: "vendors",
    sales_order: "salesOrders",
  };
  const collectionName = collectionMap[item.type];

  // 1. Restore in Firestore if db is configured
  if (db) {
    await setDoc(doc(db, collectionName, item.id), item.data);
    // If it's a sales order, also restore to "orders"
    if (item.type === "sales_order" && (item.id.startsWith("PC-") || item.data.channel === "app")) {
      try {
        await setDoc(doc(db, "orders", item.id), item.data);
      } catch (e) {
        console.warn("Failed to restore to orders collection:", e);
      }
    }
  }

  // 2. Restore in local Zustand store
  const state = useDataStore.getState() as any;
  const cur = state[collectionName] || [];
  if (!cur.some((x: any) => x.id === item.id)) {
    const next = [item.data, ...cur];
    state.setCollection(collectionName as any, next);
  }

  // Handle adminCustomers and adminOrders stores too
  if (item.type === "app_customer") {
    const adminCustomers = state.adminCustomers || [];
    if (!adminCustomers.some((x: any) => x.id === item.id)) {
      state.setCollection("adminCustomers", [item.data, ...adminCustomers]);
    }
  }
  if (item.type === "sales_order") {
    const adminOrders = state.adminOrders || [];
    if (!adminOrders.some((x: any) => x.id === item.id)) {
      state.setCollection("adminOrders", [item.data, ...adminOrders]);
    }
  }

  // 3. Remove from localStorage bin
  const items = getBinItems();
  saveBinItems(items.filter((x) => !(x.id === item.id && x.type === item.type)));
};

export const deletePermanently = (id: string, type: BinItem["type"]) => {
  const items = getBinItems();
  saveBinItems(items.filter((x) => !(x.id === id && x.type === type)));
};
