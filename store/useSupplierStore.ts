import { create } from "zustand";
import { Supplier } from "@/types/erp";
import { db } from "@/lib/firebase";
import { ref, onValue } from "firebase/database";

interface SupplierState {
  suppliers: Supplier[];
  isLoading: boolean;
  subscribeSuppliers: () => () => void;
}

const DEFAULT_SUPPLIERS: Supplier[] = [
  {
    id: "sup_1",
    name: "Shah Cement Industries Ltd.",
    category: "Cement",
    phone: "+880 1711-000111",
    address: "Gulshan-1, Dhaka",
    outstandingBalance: 650000,
    tenantId: "tn_default",
    createdAt: Date.now(),
  },
  {
    id: "sup_2",
    name: "BSRM Steels & Rebars",
    category: "Steel & Rebar",
    phone: "+880 1819-222333",
    address: "Chittagong / Tejgaon Dhaka",
    outstandingBalance: 1450000,
    tenantId: "tn_default",
    createdAt: Date.now(),
  },
  {
    id: "sup_3",
    name: "Bengal Bricks & Aggregates",
    category: "Masonry & Sand",
    phone: "+880 1912-444555",
    address: "Savar, Dhaka",
    outstandingBalance: 240000,
    tenantId: "tn_default",
    createdAt: Date.now(),
  },
];

export const useSupplierStore = create<SupplierState>((set) => ({
  suppliers: DEFAULT_SUPPLIERS,
  isLoading: false,
  subscribeSuppliers: () => {
    set({ isLoading: true });
    const supRef = ref(db, "suppliers");
    const unsubscribe = onValue(
      supRef,
      (snapshot) => {
        const val = snapshot.val();
        if (val) {
          const list: Supplier[] = Object.entries(val).map(([id, data]: [string, any]) => ({
            id,
            ...data,
          }));
          set({ suppliers: list, isLoading: false });
        } else {
          set({ suppliers: DEFAULT_SUPPLIERS, isLoading: false });
        }
      },
      () => set({ suppliers: DEFAULT_SUPPLIERS, isLoading: false })
    );
    return unsubscribe;
  },
}));
