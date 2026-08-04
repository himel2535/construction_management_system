import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, fetchApiWithSchema } from "@/lib/apiClient";
import { Client, ClientSchema } from "@/lib/schemas";
import { z } from "zod";

const ClientListSchema = z.array(ClientSchema);

export function useCustomers() {
  return useQuery<Client[]>({
    queryKey: ["customers"],
    queryFn: async () => {
      try {
        const data = await api.getList("clients");
        const parsed = z.array(ClientSchema).safeParse(data);
        if (parsed.success) return parsed.data;
        return Array.isArray(data) ? data as Client[] : [];
      } catch (err) {
        console.warn("[useCustomers] Error fetching from backend:", err);
        return [];
      }
    },
  });
}

export function useCustomer(id: string) {
  return useQuery<Client | null>({
    queryKey: ["customers", id],
    queryFn: async () => {
      if (!id) return null;
      try {
        return await fetchApiWithSchema(`clients/${id}`, ClientSchema);
      } catch (err) {
        return null;
      }
    },
    enabled: !!id,
  });
}

export function useCreateCustomer() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (newClient: Omit<Client, "id">) => {
      const validated = ClientSchema.omit({ id: true }).parse(newClient);
      return await api.create("clients", validated);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["customers"] });
    },
  });
}

export function useUpdateCustomer() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<Client> }) => {
      return await api.update("clients", id, data);
    },
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: ["customers"] });
      queryClient.invalidateQueries({ queryKey: ["customers", id] });
    },
  });
}

export function useDeleteCustomer() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      return await api.delete("clients", id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["customers"] });
    },
  });
}
