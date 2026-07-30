import { create } from "zustand";
import { Worker } from "@/types/erp";
import { db } from "@/lib/firebase";
import { ref, onValue } from "firebase/database";

interface WorkerState {
  workers: Worker[];
  isLoading: boolean;
  subscribeWorkers: () => () => void;
}

const DEFAULT_WORKERS: Worker[] = [
  { id: "wrk_1", name: "Md. Alamgir Hossain", skill: "Head Mason (Rajmistri)", dailyRate: 1100, phone: "01700111222", status: "active", tenantId: "tn_default", createdAt: Date.now() },
  { id: "wrk_2", name: "Kalam Miah", skill: "Steel Fixer / Rod Binder", dailyRate: 950, phone: "01800222333", status: "active", tenantId: "tn_default", createdAt: Date.now() },
  { id: "wrk_3", name: "Rafiqul Islam", skill: "Electrician & Wiring", dailyRate: 1000, phone: "01900333444", status: "active", tenantId: "tn_default", createdAt: Date.now() },
  { id: "wrk_4", name: "Babul Miah", skill: "General Helper / Labourer", dailyRate: 650, phone: "01600444555", status: "active", tenantId: "tn_default", createdAt: Date.now() },
];

export const useWorkerStore = create<WorkerState>((set) => ({
  workers: DEFAULT_WORKERS,
  isLoading: false,
  subscribeWorkers: () => {
    set({ isLoading: true });
    const wrkRef = ref(db, "workers");
    const unsubscribe = onValue(
      wrkRef,
      (snapshot) => {
        const val = snapshot.val();
        if (val) {
          const list: Worker[] = Object.entries(val).map(([id, data]: [string, any]) => ({
            id,
            ...data,
          }));
          set({ workers: list, isLoading: false });
        } else {
          set({ workers: DEFAULT_WORKERS, isLoading: false });
        }
      },
      () => set({ workers: DEFAULT_WORKERS, isLoading: false })
    );
    return unsubscribe;
  },
}));
