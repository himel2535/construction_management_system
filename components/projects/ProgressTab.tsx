"use client";

import { useState } from "react";
import { Activity, Plus, FileText, ClipboardList, Layers, Clock } from "lucide-react";
import Loader from "@/components/ui/Loader";
import { useProjectProgress } from "@/lib/hooks/useProjectProgress";
import { useProjectBoq } from "@/lib/hooks/useProjectBoq";
import LogProgressModal from "@/components/modals/LogProgressModal";

export default function ProgressTab({ projectId }: { projectId: string }) {
  const { data: progress = [], isLoading: loadingProgress } = useProjectProgress(projectId);
  const { data: boqItems = [], isLoading: loadingBoq } = useProjectBoq(projectId);

  const [isModalOpen, setIsModalOpen] = useState(false);

  if (loadingProgress || loadingBoq) {
    return <div className="p-8 flex justify-center"><Loader text="Loading progress data..." /></div>;
  }

  const getBoqName = (boqId?: string) => {
    if (!boqId) return "General Activity";
    const b = boqItems.find(item => item.id === boqId);
    return b ? b.item : "Unknown BOQ";
  };

  const totalExecuted = progress.reduce((sum, p) => sum + (p.executedQty || 0), 0);
  const latestUpdates = [...progress].sort((a, b) => new Date(b.progressDate).getTime() - new Date(a.progressDate).getTime()).slice(0, 5);

  return (
    <div className="">
      <div className="flex flex-col md:flex-row gap-2 w-full mb-6">
        <div className="dash-kpi-card card cust-kpi-card flex-1 !p-4 !h-auto">
          <div className="dash-kpi-head items-center">
            <div className="dash-kpi-icon dash-kpi-icon--flat !bg-transparent">
              <img src="/assets/icons/dashboard/attention-warning.svg" alt="Total Progress Entries" className="w-10 h-10" />
            </div>
            <div className="dash-kpi-main">
              <span className="dash-kpi-label uppercase tracking-wider">Total Progress Entries</span>
              <div className="dash-kpi-value">{progress.length}</div>
            </div>
          </div>
        </div>
        
        <div className="dash-kpi-card card cust-kpi-card flex-1 !p-4 !h-auto">
          <div className="dash-kpi-head items-center">
            <div className="dash-kpi-icon dash-kpi-icon--flat !bg-transparent">
              <img src="/assets/icons/dashboard/kpi-collection.svg" alt="Total Executed Qty" className="w-10 h-10" />
            </div>
            <div className="dash-kpi-main">
              <span className="dash-kpi-label uppercase tracking-wider">Total Executed Qty</span>
              <div className="dash-kpi-value">{totalExecuted}</div>
            </div>
          </div>
        </div>

        <div className="dash-kpi-card card cust-kpi-card flex-1 !p-4 !h-auto">
          <div className="dash-kpi-head items-center">
            <div className="dash-kpi-icon dash-kpi-icon--flat !bg-transparent">
              <img src="/assets/icons/dashboard/attention-payment.svg" alt="Recent Activity" className="w-10 h-10" />
            </div>
            <div className="dash-kpi-main">
              <span className="dash-kpi-label uppercase tracking-wider">Recent Activity</span>
              <div className="dash-kpi-value">{latestUpdates.length > 0 ? latestUpdates[0].progressDate : "—"}</div>
            </div>
          </div>
        </div>
        <div className="dash-kpi-card card cust-kpi-card flex-1 !p-4 !h-auto">
          <div className="dash-kpi-head items-center">
            <div className="dash-kpi-icon dash-kpi-icon--flat !bg-transparent">
              <img src="/assets/icons/dashboard/attention-approval.svg" alt="Average Execution" className="w-10 h-10" />
            </div>
            <div className="dash-kpi-main">
              <span className="dash-kpi-label uppercase tracking-wider">Average Execution</span>
              <div className="dash-kpi-value">{progress.length > 0 ? (totalExecuted / progress.length).toFixed(1) : 0}</div>
            </div>
          </div>
        </div>
      </div>

      <section className="dash-widget dash-widget--projects card mb-8">
        <div className="dash-widget-head dash-widget-head--split">
          <div>
            <h3 className="dash-widget-title flex items-center gap-2"><Activity size={18} className="text-slate-500" /> Physical Progress & Measurements</h3>
            <p className="dash-widget-sub">Log daily or weekly progress of BOQ lines</p>
          </div>
          <button 
            onClick={() => setIsModalOpen(true)}
            className="btn btn-primary btn-sm flex items-center gap-2 cursor-pointer"
          >
            <Plus size={16} /> Log Progress
          </button>
        </div>
        <div className="table-wrap projects-table-wrap">
          <table className="dash-table projects-table w-full text-left whitespace-nowrap">
            <thead>
              <tr>
                <th className="px-5 py-3">Date</th>
                <th className="px-5 py-3">Activity / BOQ Line</th>
                <th className="px-5 py-3">Executed Qty</th>
                <th className="px-5 py-3">Planned Qty</th>
                <th className="px-5 py-3">Remarks</th>
              </tr>
            </thead>
            <tbody>
              {progress.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-5 py-8 text-slate-500">
                    No progress logged yet.
                  </td>
                </tr>
              ) : (
                progress.map(p => (
                  <tr key={p.id}>
                    <td className="px-5 py-3 text-slate-600 font-medium">{p.progressDate}</td>
                    <td className="px-5 py-3 font-medium text-slate-900">
                      {p.activity || getBoqName(p.boqId)}
                    </td>
                    <td className="px-5 py-3 text-slate-900 font-semibold text-indigo-600">{p.executedQty}</td>
                    <td className="px-5 py-3 text-slate-600">{p.plannedQty}</td>
                    <td className="px-5 py-3 text-slate-500 truncate max-w-[250px]">{p.remarks || "—"}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      <LogProgressModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        projectId={projectId}
      />
    </div>
  );
}
