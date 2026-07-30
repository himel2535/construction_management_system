import { create } from "zustand";
import { Project } from "@/types/erp";
import { db } from "@/lib/firebase";
import { ref, onValue } from "firebase/database";

interface ProjectState {
  projects: Project[];
  isLoading: boolean;
  error: string | null;
  subscribeProjects: () => () => void;
}

const DEFAULT_MOCK_PROJECTS: Project[] = [
  {
    id: "proj_1",
    name: "Uttara Lakeview Residence (Tower A)",
    code: "PRJ-2026-001",
    type: "private",
    status: "active",
    location: "Sector 11, Uttara, Dhaka",
    clientName: "Lakeview Properties Ltd.",
    contractValue: 45000000,
    startDate: "2026-01-15",
    estimatedEndDate: "2027-06-30",
    tenantId: "tn_default",
    createdAt: Date.now() - 1000000,
    updatedAt: Date.now(),
    boqBudget: 38000000,
    spentAmount: 14200000,
  },
  {
    id: "proj_2",
    name: "RHD Highway Overpass Expansion",
    code: "GOV-2026-008",
    type: "government",
    status: "active",
    location: "Gazipur Bypass Road",
    clientName: "Roads & Highways Department",
    contractValue: 120000000,
    startDate: "2025-11-01",
    estimatedEndDate: "2027-12-31",
    tenantId: "tn_default",
    createdAt: Date.now() - 2000000,
    updatedAt: Date.now(),
    boqBudget: 105000000,
    spentAmount: 48500000,
  },
  {
    id: "proj_3",
    name: "Dhanmondi Commercial Complex",
    code: "PRJ-2026-004",
    type: "private",
    status: "planning",
    location: "Road 27, Dhanmondi",
    clientName: "Apex Retail Holdings",
    contractValue: 85000000,
    startDate: "2026-08-01",
    estimatedEndDate: "2028-03-31",
    tenantId: "tn_default",
    createdAt: Date.now() - 500000,
    updatedAt: Date.now(),
    boqBudget: 72000000,
    spentAmount: 2500000,
  },
];

export const useProjectStore = create<ProjectState>((set) => ({
  projects: DEFAULT_MOCK_PROJECTS,
  isLoading: false,
  error: null,
  subscribeProjects: () => {
    set({ isLoading: true });
    const projectsRef = ref(db, "projects");
    
    const unsubscribe = onValue(
      projectsRef,
      (snapshot) => {
        const val = snapshot.val();
        if (val) {
          const list: Project[] = Object.entries(val).map(([id, data]: [string, any]) => ({
            id,
            ...data,
          }));
          set({ projects: list, isLoading: false, error: null });
        } else {
          set({ projects: DEFAULT_MOCK_PROJECTS, isLoading: false });
        }
      },
      (error) => {
        console.warn("[ProjectStore] Firebase error, falling back to mock data:", error);
        set({ projects: DEFAULT_MOCK_PROJECTS, isLoading: false });
      }
    );

    return unsubscribe;
  },
}));
