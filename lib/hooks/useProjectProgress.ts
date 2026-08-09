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
      return await api.create("projectProgress", data);
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["projectProgress", variables.projectId] });
    },
  });
}
