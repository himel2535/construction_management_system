import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/apiClient";

export interface EquipmentLog {
  id: string;
  projectId: string;
  siteInChargeId: string;
  equipmentName: string;
  hours: number;
  logDate: string;
  cost: number;
  createdBy?: string;
}

export interface Worker {
  id: string;
  name: string;
  phone?: string;
  nid?: string;
  category?: string;
  dailyRate: number;
  status: string;
  assignedProjectId?: string;
  trade?: string;
}

export function useProjectEquipment(projectId: string) {
  return useQuery<EquipmentLog[]>({
    queryKey: ["equipmentLogs", projectId],
    queryFn: async () => {
      if (!projectId) return [];
      const data = await api.getList("equipmentLogs", { projectId });
      return data as EquipmentLog[];
    },
    enabled: !!projectId,
  });
}

export function useProjectWorkers(projectId: string) {
  return useQuery<Worker[]>({
    queryKey: ["workers", projectId],
    queryFn: async () => {
      if (!projectId) return [];
      const data = await api.getList("workers", { assignedProjectId: projectId });
      return data as Worker[];
    },
    enabled: !!projectId,
  });
}

export function useCreateEquipment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: any) => {
      // Mocked endpoint call, replace with real one later
      return await api.create("equipmentLogs", {
        projectId: data.projectId,
        siteInChargeId: "ad6cf096-fb29-433d-93ec-20733032ec17", // fallback valid ID
        equipmentName: data.name,
        hours: 0,
        logDate: new Date().toISOString(),
        cost: 0,
      });
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["equipmentLogs", variables.projectId] });
    },
  });
}
