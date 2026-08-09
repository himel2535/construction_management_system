"use client";

import { useState } from "react";
import { X } from "lucide-react";
import { useCreateTeamAssignment, useUsers } from "@/lib/hooks/useProjectTeam";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  projectId: string;
}

export default function AssignTeamModal({ isOpen, onClose, projectId }: Props) {
  const assignTeamMember = useCreateTeamAssignment();
  const { data: users = [] } = useUsers();

  const [formData, setFormData] = useState({
    userId: "",
    role: "project_manager",
    raci: "",
    allocationPercent: 100,
    startDate: new Date().toISOString().split("T")[0],
    endDate: "",
  });

  if (!isOpen) return null;

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.userId) return;

    await assignTeamMember.mutateAsync({
      projectId,
      userId: formData.userId,
      role: formData.role,
      raci: formData.raci || undefined,
      allocationPercent: Number(formData.allocationPercent),
      startDate: formData.startDate || undefined,
      endDate: formData.endDate || undefined,
      status: "active",
    });
    
    setFormData({ 
      userId: "", 
      role: "project_manager", 
      raci: "", 
      allocationPercent: 100, 
      startDate: new Date().toISOString().split("T")[0], 
      endDate: "" 
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md overflow-hidden flex flex-col max-h-[90vh]">
        <div className="flex justify-between items-center p-4 border-b border-slate-100">
          <h3 className="font-bold text-slate-800">Assign Team Member</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 transition-colors">
            <X size={20} />
          </button>
        </div>
        
        <div className="p-4 overflow-y-auto">
          <form id="teamForm" onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Select Member *</label>
              <select 
                required
                name="userId"
                value={formData.userId}
                onChange={handleChange}
                className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
              >
                <option value="">Select a user...</option>
                {users.map(u => (
                  <option key={u.id} value={u.id}>{u.displayName || u.email}</option>
                ))}
              </select>
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Role *</label>
                <select 
                  required
                  name="role"
                  value={formData.role}
                  onChange={handleChange}
                  className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
                >
                  <option value="project_manager">Project Manager</option>
                  <option value="site_engineer">Site Engineer</option>
                  <option value="supervisor">Supervisor</option>
                  <option value="architect">Architect</option>
                  <option value="safety_officer">Safety Officer</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">RACI</label>
                <select 
                  name="raci"
                  value={formData.raci}
                  onChange={handleChange}
                  className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
                >
                  <option value="">None</option>
                  <option value="R">Responsible</option>
                  <option value="A">Accountable</option>
                  <option value="C">Consulted</option>
                  <option value="I">Informed</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Allocation (%)</label>
              <input 
                type="number"
                min="0"
                max="100"
                name="allocationPercent"
                value={formData.allocationPercent}
                onChange={handleChange}
                className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" 
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Start Date</label>
                <input 
                  type="date"
                  name="startDate"
                  value={formData.startDate}
                  onChange={handleChange}
                  className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" 
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">End Date</label>
                <input 
                  type="date"
                  name="endDate"
                  value={formData.endDate}
                  onChange={handleChange}
                  className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" 
                />
              </div>
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
            form="teamForm"
            disabled={assignTeamMember.isPending}
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50"
          >
            {assignTeamMember.isPending ? "Assigning..." : "Assign Member"}
          </button>
        </div>
      </div>
    </div>
  );
}
