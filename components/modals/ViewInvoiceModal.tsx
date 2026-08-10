"use client";

import { X } from "lucide-react";
import { StatusChip } from "@/components/ui/StatusPill";

interface Invoice {
  id: string;
  billType?: string;
  billDate?: string;
  dueDate?: string;
  amount: number;
  paidAmount: number;
  status: string;
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  invoice: Invoice | null;
}

export default function ViewInvoiceModal({ isOpen, onClose, invoice }: Props) {
  if (!isOpen || !invoice) return null;

  const formatCurrency = (val: number) => `BDT ${val.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg overflow-hidden flex flex-col max-h-[90vh]">
        <div className="flex justify-between items-center p-4 border-b border-slate-100">
          <h3 className="font-bold text-slate-800">Invoice Details</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 transition-colors">
            <X size={20} />
          </button>
        </div>
        
        <div className="p-6 overflow-y-auto space-y-6">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-xs text-slate-500 uppercase tracking-wider font-semibold mb-1">Invoice Type</p>
              <p className="font-medium text-slate-900">{invoice.billType || "Standard Invoice"}</p>
            </div>
            <StatusChip status={invoice.status} />
          </div>

          <div className="grid grid-cols-2 gap-6">
            <div>
              <p className="text-xs text-slate-500 uppercase tracking-wider font-semibold mb-1">Bill Date</p>
              <p className="text-slate-800">{invoice.billDate || "—"}</p>
            </div>
            <div>
              <p className="text-xs text-slate-500 uppercase tracking-wider font-semibold mb-1">Due Date</p>
              <p className="text-slate-800">{invoice.dueDate || "—"}</p>
            </div>
          </div>

          <div className="border border-slate-200 rounded-lg p-4 bg-slate-50 space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-sm font-medium text-slate-600">Total Amount:</span>
              <span className="font-semibold text-slate-800">{formatCurrency(invoice.amount)}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm font-medium text-slate-600">Paid Amount:</span>
              <span className="font-semibold text-emerald-600">{formatCurrency(invoice.paidAmount)}</span>
            </div>
            <div className="border-t border-slate-200 pt-3 flex justify-between items-center">
              <span className="font-bold text-slate-800">Outstanding:</span>
              <span className="font-bold text-red-600">{formatCurrency((invoice.amount || 0) - (invoice.paidAmount || 0))}</span>
            </div>
          </div>
        </div>
        
        <div className="p-4 border-t border-slate-100 flex justify-end bg-slate-50 mt-auto">
          <button 
            onClick={onClose}
            className="px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-800 text-sm font-medium rounded-lg transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
