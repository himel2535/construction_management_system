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
        
        // ensure the newly added execution is counted if the backend list is stale
        const hasNew = allProgress.some(p => p.activity === data.activity && p.executedQty === data.executedQty);
        let executed = allProgress.reduce((sum, p) => sum + (Number(p.executedQty) || 0), 0);
        if (!hasNew) {
          executed += Number(data.executedQty) || 0;
        }
        
        const allBoq = await api.getList("projectBoq", { projectId: data.projectId }) as any[];
        let planned = allBoq.length > 0 
          ? allBoq.reduce((sum, b) => sum + (Number(b.qty) || 0), 0) 
          : allProgress.reduce((sum, p) => sum + (Number(p.plannedQty) || 0), 0);
          
        if (!planned || planned === 0) planned = 10000;
          
        const newPercent = Math.min(100, Math.max(1, Math.round((executed / planned) * 100)));
        
        // Fetch current project to do a full replacement in case backend rejects partial updates
        const projects = await api.getList("projects");
        const currentProject = projects.find((p: any) => p.id === data.projectId);
        
        if (currentProject) {
          await api.update("projects", data.projectId, { ...currentProject, progressPercent: newPercent });
        } else {
          await api.update("projects", data.projectId, { progressPercent: newPercent });
        }
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
