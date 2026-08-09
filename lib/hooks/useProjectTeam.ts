import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/apiClient";

export interface TeamAssignment {
  id: string;
  projectId: string;
  userId: string;
  role?: string;
  raci?: string;
  allocationPercent: number;
  startDate?: string;
  endDate?: string;
  status: string;
  user?: {
    id: string;
    displayName: string;
    email: string;
  };
}

export interface ResponsibilityTask {
  id: string;
  projectId: string;
  title: string;
  description?: string;
  assigneeUserId?: string;
  raci?: string;
  priority: string;
  deadline?: string;
  status: string;
  parentTaskId?: string;
  assignee?: {
    id: string;
    displayName: string;
    email: string;
  };
}

export interface User {
  id: string;
  displayName: string;
  email: string;
  role: string;
}

export function useProjectTeamAssignments(projectId: string) {
  return useQuery<TeamAssignment[]>({
    queryKey: ["teamAssignments", projectId],
    queryFn: async () => {
      if (!projectId) return [];
      const data = await api.getList("teamAssignments", { projectId });
      return data as TeamAssignment[];
    },
    enabled: !!projectId,
  });
}

export function useProjectTasks(projectId: string) {
  return useQuery<ResponsibilityTask[]>({
    queryKey: ["responsibilityTasks", projectId],
    queryFn: async () => {
      if (!projectId) return [];
      const data = await api.getList("responsibilityTasks", { projectId });
      return data as ResponsibilityTask[];
    },
    enabled: !!projectId,
  });
}

export function useUsers() {
  return useQuery<User[]>({
    queryKey: ["users"],
    queryFn: async () => {
      const data = await api.getList("users");
      return data as User[];
    },
  });
}

export function useCreateTeamAssignment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: Omit<TeamAssignment, "id" | "user">) => {
      return await api.create("teamAssignments", data);
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["teamAssignments", variables.projectId] });
    },
  });
}

export function useEndTeamAssignment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, projectId }: { id: string, projectId: string }) => {
      return await api.update("teamAssignments", id, { status: "ended", endDate: new Date().toISOString().split("T")[0] });
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["teamAssignments", variables.projectId] });
    },
  });
}

export function useCreateTask() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: Omit<ResponsibilityTask, "id" | "assignee">) => {
      return await api.create("responsibilityTasks", data);
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["responsibilityTasks", variables.projectId] });
    },
  });
}

export function useUpdateTask() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, projectId, data }: { id: string, projectId: string, data: Partial<ResponsibilityTask> }) => {
      return await api.update("responsibilityTasks", id, data);
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["responsibilityTasks", variables.projectId] });
    },
  });
}
