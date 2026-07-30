import { create } from "zustand";
import { InventoryItem } from "@/types/erp";
import { db } from "@/lib/firebase";
import { ref, onValue } from "firebase/database";

interface InventoryState {
  items: InventoryItem[];
  isLoading: boolean;
  subscribeInventory: () => () => void;
}

const DEFAULT_ITEMS: InventoryItem[] = [
  {
    id: "inv_1",
    code: "MAT-CEM-001",
    name: "Portland Composite Cement (50kg bag)",
    category: "Cement",
    unit: "Bag",
    quantity: 1250,
    unitPrice: 540,
    reorderLevel: 200,
    tenantId: "tn_default",
    updatedAt: Date.now(),
  },
  {
    id: "inv_2",
    code: "MAT-STL-500W",
    name: "500W Deformed Steel Rebar (16mm)",
    category: "Steel & Rebar",
    unit: "Ton",
    quantity: 48,
    unitPrice: 96000,
    reorderLevel: 10,
    tenantId: "tn_default",
    updatedAt: Date.now(),
  },
  {
    id: "inv_3",
    code: "MAT-SAN-F25",
    name: "Coarse Sylhet Sand (FM 2.5)",
    category: "Aggregates",
    unit: "CFT",
    quantity: 8500,
    unitPrice: 65,
    reorderLevel: 1000,
    tenantId: "tn_default",
    updatedAt: Date.now(),
  },
  {
    id: "inv_4",
    code: "MAT-BRK-AUTO",
    name: "1st Class Auto Bricks",
    category: "Masonry",
    unit: "Pcs",
    quantity: 35000,
    unitPrice: 13.5,
    reorderLevel: 5000,
    tenantId: "tn_default",
    updatedAt: Date.now(),
  },
];

export const useInventoryStore = create<InventoryState>((set) => ({
  items: DEFAULT_ITEMS,
  isLoading: false,
  subscribeInventory: () => {
    set({ isLoading: true });
    const invRef = ref(db, "inventory");

    const unsubscribe = onValue(
      invRef,
      (snapshot) => {
        const val = snapshot.val();
        if (val) {
          const list: InventoryItem[] = Object.entries(val).map(([id, data]: [string, any]) => ({
            id,
            ...data,
          }));
          set({ items: list, isLoading: false });
        } else {
          set({ items: DEFAULT_ITEMS, isLoading: false });
        }
      },
      () => set({ items: DEFAULT_ITEMS, isLoading: false })
    );

    return unsubscribe;
  },
}));
