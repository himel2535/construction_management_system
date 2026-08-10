"use client";

import { useState } from "react";
import { X } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/apiClient";

interface Worker {
  id: string;
  name: string;
  category?: string;
  trade?: string;
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  projectId: string;
}

export default function AssignWorkerModal({ isOpen, onClose, projectId }: Props) {
  const queryClient = useQueryClient();

  // Fetch all unassigned or available workers
  const { data: allWorkers = [], isLoading } = useQuery<Worker[]>({
    queryKey: ["allWorkers"],
    queryFn: async () => {
      const data = await api.getList("workers");
      return data as Worker[];
    },
    enabled: isOpen,
  });

  const assignWorker = useMutation({
    mutationFn: async (workerId: string) => {
      return await api.update("workers", workerId, { assignedProjectId: projectId });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["workers", projectId] });
    },
  });

  const [selectedWorkerId, setSelectedWorkerId] = useState("");

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedWorkerId) return;

    await assignWorker.mutateAsync(selectedWorkerId);
    
    setSelectedWorkerId("");
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md overflow-hidden flex flex-col max-h-[90vh]">
        <div className="flex justify-between items-center p-4 border-b border-slate-100">
          <h3 className="font-bold text-slate-800">Assign Worker</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 transition-colors">
            <X size={20} />
          </button>
        </div>
        
        <div className="p-4 overflow-y-auto">
          <form id="assignWorkerForm" onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Select Worker *</label>
              {isLoading ? (
                <div className="text-sm text-slate-500">Loading workers...</div>
              ) : (
                <select 
                  required
                  value={selectedWorkerId}
                  onChange={(e) => setSelectedWorkerId(e.target.value)}
                  className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
                >
                  <option value="">Select a worker...</option>
                  {allWorkers.map(w => (
                    <option key={w.id} value={w.id}>
                      {w.name} {w.category || w.trade ? `(${w.category || w.trade})` : ''}
                    </option>
                  ))}
                </select>
              )}
            </div>
          </form>
        </div>
        
        <div className="p-4 border-t border-slate-100 flex justify-end gap-3 bg-slate-50 mt-auto">
          <button 
            type="button" 
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-slate-700 hover:text-slate-900 transition-colors"
          >
            Cancel
          </button>
          <button 
            type="submit" 
            form="assignWorkerForm"
            disabled={assignWorker.isPending || !selectedWorkerId}
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50"
          >
            {assignWorker.isPending ? "Assigning..." : "Assign Worker"}
          </button>
        </div>
      </div>
    </div>
  );
}
