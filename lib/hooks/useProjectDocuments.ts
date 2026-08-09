import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/apiClient";

export interface ProjectDocument {
  id: string;
  projectId: string;
  name: string;
  url: string;
  type?: string;
  size?: number;
  uploadedBy?: string;
  createdAt: string;
}

export function useProjectDocuments(projectId: string) {
  return useQuery<ProjectDocument[]>({
    queryKey: ["projectDocuments", projectId],
    queryFn: async () => {
      if (!projectId) return [];
      const data = await api.getList("projectDocuments", { projectId });
      return data as ProjectDocument[];
    },
    enabled: !!projectId,
  });
}

export function useUploadDocument() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: Omit<ProjectDocument, "id" | "createdAt">) => {
      return await api.create("projectDocuments", data);
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["projectDocuments", variables.projectId] });
    },
  });
}

export function useDeleteDocument() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, projectId }: { id: string, projectId: string }) => {
      return await api.remove("projectDocuments", id);
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["projectDocuments", variables.projectId] });
    },
  });
}
