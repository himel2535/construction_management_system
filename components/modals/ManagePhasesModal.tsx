"use client";

import { useState } from "react";
import { X, Trash2 } from "lucide-react";
import { useProjectPhases, useCreateProjectPhase, useDeleteProjectPhase } from "@/lib/hooks/useProjectBoq";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  projectId: string;
}

export default function ManagePhasesModal({ isOpen, onClose, projectId }: Props) {
  const { data: phases = [] } = useProjectPhases(projectId);
  const createPhase = useCreateProjectPhase();
  const deletePhase = useDeleteProjectPhase();

  const [phaseName, setPhaseName] = useState("");

  if (!isOpen) return null;

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!phaseName.trim()) return;

    await createPhase.mutateAsync({
      projectId,
      name: phaseName.trim(),
    });
    setPhaseName("");
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md overflow-hidden flex flex-col max-h-[80vh]">
        <div className="flex justify-between items-center p-4 border-b border-slate-100">
          <h3 className="font-bold text-slate-800">Manage Project Phases</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 transition-colors">
            <X size={20} />
          </button>
        </div>
        
        <div className="p-4 overflow-y-auto">
          <form onSubmit={handleAdd} className="flex gap-2 mb-6">
            <input 
              required
              value={phaseName}
              onChange={(e) => setPhaseName(e.target.value)}
              className="flex-1 border border-slate-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" 
              placeholder="e.g. Phase 1 - Foundation"
            />
            <button 
              type="submit"
              disabled={createPhase.isPending || !phaseName.trim()}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-md transition-colors disabled:opacity-50 whitespace-nowrap"
            >
              {createPhase.isPending ? "Adding..." : "Add Phase"}
            </button>
          </form>

          <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Existing Phases</h4>
          {phases.length === 0 ? (
            <div className="text-center p-4 text-slate-500 bg-slate-50 rounded-lg border border-slate-100 text-sm">
              No phases defined yet.
            </div>
          ) : (
            <ul className="space-y-2">
              {phases.map(p => (
                <li key={p.id} className="flex items-center justify-between p-3 bg-slate-50 border border-slate-100 rounded-lg">
                  <span className="text-sm font-medium text-slate-800">{p.name}</span>
                  <button 
                    onClick={() => deletePhase.mutate({ id: p.id, projectId })}
                    className="text-slate-400 hover:text-red-600 transition-colors"
                  >
                    <Trash2 size={16} />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        
        <div className="p-4 border-t border-slate-100 flex justify-end bg-slate-50 mt-auto">
          <button 
            onClick={onClose}
            className="px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-800 text-sm font-medium rounded-lg transition-colors"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
