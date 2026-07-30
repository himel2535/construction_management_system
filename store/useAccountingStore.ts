import { create } from "zustand";
import { Account, Voucher } from "@/types/erp";
import { db } from "@/lib/firebase";
import { ref, onValue } from "firebase/database";

interface AccountingState {
  accounts: Account[];
  vouchers: Voucher[];
  isLoading: boolean;
  subscribeAccounting: () => () => void;
}

const DEFAULT_ACCOUNTS: Account[] = [
  { id: "acc_1001", code: "1001", name: "Petty Cash", type: "asset", balance: 450000 },
  { id: "acc_1002", code: "1002", name: "Dutch-Bangla Bank (Current)", type: "asset", balance: 3850000 },
  { id: "acc_2101", code: "2101", name: "Accounts Payable (Suppliers)", type: "liability", balance: 1240000 },
  { id: "acc_4001", code: "4001", name: "Contract Billing Revenue", type: "income", balance: 28500000 },
  { id: "acc_5001", code: "5001", name: "Direct Material Purchases", type: "expense", balance: 14200000 },
  { id: "acc_5002", code: "5002", name: "Site Wages & Subcontracting", type: "expense", balance: 4800000 },
];

export const useAccountingStore = create<AccountingState>((set) => ({
  accounts: DEFAULT_ACCOUNTS,
  vouchers: [],
  isLoading: false,
  subscribeAccounting: () => {
    set({ isLoading: true });
    const accRef = ref(db, "accounts");

    const unsubscribe = onValue(
      accRef,
      (snapshot) => {
        const val = snapshot.val();
        if (val) {
          const list: Account[] = Object.entries(val).map(([id, data]: [string, any]) => ({
            id,
            ...data,
          }));
          set({ accounts: list, isLoading: false });
        } else {
          set({ accounts: DEFAULT_ACCOUNTS, isLoading: false });
        }
      },
      () => set({ accounts: DEFAULT_ACCOUNTS, isLoading: false })
    );

    return unsubscribe;
  },
}));
