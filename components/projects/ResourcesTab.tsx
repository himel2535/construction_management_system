"use client";

import { useState } from "react";
import { HardHat, Truck, Plus, Users, ClipboardList, Wallet } from "lucide-react";
import Loader from "@/components/ui/Loader";
import { 
  useProjectEquipment, 
  useProjectWorkers 
} from "@/lib/hooks/useProjectResources";
import { StatusChip } from "@/components/ui/StatusPill";
import AddEquipmentModal from "@/components/modals/AddEquipmentModal";
import AssignWorkerModal from "@/components/modals/AssignWorkerModal";

export default function ResourcesTab({ projectId }: { projectId: string }) {
  const { data: equipmentLogs = [], isLoading: loadingEq } = useProjectEquipment(projectId);
  const { data: workers = [], isLoading: loadingWorkers } = useProjectWorkers(projectId);

  const [isEqModalOpen, setIsEqModalOpen] = useState(false);
  const [isWorkerModalOpen, setIsWorkerModalOpen] = useState(false);

  if (loadingEq || loadingWorkers) {
    return <div className="p-8 flex justify-center"><Loader text="Loading resources data..." /></div>;
  }

  const formatCurrency = (val: number) => `BDT ${val.toLocaleString()}`;

  const activeWorkers = workers.filter(w => w.status === "active").length;
  const eqSpend = equipmentLogs.reduce((sum, e) => sum + (e.cost || 0), 0);
  const totalHours = equipmentLogs.reduce((sum, e) => sum + (e.hours || 0), 0);

  return (
    <div className="">
      {/* Metrics */}
      <div className="flex flex-col md:flex-row gap-2 w-full mb-6">
        <div className="dash-kpi-card card cust-kpi-card flex-1 !p-4 !h-auto">
          <div className="dash-kpi-head items-center">
            <div className="dash-kpi-icon dash-kpi-icon--flat !bg-transparent">
              <img src="/assets/icons/dashboard/kpi-projects.svg" alt="Total Workers" className="w-10 h-10" />
            </div>
            <div className="dash-kpi-main">
              <span className="dash-kpi-label uppercase tracking-wider">Total Workers</span>
              <div className="dash-kpi-value">{workers.length}</div>
            </div>
          </div>
        </div>
        
        <div className="dash-kpi-card card cust-kpi-card flex-1 !p-4 !h-auto">
          <div className="dash-kpi-head items-center">
            <div className="dash-kpi-icon dash-kpi-icon--flat !bg-transparent">
              <img src="/assets/icons/dashboard/attention-materials.svg" alt="Active Workers" className="w-10 h-10" />
            </div>
            <div className="dash-kpi-main">
              <span className="dash-kpi-label uppercase tracking-wider">Active Workers</span>
              <div className="dash-kpi-value">{activeWorkers}</div>
            </div>
          </div>
        </div>

        <div className="dash-kpi-card card cust-kpi-card flex-1 !p-4 !h-auto">
          <div className="dash-kpi-head items-center">
            <div className="dash-kpi-icon dash-kpi-icon--flat !bg-transparent">
              <img src="/assets/icons/dashboard/approval-material.svg" alt="Equipment Logs" className="w-10 h-10" />
            </div>
            <div className="dash-kpi-main">
              <span className="dash-kpi-label uppercase tracking-wider">Equipment Logs</span>
              <div className="dash-kpi-value">{equipmentLogs.length}</div>
            </div>
          </div>
        </div>

        <div className="dash-kpi-card card cust-kpi-card flex-1 !p-4 !h-auto">
          <div className="dash-kpi-head items-center">
            <div className="dash-kpi-icon dash-kpi-icon--flat !bg-transparent">
              <img src="/assets/icons/dashboard/kpi-contract.svg" alt="Total Eq Spend" className="w-10 h-10" />
            </div>
            <div className="dash-kpi-main">
              <span className="dash-kpi-label uppercase tracking-wider">Total Eq Spend</span>
              <div className="dash-kpi-value">{formatCurrency(eqSpend)}</div>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Workers Table */}
        <section className="dash-widget dash-widget--projects card">
          <div className="dash-widget-head dash-widget-head--split">
            <div>
              <h3 className="dash-widget-title flex items-center gap-2"><HardHat size={18} className="text-slate-500" /> Assigned Workers</h3>
              <p className="dash-widget-sub">Manage project labor</p>
            </div>
            <button 
              onClick={() => setIsWorkerModalOpen(true)}
              className="btn btn-primary btn-sm flex items-center gap-2 cursor-pointer"
            >
              <Plus size={16} /> Assign Worker
            </button>
          </div>
          <div className="table-wrap projects-table-wrap max-h-[400px] overflow-y-auto">
            <table className="dash-table projects-table w-full text-left whitespace-nowrap">
              <thead className="sticky top-0 bg-white shadow-[0_1px_0_rgba(226,232,240,1)]">
                <tr>
                  <th className="px-5 py-3">Name</th>
                  <th className="px-5 py-3">Category</th>
                  <th className="px-5 py-3">Daily Rate</th>
                  <th className="px-5 py-3">Status</th>
                </tr>
              </thead>
              <tbody>
                {workers.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-5 py-8 text-slate-500">
                      No workers assigned to this project yet.
                    </td>
                  </tr>
                ) : (
                  workers.map(w => (
                    <tr key={w.id} className="hover:bg-slate-50/50">
                      <td className="px-5 py-3 font-medium text-slate-900">{w.name}</td>
                      <td className="px-5 py-3 text-slate-600">{w.category || w.trade || "—"}</td>
                      <td className="px-5 py-3 text-slate-600">{formatCurrency(w.dailyRate)}</td>
                      <td className="px-5 py-3"><StatusChip status={w.status} /></td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>

        {/* Equipment Logs Table */}
        <section className="dash-widget dash-widget--projects card">
          <div className="dash-widget-head dash-widget-head--split">
            <div>
              <h3 className="dash-widget-title flex items-center gap-2"><Truck size={18} className="text-slate-500" /> Equipment Logs</h3>
              <p className="dash-widget-sub">Track equipment usage and cost</p>
            </div>
            <button 
              onClick={() => setIsEqModalOpen(true)}
              className="btn btn-primary btn-sm flex items-center gap-2 cursor-pointer"
            >
              <Plus size={16} /> Add Equipment
            </button>
          </div>
          <div className="table-wrap projects-table-wrap max-h-[400px] overflow-y-auto">
            <table className="dash-table projects-table w-full text-left whitespace-nowrap">
              <thead className="sticky top-0 bg-white shadow-[0_1px_0_rgba(226,232,240,1)]">
                <tr>
                  <th className="px-5 py-3">Date</th>
                  <th className="px-5 py-3">Equipment</th>
                  <th className="px-5 py-3">Hours</th>
                  <th className="px-5 py-3">Cost</th>
                </tr>
              </thead>
              <tbody>
                {equipmentLogs.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-5 py-8 text-slate-500">
                      No equipment logs found.
                    </td>
                  </tr>
                ) : (
                  equipmentLogs.map(e => (
                    <tr key={e.id} className="hover:bg-slate-50/50">
                      <td className="px-5 py-3 text-slate-600">{e.logDate}</td>
                      <td className="px-5 py-3 font-medium text-slate-900">{e.equipmentName}</td>
                      <td className="px-5 py-3 text-slate-600">{e.hours}</td>
                      <td className="px-5 py-3 text-slate-600">{formatCurrency(e.cost)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>

      <AddEquipmentModal
        isOpen={isEqModalOpen}
        onClose={() => setIsEqModalOpen(false)}
        projectId={projectId}
      />
      <AssignWorkerModal
        isOpen={isWorkerModalOpen}
        onClose={() => setIsWorkerModalOpen(false)}
        projectId={projectId}
      />
    </div>
  );
}
