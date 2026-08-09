import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, fetchApiWithSchema } from "@/lib/apiClient";
import { Project, ProjectSchema } from "@/lib/schemas";
import { z } from "zod";

export function useProjects() {
  return useQuery<Project[]>({
    queryKey: ["projects"],
    queryFn: async () => {
      try {
        const data = await api.getList("projects");
        const parsed = z.array(ProjectSchema).safeParse(data);
        if (parsed.success) return parsed.data;
        return Array.isArray(data) ? data as Project[] : [];
      } catch (err) {
        console.warn("[useProjects] Error fetching from backend:", err);
        return [];
      }
    },
  });
}

export function useProject(id: string) {
  return useQuery<Project | null>({
    queryKey: ["projects", id],
    queryFn: async () => {
      if (!id) return null;
      try {
        return await fetchApiWithSchema(`projects/${id}`, ProjectSchema);
      } catch (err) {
        console.warn(`[useProject] Error fetching project ${id}:`, err);
        return null;
      }
    },
    enabled: !!id,
  });
}

export function useCreateProject() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (newProject: Omit<Project, "id">) => {
      const validated = ProjectSchema.omit({ id: true }).parse(newProject);
      return await api.create("projects", validated);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["projects"] });
    },
  });
}

export function useUpdateProject() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<Project> }) => {
      return await api.update("projects", id, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["projects"] });
    },
  });
}
