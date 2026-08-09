import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/apiClient";

export interface ClientInvoice {
  id: string;
  projectId: string;
  projectName?: string;
  clientId: string;
  amount: number;
  paidAmount: number;
  dueDate?: string;
  billDate?: string;
  status: string;
  billType?: string;
}

export function useProjectInvoices(projectId: string) {
  return useQuery<ClientInvoice[]>({
    queryKey: ["clientInvoices", projectId],
    queryFn: async () => {
      if (!projectId) return [];
      const data = await api.getList("clientInvoices", { projectId });
      return data as ClientInvoice[];
    },
    enabled: !!projectId,
  });
}

export function useCreateInvoice() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: Omit<ClientInvoice, "id">) => {
      return await api.create("clientInvoices", data);
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["clientInvoices", variables.projectId] });
    },
  });
}
