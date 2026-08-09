"use client";

import { useState } from "react";
import { Plus, Calculator, Settings, Edit, Trash2, Wallet, Layers, FileText } from "lucide-react";
import { 
  useProjectBoq, 
  useProjectPhases, 
  useCreateBoqItem,
  useDeleteBoqItem
} from "@/lib/hooks/useProjectBoq";
import AddBoqItemModal from "@/components/modals/AddBoqItemModal";
import ManagePhasesModal from "@/components/modals/ManagePhasesModal";

export default function BoqTab({ projectId, gov = false }: { projectId: string, gov?: boolean }) {
  const { data: boqItems = [], isLoading: loadingBoq } = useProjectBoq(projectId);
  const { data: phases = [], isLoading: loadingPhases } = useProjectPhases(projectId);
  const deleteBoq = useDeleteBoqItem();

  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isPhasesModalOpen, setIsPhasesModalOpen] = useState(false);

  if (loadingBoq || loadingPhases) {
    return <div className="p-8 text-slate-500">Loading BOQ data...</div>;
  }

  const formatCurrency = (val: number) => `BDT ${val.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  const totalAmount = boqItems.reduce((sum, item) => sum + (item.amount || 0), 0);
  const phaseTotal = (phaseId: string) => boqItems.filter(b => b.phaseId === phaseId).reduce((sum, item) => sum + (item.amount || 0), 0);

  const getPhaseName = (phaseId?: string) => {
    if (!phaseId) return "—";
    const p = phases.find(ph => ph.id === phaseId);
    return p ? p.name : "—";
  };

  return (
    <div className="">
      {/* Metrics */}
      <div className="flex flex-col md:flex-row gap-2 w-full mb-6">
        <div className="dash-kpi-card card cust-kpi-card flex-1 !p-4 !h-auto">
          <div className="dash-kpi-head items-center">
            <div className="dash-kpi-icon dash-kpi-icon--flat !bg-transparent">
              <img src="/assets/icons/dashboard/kpi-taka.svg" alt="Total Budget" className="w-10 h-10" />
            </div>
            <div className="dash-kpi-main">
              <span className="dash-kpi-label uppercase tracking-wider">Total Budget</span>
              <div className="dash-kpi-value">{formatCurrency(totalAmount)}</div>
            </div>
          </div>
        </div>
        
        <div className="dash-kpi-card card cust-kpi-card flex-1 !p-4 !h-auto">
          <div className="dash-kpi-head items-center">
            <div className="dash-kpi-icon dash-kpi-icon--flat !bg-transparent">
              <img src="/assets/icons/dashboard/approval-expense.svg" alt="Total Lines" className="w-10 h-10" />
            </div>
            <div className="dash-kpi-main">
              <span className="dash-kpi-label uppercase tracking-wider">Total Lines</span>
              <div className="dash-kpi-value">{boqItems.length}</div>
            </div>
          </div>
        </div>

        <div className="dash-kpi-card card cust-kpi-card flex-1 !p-4 !h-auto">
          <div className="dash-kpi-head items-center">
            <div className="dash-kpi-icon dash-kpi-icon--flat !bg-transparent">
              <img src="/assets/icons/dashboard/milestone-gear.svg" alt="Phases" className="w-10 h-10" />
            </div>
            <div className="dash-kpi-main">
              <span className="dash-kpi-label uppercase tracking-wider">Phases</span>
              <div className="dash-kpi-value">{phases.length}</div>
            </div>
          </div>
        </div>
        <div className="dash-kpi-card card cust-kpi-card flex-1 !p-4 !h-auto">
          <div className="dash-kpi-head items-center">
            <div className="dash-kpi-icon dash-kpi-icon--flat !bg-transparent">
              <img src="/assets/icons/dashboard/kpi-collection.svg" alt="Average Rate" className="w-10 h-10" />
            </div>
            <div className="dash-kpi-main">
              <span className="dash-kpi-label uppercase tracking-wider">Average Rate</span>
              <div className="dash-kpi-value">{boqItems.length > 0 ? formatCurrency(totalAmount / boqItems.length) : formatCurrency(0)}</div>
            </div>
          </div>
        </div>
      </div>

      {phases.length > 0 && (
        <section className="dash-widget dash-widget--projects card mb-8">
          <div className="dash-widget-head dash-widget-head--split">
            <div>
              <h3 className="dash-widget-title">Budget by Phase</h3>
              <p className="dash-widget-sub">Overview of costs segmented by project phases</p>
            </div>
          </div>
          <div className="table-wrap projects-table-wrap">
            <table className="dash-table projects-table w-full text-left whitespace-nowrap">
              <thead>
                <tr>
                  <th className="px-5 py-3">Phase</th>
                  <th className="px-5 py-3">Budget</th>
                </tr>
              </thead>
              <tbody>
                {phases.map(p => (
                  <tr key={p.id}>
                    <td className="px-5 py-3 font-medium">{p.name}</td>
                    <td className="px-5 py-3 font-medium">{formatCurrency(phaseTotal(p.id))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* BOQ Table */}
      <section className="dash-widget dash-widget--projects card mb-8">
        <div className="dash-widget-head dash-widget-head--split">
          <div>
            <h3 className="dash-widget-title flex items-center gap-2"><Calculator size={18} className="text-slate-500" /> Bill of Quantities (BOQ)</h3>
            <p className="dash-widget-sub">Manage line items, quantities, and rates</p>
          </div>
          <div className="flex gap-2">
            <button 
              onClick={() => setIsPhasesModalOpen(true)}
              className="btn btn-edit btn-sm flex items-center gap-2 cursor-pointer"
            >
              <Settings size={16} /> Manage Phases
            </button>
            <button 
              onClick={() => setIsAddModalOpen(true)}
              className="btn btn-primary btn-sm flex items-center gap-2 cursor-pointer"
            >
              <Plus size={16} /> Add Line Item
            </button>
          </div>
        </div>
        <div className="table-wrap projects-table-wrap">
          <table className="dash-table projects-table w-full text-left whitespace-nowrap">
            <thead>
              <tr>
                {gov && <th className="px-5 py-3">Code</th>}
                <th className="px-5 py-3">Item</th>
                <th className="px-5 py-3">Phase</th>
                <th className="px-5 py-3">Unit</th>
                <th className="px-5 py-3">Qty</th>
                <th className="px-5 py-3">Rate</th>
                <th className="px-5 py-3">Amount</th>
                {gov && <th className="px-5 py-3">Rev</th>}
                <th className="px-5 py-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {boqItems.length === 0 ? (
                <tr>
                  <td colSpan={gov ? 9 : 7} className="px-5 py-8 text-center text-slate-500">
                    No BOQ lines added yet.
                  </td>
                </tr>
              ) : (
                boqItems.map(item => (
                  <tr key={item.id}>
                    {gov && <td className="px-5 py-3 font-medium text-slate-500">{item.itemCode || "—"}</td>}
                    <td className="px-5 py-3 font-medium text-slate-900">{item.item}</td>
                    <td className="px-5 py-3 text-slate-600">{getPhaseName(item.phaseId)}</td>
                    <td className="px-5 py-3 text-slate-600">{item.unit || "—"}</td>
                    <td className="px-5 py-3 text-slate-600">{item.qty}</td>
                    <td className="px-5 py-3 text-slate-600">{formatCurrency(item.rate)}</td>
                    <td className="px-5 py-3 font-medium text-slate-800">{formatCurrency(item.amount)}</td>
                    {gov && <td className="px-5 py-3 text-slate-600">{item.revision || "-"}</td>}
                    <td className="px-5 py-3">
                      <div className="flex justify-end gap-2">
                        <button className="text-slate-400 hover:text-indigo-600 transition-colors">
                          <Edit size={16} />
                        </button>
                        <button 
                          onClick={() => deleteBoq.mutate({ id: item.id, projectId })}
                          className="text-slate-400 hover:text-red-600 transition-colors"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
            {boqItems.length > 0 && (
              <tfoot className="bg-slate-50 border-t border-slate-200 font-bold text-slate-800">
                <tr>
                  <td colSpan={gov ? 6 : 4} className="px-5 py-3 font-bold text-slate-700">Total:</td>
                  <td className="px-5 py-3 text-indigo-700 font-bold">{formatCurrency(totalAmount)}</td>
                  {gov && <td></td>}
                  <td></td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </section>
      
      <AddBoqItemModal 
        isOpen={isAddModalOpen} 
        onClose={() => setIsAddModalOpen(false)} 
        projectId={projectId} 
      />
      <ManagePhasesModal
        isOpen={isPhasesModalOpen}
        onClose={() => setIsPhasesModalOpen(false)}
        projectId={projectId}
      />
    </div>
  );
}
