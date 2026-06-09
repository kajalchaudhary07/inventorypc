import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { AppSettings } from "@/types";

interface UIState {
  theme: "light" | "dark";
  sidebarOpen: boolean;
  settings: AppSettings;
  toggleTheme: () => void;
  toggleSidebar: () => void;
  setSettings: (s: Partial<AppSettings>) => void;
}

const defaultSettings: AppSettings = {
  companyName: "PureCuts Technologies Pvt. Ltd.",
  companyAddress: "Domkhel Road, Wagholi, A building, GHRCEM",
  companyCity: "Pune 412207",
  companyState: "Maharashtra MH, India",
  companyPhone: "09579177826",
  companyEmail: "purecuts.in@gmail.com",
  companyWebsite: "http://www.purecuts.in",
  companyGstin: "",
  defaultGst: 18,
  invoicePrefix: "PC",
  currencySymbol: "₹",
  enableBarcode: true,
  lowStockNotifications: true,
  expiryAlerts: true,
};

export const useUIStore = create<UIState>()(
  persist(
    (set) => ({
      theme: "light",
      sidebarOpen: true,
      settings: defaultSettings,
      toggleTheme: () => set((s) => ({ theme: s.theme === "light" ? "dark" : "light" })),
      toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),
      setSettings: (p) => set((s) => ({ settings: { ...s.settings, ...p } })),
    }),
    {
      name: "salon-inventory-ui",
      version: 2,
      // Backfill any settings keys added after a user first persisted state,
      // so new company/invoice fields aren't undefined for existing users.
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<UIState>;
        return {
          ...current,
          ...p,
          settings: { ...current.settings, ...(p.settings ?? {}) },
        };
      },
    }
  )
);
