import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/apiClient";

export interface ProjectPhase {
  id: string;
  projectId: string;
  name: string;
  description?: string;
  startDate?: string;
  endDate?: string;
  status: string;
}

export interface BoqItem {
  id: string;
  projectId: string;
  phaseId?: string;
  itemCode?: string;
  item: string;
  unit?: string;
  qty: number;
  contractQty?: number;
  rate: number;
  amount: number;
  revision?: string;
  costCategory?: string;
  createdAt?: string;
}

export function useProjectPhases(projectId: string) {
  return useQuery<ProjectPhase[]>({
    queryKey: ["projectPhases", projectId],
    queryFn: async () => {
      if (!projectId) return [];
      const data = await api.getList("projectPhases", { projectId });
      return data as ProjectPhase[];
    },
    enabled: !!projectId,
  });
}

export function useProjectBoq(projectId: string) {
  return useQuery<BoqItem[]>({
    queryKey: ["boqItems", projectId],
    queryFn: async () => {
      if (!projectId) return [];
      const data = await api.getList("boqItems", { projectId });
      return data as BoqItem[];
    },
    enabled: !!projectId,
  });
}

export function useCreateBoqItem() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: Omit<BoqItem, "id">) => {
      return await api.create("boqItems", data);
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["boqItems", variables.projectId] });
    },
  });
}

export function useUpdateBoqItem() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, projectId, data }: { id: string, projectId: string, data: Partial<BoqItem> }) => {
      return await api.update("boqItems", id, data);
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["boqItems", variables.projectId] });
    },
  });
}

export function useDeleteBoqItem() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, projectId }: { id: string, projectId: string }) => {
      return await api.remove("boqItems", id);
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["boqItems", variables.projectId] });
    },
  });
}

export function useCreateProjectPhase() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: Omit<ProjectPhase, "id" | "status"> & { status?: string }) => {
      return await api.create("projectPhases", { status: 'active', ...data });
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["projectPhases", variables.projectId] });
    },
  });
}

export function useDeleteProjectPhase() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, projectId }: { id: string, projectId: string }) => {
      return await api.remove("projectPhases", id);
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["projectPhases", variables.projectId] });
    },
  });
}
