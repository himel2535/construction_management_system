"use client";

import { useState } from "react";
import { X } from "lucide-react";
import { useCreateBoqItem, useProjectPhases } from "@/lib/hooks/useProjectBoq";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  projectId: string;
}

export default function AddBoqItemModal({ isOpen, onClose, projectId }: Props) {
  const createBoq = useCreateBoqItem();
  const { data: phases = [] } = useProjectPhases(projectId);

  const [formData, setFormData] = useState({
    itemCode: "",
    item: "",
    unit: "",
    qty: 0,
    rate: 0,
    amount: 0,
    revision: "",
    phaseId: "",
  });

  if (!isOpen) return null;

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    
    setFormData(prev => {
      const newData = { ...prev, [name]: value };
      
      // Auto calculate amount
      if (name === "qty" || name === "rate") {
        newData.amount = Number(newData.qty || 0) * Number(newData.rate || 0);
      }
      return newData;
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.item) return;

    await createBoq.mutateAsync({
      projectId,
      itemCode: formData.itemCode,
      item: formData.item,
      unit: formData.unit,
      qty: Number(formData.qty),
      rate: Number(formData.rate),
      amount: Number(formData.amount),
      revision: formData.revision,
      phaseId: formData.phaseId || undefined,
    });
    
    setFormData({ itemCode: "", item: "", unit: "", qty: 0, rate: 0, amount: 0, revision: "", phaseId: "" });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg overflow-hidden flex flex-col max-h-[90vh]">
        <div className="flex justify-between items-center p-4 border-b border-slate-100">
          <h3 className="font-bold text-slate-800">Add BOQ Line Item</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 transition-colors">
            <X size={20} />
          </button>
        </div>
        
        <div className="p-4 overflow-y-auto">
          <form id="boqForm" onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Item Description *</label>
              <input 
                required
                name="item"
                value={formData.item}
                onChange={handleChange}
                className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" 
                placeholder="e.g. Concrete Work C30"
              />
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Item Code</label>
                <input 
                  name="itemCode"
                  value={formData.itemCode}
                  onChange={handleChange}
                  className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" 
                  placeholder="e.g. 1.2.1"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Project Phase</label>
                <select 
                  name="phaseId"
                  value={formData.phaseId}
                  onChange={handleChange}
                  className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
                >
                  <option value="">None (General)</option>
                  {phases.map(p => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Unit</label>
                <input 
                  name="unit"
                  value={formData.unit}
                  onChange={handleChange}
                  className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" 
                  placeholder="e.g. M3, SQM"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Quantity</label>
                <input 
                  type="number"
                  step="0.01"
                  name="qty"
                  value={formData.qty}
                  onChange={handleChange}
                  className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" 
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Rate (BDT)</label>
                <input 
                  type="number"
                  step="0.01"
                  name="rate"
                  value={formData.rate}
                  onChange={handleChange}
                  className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" 
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Total Amount (BDT)</label>
                <input 
                  type="number"
                  readOnly
                  name="amount"
                  value={formData.amount}
                  className="w-full border border-slate-200 bg-slate-50 rounded-md px-3 py-2 text-sm text-slate-700" 
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Revision</label>
                <input 
                  name="revision"
                  value={formData.revision}
                  onChange={handleChange}
                  className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" 
                  placeholder="e.g. R0, R1"
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
            form="boqForm"
            disabled={createBoq.isPending}
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50"
          >
            {createBoq.isPending ? "Saving..." : "Add Item"}
          </button>
        </div>
      </div>
    </div>
  );
}
