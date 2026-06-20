import { db } from "@/lib/firebase";
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  setDoc,
  updateDoc,
  where,
  serverTimestamp,
} from "firebase/firestore";
import { useDataStore } from "@/store/dataStore";

export interface BinItem {
  id: string;
  type: "salon" | "app_customer" | "vendor" | "sales_order" | "product" | "inventory_product";
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

// Fetch soft-deleted items directly from Firestore
export const fetchDbBinItems = async (): Promise<BinItem[]> => {
  if (!db) return [];
  const binItems: BinItem[] = [];
  const collectionsList: { type: BinItem["type"]; name: string; labelField: string }[] = [
    { type: "salon", name: "salons", labelField: "name" },
    { type: "app_customer", name: "users", labelField: "name" },
    { type: "vendor", name: "vendors", labelField: "name" },
    { type: "sales_order", name: "salesOrders", labelField: "orderNo" },
    { type: "product", name: "products", labelField: "name" },
    { type: "inventory_product", name: "inventoryProducts", labelField: "name" },
  ];

  for (const col of collectionsList) {
    try {
      const q = query(collection(db, col.name), where("isDeleted", "==", true));
      const snap = await getDocs(q);
      snap.forEach((doc) => {
        const data = doc.data();
        let deletedAtMs = Date.now();
        if (data.deletedAt) {
          if (typeof data.deletedAt.toDate === "function") {
            deletedAtMs = data.deletedAt.toDate().getTime();
          } else if (data.deletedAt.seconds) {
            deletedAtMs = data.deletedAt.seconds * 1000;
          } else if (typeof data.deletedAt === "number") {
            deletedAtMs = data.deletedAt;
          }
        }
        let name = data[col.labelField] || data.displayName || data.email || doc.id;
        if (col.type === "sales_order" && !data[col.labelField]) {
          const adminOrders = (useDataStore.getState() as any).adminOrders || [];
          const found = adminOrders.find((x: any) => x.id === doc.id);
          if (found) {
            name = found.orderNo || found.orderId || found.id;
          }
        }
        binItems.push({
          id: doc.id,
          type: col.type,
          name,
          deletedAt: deletedAtMs,
          data: { id: doc.id, ...data },
        });
      });
    } catch (err) {
      console.warn(`Failed to fetch soft-deleted items from collection ${col.name}:`, err);
    }
  }
  return binItems;
};

export const deleteToBin = async (
  type: BinItem["type"],
  id: string,
  name: string,
  data: any,
  collectionName: string
) => {
  // 1. Add to localStorage bin for local/offline fallback
  const items = getBinItems();
  const newItem: BinItem = {
    id,
    type,
    name,
    deletedAt: Date.now(),
    data: { ...data, isDeleted: true, deletedAt: Date.now() },
  };
  saveBinItems([newItem, ...items]);

  // 2. Soft-delete from Firestore by setting isDeleted flag
  if (db) {
    try {
      if (type === "sales_order") {
        await setDoc(doc(db, "salesOrders", id), {
          isDeleted: true,
          deletedAt: serverTimestamp(),
        }, { merge: true });
      } else {
        await updateDoc(doc(db, collectionName, id), {
          isDeleted: true,
          deletedAt: serverTimestamp(),
        });
      }
    } catch (err) {
      console.warn(`Failed to soft-delete on ${collectionName}:`, err);
    }
  }

  // 3. Always update local Zustand state
  const state = useDataStore.getState() as any;
  if (type === "sales_order") {
    const cur = state.salesOrders || [];
    const exists = cur.some((x: any) => x.id === id);
    const next = exists
      ? cur.map((x: any) => x.id === id ? { ...x, isDeleted: true, deletedAt: Date.now() } : x)
      : [{ id, isDeleted: true, deletedAt: Date.now() }, ...cur];
    state.setCollection("salesOrders", next);
  } else {
    const cur = state[collectionName] || [];
    state.setCollection(collectionName as any, cur.filter((x: any) => x.id !== id));

    if (type === "app_customer") {
      const adminCustomers = state.adminCustomers || [];
      state.setCollection("adminCustomers", adminCustomers.filter((x: any) => x.id !== id));
    }
  }
};

export const restoreFromBin = async (item: BinItem) => {
  const collectionMap: Record<BinItem["type"], string> = {
    salon: "salons",
    app_customer: "users",
    vendor: "vendors",
    sales_order: "salesOrders",
    product: "products",
    inventory_product: "inventoryProducts",
  };
  const collectionName = collectionMap[item.type];

  // 1. Restore in Firestore if db is configured (remove isDeleted flag)
  if (db) {
    try {
      await updateDoc(doc(db, collectionName, item.id), {
        isDeleted: false,
        deletedAt: null,
      });
    } catch {
      // Document might have been hard-deleted before, restore it completely with full data
      await setDoc(doc(db, collectionName, item.id), {
        ...item.data,
        isDeleted: false,
        deletedAt: null,
      }, { merge: true });
    }
  }

  // 2. Restore in local Zustand store
  const state = useDataStore.getState() as any;
  if (item.type === "sales_order") {
    const salesOrders = state.salesOrders || [];
    const next = salesOrders.map((x: any) =>
      x.id === item.id ? { ...x, isDeleted: false, deletedAt: null } : x
    );
    state.setCollection("salesOrders", next);
  } else {
    const cur = state[collectionName] || [];
    const restoredData = { ...item.data, isDeleted: false, deletedAt: null };
    if (!cur.some((x: any) => x.id === item.id)) {
      const next = [restoredData, ...cur];
      state.setCollection(collectionName as any, next);
    }

    if (item.type === "app_customer") {
      const adminCustomers = state.adminCustomers || [];
      if (!adminCustomers.some((x: any) => x.id === item.id)) {
        state.setCollection("adminCustomers", [restoredData, ...adminCustomers]);
      }
    }
  }

  // 3. Remove from localStorage bin
  const items = getBinItems();
  saveBinItems(items.filter((x) => !(x.id === item.id && x.type === item.type)));
};

export const deletePermanently = async (id: string, type: BinItem["type"]) => {
  const collectionMap: Record<BinItem["type"], string> = {
    salon: "salons",
    app_customer: "users",
    vendor: "vendors",
    sales_order: "salesOrders",
    product: "products",
    inventory_product: "inventoryProducts",
  };
  const collectionName = collectionMap[type];

  let isHardDelete = false;

  // 1. Permanently delete from Firestore if db is configured
  if (db) {
    try {
      if (type === "sales_order") {
        const state = useDataStore.getState() as any;
        const salesOrders = state.salesOrders || [];
        const currentOrder = salesOrders.find((x: any) => x.id === id);

        const channel = currentOrder?.channel || currentOrder?.source || "manual";
        const isManual = channel === "manual" || channel === "phone" || channel === "whatsapp" || String(currentOrder?.orderNo || id || "").startsWith("SO-");

        const orderDoc = await getDoc(doc(db, "orders", id));
        const originalExists = orderDoc.exists();

        if (!isManual && !originalExists) {
          await deleteDoc(doc(db, "salesOrders", id));
          isHardDelete = true;
        } else {
          try {
            await updateDoc(doc(db, "salesOrders", id), {
              isPermanentlyDeleted: true,
              isDeleted: false,
            });
          } catch {
            await setDoc(
              doc(db, "salesOrders", id),
              { isPermanentlyDeleted: true, isDeleted: false },
              { merge: true }
            );
          }
        }
      } else {
        await deleteDoc(doc(db, collectionName, id));
        isHardDelete = true;
      }
    } catch (e) {
      console.warn(`Failed to permanently delete on ${collectionName}:`, e);
    }
  } else {
    // offline mode/no DB fallback
    if (type === "sales_order") {
      const state = useDataStore.getState() as any;
      const salesOrders = state.salesOrders || [];
      const currentOrder = salesOrders.find((x: any) => x.id === id);
      const channel = currentOrder?.channel || currentOrder?.source || "manual";
      const isManual = channel === "manual" || channel === "phone" || channel === "whatsapp" || String(currentOrder?.orderNo || id || "").startsWith("SO-");
      
      const adminOrders = state.adminOrders || [];
      const originalExists = adminOrders.some((x: any) => x.id === id);
      if (!isManual && !originalExists) {
        isHardDelete = true;
      }
    } else {
      isHardDelete = true;
    }
  }

  // Also update local store for sales orders
  const state = useDataStore.getState() as any;
  if (type === "sales_order") {
    const cur = state.salesOrders || [];
    if (isHardDelete) {
      state.setCollection("salesOrders", cur.filter((x: any) => x.id !== id));
    } else {
      const exists = cur.some((x: any) => x.id === id);
      const next = exists
        ? cur.map((x: any) => x.id === id ? { ...x, isPermanentlyDeleted: true, isDeleted: false } : x)
        : [{ id, isPermanentlyDeleted: true, isDeleted: false }, ...cur];
      state.setCollection("salesOrders", next);
    }
  }

  // 2. Remove from localStorage bin
  const items = getBinItems();
  saveBinItems(items.filter((x) => !(x.id === id && x.type === type)));
};
