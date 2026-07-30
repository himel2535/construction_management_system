import { create } from "zustand";
import { UserProfile, TenantId } from "@/types/erp";

interface AuthState {
  currentUser: UserProfile | null;
  activeTenantId: TenantId;
  isLoading: boolean;
  setCurrentUser: (user: UserProfile) => void;
  setActiveTenantId: (tenantId: TenantId) => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  currentUser: {
    id: "demo-user",
    name: "Demo Owner",
    email: "owner@triniti.demo",
    role: "owner",
    tenantId: "tn_default",
  },
  activeTenantId: "tn_default",
  isLoading: false,
  setCurrentUser: (user) => set({ currentUser: user }),
  setActiveTenantId: (tenantId) => set({ activeTenantId: tenantId }),
}));
