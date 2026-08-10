"use client";

import { useState } from "react";
import { X } from "lucide-react";
import { useCreateProgress } from "@/lib/hooks/useProjectProgress";
import { useProjectBoq } from "@/lib/hooks/useProjectBoq";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  projectId: string;
}

export default function LogProgressModal({ isOpen, onClose, projectId }: Props) {
  const createProgress = useCreateProgress();
  const { data: boqItems = [] } = useProjectBoq(projectId);

  const [formData, setFormData] = useState({
    activity: "",
    progressDate: new Date().toISOString().split("T")[0],
    executedQty: 0,
    plannedQty: 0,
    remarks: "",
    boqId: "",
  });

  if (!isOpen) return null;

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleBoqChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const boqId = e.target.value;
    const boq = boqItems.find(b => b.id === boqId);
    
    setFormData(prev => ({
      ...prev,
      boqId,
      activity: boq ? boq.item : prev.activity,
      plannedQty: boq ? boq.qty : prev.plannedQty,
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.activity && !formData.boqId) return;

    await createProgress.mutateAsync({
      projectId,
      activity: formData.activity,
      progressDate: formData.progressDate,
      executedQty: Number(formData.executedQty),
      plannedQty: Number(formData.plannedQty),
      remarks: formData.remarks,
      boqId: formData.boqId || undefined,
    });
    
    setFormData({ activity: "", progressDate: new Date().toISOString().split("T")[0], executedQty: 0, plannedQty: 0, remarks: "", boqId: "" });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg overflow-hidden flex flex-col max-h-[90vh]">
        <div className="flex justify-between items-center p-4 border-b border-slate-100">
          <h3 className="font-bold text-slate-800">Log Physical Progress</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 transition-colors">
            <X size={20} />
          </button>
        </div>
        
        <div className="p-4 overflow-y-auto">
          <form id="progressForm" onSubmit={handleSubmit} className="space-y-4">
            
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Link to BOQ Line (Optional)</label>
              <select 
                name="boqId"
                value={formData.boqId}
                onChange={handleBoqChange}
                className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
              >
                <option value="">General Activity (No BOQ Link)</option>
                {boqItems.map(b => (
                  <option key={b.id} value={b.id}>{b.itemCode ? `${b.itemCode} - ` : ''}{b.item}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Activity Description *</label>
              <input 
                required
                name="activity"
                value={formData.activity}
                onChange={handleChange}
                className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" 
                placeholder="e.g. Completed 1st floor concrete pour"
              />
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Progress Date *</label>
                <input 
                  type="date"
                  required
                  name="progressDate"
                  value={formData.progressDate}
                  onChange={handleChange}
                  className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" 
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Executed Quantity</label>
                <input 
                  type="number"
                  step="0.01"
                  name="executedQty"
                  value={formData.executedQty}
                  onChange={handleChange}
                  className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" 
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Planned Quantity</label>
                <input 
                  type="number"
                  step="0.01"
                  name="plannedQty"
                  value={formData.plannedQty}
                  onChange={handleChange}
                  className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" 
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Remarks / Notes</label>
              <textarea 
                name="remarks"
                value={formData.remarks}
                onChange={handleChange}
                rows={3}
                className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none" 
                placeholder="Any issues, delays, or additional context"
              />
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
            form="progressForm"
            disabled={createProgress.isPending}
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50"
          >
            {createProgress.isPending ? "Saving..." : "Log Progress"}
          </button>
        </div>
      </div>
    </div>
  );
}
