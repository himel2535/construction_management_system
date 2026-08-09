"use client";

import { useState, useEffect } from "react";
import { X } from "lucide-react";
import { useCreateInvoice } from "@/lib/hooks/useProjectBilling";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  projectId: string;
  clientId?: string | null;
}

export default function CreateInvoiceModal({ isOpen, onClose, projectId, clientId }: Props) {
  const createInvoice = useCreateInvoice();

  const [formData, setFormData] = useState({
    billType: "Standard Invoice",
    billDate: new Date().toISOString().split("T")[0],
    dueDate: "",
    amount: 0,
    paidAmount: 0,
    status: "draft",
  });

  useEffect(() => {
    if (isOpen) {
      const today = new Date();
      const due = new Date(today);
      due.setDate(due.getDate() + 30);
      setFormData(prev => ({
        ...prev,
        billDate: today.toISOString().split("T")[0],
        dueDate: due.toISOString().split("T")[0]
      }));
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    await createInvoice.mutateAsync({
      projectId,
      clientId: clientId || "9a42ce2a-dabe-4bd5-adf2-158f6050d639", // fallback to a default client if none provided
      billType: formData.billType,
      billDate: formData.billDate,
      dueDate: formData.dueDate,
      amount: Number(formData.amount),
      paidAmount: Number(formData.paidAmount),
      status: formData.status,
    });
    
    setFormData({ billType: "Standard Invoice", billDate: "", dueDate: "", amount: 0, paidAmount: 0, status: "draft" });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg overflow-hidden flex flex-col max-h-[90vh]">
        <div className="flex justify-between items-center p-4 border-b border-slate-100">
          <h3 className="font-bold text-slate-800">Create Invoice / IPC</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 transition-colors">
            <X size={20} />
          </button>
        </div>
        
        <div className="p-4 overflow-y-auto">
          <form id="invoiceForm" onSubmit={handleSubmit} className="space-y-4">
            
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Invoice Type</label>
              <select 
                name="billType"
                value={formData.billType}
                onChange={handleChange}
                className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
              >
                <option value="Standard Invoice">Standard Invoice</option>
                <option value="Interim Payment Certificate (IPC)">Interim Payment Certificate (IPC)</option>
                <option value="Advance Payment">Advance Payment</option>
                <option value="Final Bill">Final Bill</option>
              </select>
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Bill Date *</label>
                <input 
                  type="date"
                  required
                  name="billDate"
                  value={formData.billDate}
                  onChange={handleChange}
                  className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" 
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Due Date</label>
                <input 
                  type="date"
                  name="dueDate"
                  value={formData.dueDate}
                  onChange={handleChange}
                  className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" 
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Total Amount (BDT) *</label>
                <input 
                  type="number"
                  step="0.01"
                  required
                  name="amount"
                  value={formData.amount}
                  onChange={handleChange}
                  className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" 
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Paid Amount (BDT)</label>
                <input 
                  type="number"
                  step="0.01"
                  name="paidAmount"
                  value={formData.paidAmount}
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
                <option value="draft">Draft</option>
                <option value="submitted">Submitted</option>
                <option value="approved">Approved</option>
                <option value="paid">Paid</option>
                <option value="overdue">Overdue</option>
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
            form="invoiceForm"
            disabled={createInvoice.isPending}
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50"
          >
            {createInvoice.isPending ? "Generating..." : "Create Invoice"}
          </button>
        </div>
      </div>
    </div>
  );
}
