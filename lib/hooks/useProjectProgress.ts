import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/apiClient";

export interface ProjectProgress {
  id: string;
  projectId: string;
  activity: string;
  remarks?: string;
  progressDate: string;
  executedQty: number;
  plannedQty: number;
  refType?: string;
  refId?: string;
  boqId?: string;
}

export function useProjectProgress(projectId: string) {
  return useQuery<ProjectProgress[]>({
    queryKey: ["projectProgress", projectId],
    queryFn: async () => {
      if (!projectId) return [];
      const data = await api.getList("projectProgress", { projectId });
      return data as ProjectProgress[];
    },
    enabled: !!projectId,
  });
}

export function useCreateProgress() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: Omit<ProjectProgress, "id">) => {
      const result = await api.create("projectProgress", data);
      
      // Auto-calculate and update project progressPercent
      try {
        const allProgress = await api.getList("projectProgress", { projectId: data.projectId }) as ProjectProgress[];
        const executed = allProgress.reduce((sum, p) => sum + (p.executedQty || 0), 0);
        
        const allBoq = await api.getList("projectBoq", { projectId: data.projectId }) as any[];
        const planned = allBoq.length > 0 
          ? allBoq.reduce((sum, b) => sum + (b.qty || 0), 0) 
          : allProgress.reduce((sum, p) => sum + (p.plannedQty || 0), 0) || 10000;
          
        const newPercent = Math.min(100, Math.round((executed / (planned || 1)) * 100));
        
        await api.update("projects", data.projectId, { progressPercent: newPercent });
      } catch (e) {
        console.error("Failed to auto-update project progress", e);
      }
      
      return result;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["projectProgress", variables.projectId] });
      queryClient.invalidateQueries({ queryKey: ["project", variables.projectId] });
      queryClient.invalidateQueries({ queryKey: ["projects"] });
    },
  });
}
