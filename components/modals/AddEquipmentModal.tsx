"use client";

import { useState } from "react";
import { X } from "lucide-react";
import { useCreateEquipment } from "@/lib/hooks/useProjectResources";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  projectId: string;
}

export default function AddEquipmentModal({ isOpen, onClose, projectId }: Props) {
  const createEquipment = useCreateEquipment();

  const [formData, setFormData] = useState({
    name: "",
    type: "heavy_machinery",
    quantity: 1,
    status: "active",
  });

  if (!isOpen) return null;

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name) return;

    await createEquipment.mutateAsync({
      projectId,
      name: formData.name,
      type: formData.type,
      quantity: Number(formData.quantity),
      status: formData.status,
    });
    
    setFormData({ name: "", type: "heavy_machinery", quantity: 1, status: "active" });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md overflow-hidden flex flex-col max-h-[90vh]">
        <div className="flex justify-between items-center p-4 border-b border-slate-100">
          <h3 className="font-bold text-slate-800">Add Equipment</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 transition-colors">
            <X size={20} />
          </button>
        </div>
        
        <div className="p-4 overflow-y-auto">
          <form id="equipmentForm" onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Equipment Name *</label>
              <input 
                required
                name="name"
                value={formData.name}
                onChange={handleChange}
                className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" 
                placeholder="e.g. Excavator Model X"
              />
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Type *</label>
                <select 
                  required
                  name="type"
                  value={formData.type}
                  onChange={handleChange}
                  className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
                >
                  <option value="heavy_machinery">Heavy Machinery</option>
                  <option value="vehicle">Vehicle</option>
                  <option value="power_tool">Power Tool</option>
                  <option value="safety_gear">Safety Gear</option>
                  <option value="other">Other</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Quantity *</label>
                <input 
                  type="number"
                  min="1"
                  required
                  name="quantity"
                  value={formData.quantity}
                  onChange={handleChange}
                  className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" 
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Status</label>
              <select 
                name="status"
                value={formData.status}
                onChange={handleChange}
                className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
              >
                <option value="active">Active (On Site)</option>
                <option value="maintenance">Maintenance</option>
                <option value="returned">Returned / Off Site</option>
              </select>
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
            form="equipmentForm"
            disabled={createEquipment.isPending}
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50"
          >
            {createEquipment.isPending ? "Adding..." : "Add Equipment"}
          </button>
        </div>
      </div>
    </div>
  );
}
