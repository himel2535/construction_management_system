"use client";

import { useState } from "react";
import { Plus, Check, MoreVertical, Shield, Users, CheckSquare, CheckCircle, Percent } from "lucide-react";
import { 
  useProjectTeamAssignments, 
  useProjectTasks, 
  useUsers,
  useEndTeamAssignment,
  useUpdateTask
} from "@/lib/hooks/useProjectTeam";
import { StatusChip } from "@/components/ui/StatusPill";
import AssignTeamModal from "@/components/modals/AssignTeamModal";
import AddTaskModal from "@/components/modals/AddTaskModal";

export default function TeamTab({ projectId }: { projectId: string }) {
  const { data: assignments = [], isLoading: loadingAssignments } = useProjectTeamAssignments(projectId);
  const { data: tasks = [], isLoading: loadingTasks } = useProjectTasks(projectId);
  const { data: users = [], isLoading: loadingUsers } = useUsers();
  const endAssignment = useEndTeamAssignment();
  const updateTask = useUpdateTask();

  const [isAssignModalOpen, setIsAssignModalOpen] = useState(false);
  const [isTaskModalOpen, setIsTaskModalOpen] = useState(false);

  if (loadingAssignments || loadingTasks || loadingUsers) {
    return <div className="p-8 text-slate-500">Loading team data...</div>;
  }

  const activeAssignments = assignments.filter(a => a.status !== "ended");
  const openTasks = tasks.filter(t => t.status !== "done").length;
  const doneTasks = tasks.filter(t => t.status === "done").length;
  const avgAlloc = activeAssignments.length 
    ? Math.round(activeAssignments.reduce((acc, a) => acc + (a.allocationPercent || 0), 0) / activeAssignments.length)
    : 0;

  const getUserName = (userId: string) => {
    const user = users.find(u => u.id === userId);
    return user ? user.displayName || user.email : userId;
  };

  const getRoleLabel = (role?: string) => {
    if (!role) return "—";
    return role.split("_").map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
  };

  return (
    <div className="">
      {/* Metrics */}
      <div className="flex flex-col md:flex-row gap-2 w-full mb-6">
        <div className="dash-kpi-card card cust-kpi-card flex-1 !p-4 !h-auto">
          <div className="dash-kpi-head items-center">
            <div className="dash-kpi-icon dash-kpi-icon--flat !bg-transparent">
              <img src="/assets/icons/dashboard/kpi-projects.svg" alt="Active Members" className="w-10 h-10" />
            </div>
            <div className="dash-kpi-main">
              <span className="dash-kpi-label uppercase tracking-wider">Active Members</span>
              <div className="dash-kpi-value">{activeAssignments.length}</div>
            </div>
          </div>
        </div>
        
        <div className="dash-kpi-card card cust-kpi-card flex-1 !p-4 !h-auto">
          <div className="dash-kpi-head items-center">
            <div className="dash-kpi-icon dash-kpi-icon--flat !bg-transparent">
              <img src="/assets/icons/dashboard/approval-requisition.svg" alt="Open Tasks" className="w-10 h-10" />
            </div>
            <div className="dash-kpi-main">
              <span className="dash-kpi-label uppercase tracking-wider">Open Tasks</span>
              <div className="dash-kpi-value">{openTasks}</div>
            </div>
          </div>
        </div>

        <div className="dash-kpi-card card cust-kpi-card flex-1 !p-4 !h-auto">
          <div className="dash-kpi-head items-center">
            <div className="dash-kpi-icon dash-kpi-icon--flat !bg-transparent">
              <img src="/assets/icons/dashboard/attention-approval.svg" alt="Completed Tasks" className="w-10 h-10" />
            </div>
            <div className="dash-kpi-main">
              <span className="dash-kpi-label uppercase tracking-wider">Completed</span>
              <div className="dash-kpi-value">{doneTasks}</div>
            </div>
          </div>
        </div>

        <div className="dash-kpi-card card cust-kpi-card flex-1 !p-4 !h-auto">
          <div className="dash-kpi-head items-center">
            <div className="dash-kpi-icon dash-kpi-icon--flat !bg-transparent">
              <img src="/assets/icons/dashboard/kpi-collection.svg" alt="Avg Allocation" className="w-10 h-10" />
            </div>
            <div className="dash-kpi-main">
              <span className="dash-kpi-label uppercase tracking-wider">Avg Allocation</span>
              <div className="dash-kpi-value">{avgAlloc}%</div>
            </div>
          </div>
        </div>
      </div>

      {/* Roster Table */}
      <section className="dash-widget dash-widget--projects card mb-8">
        <div className="dash-widget-head dash-widget-head--split">
          <div>
            <h3 className="dash-widget-title">Team Roster</h3>
            <p className="dash-widget-sub">Manage assigned team members</p>
          </div>
          <button 
            onClick={() => setIsAssignModalOpen(true)}
            className="btn btn-primary btn-sm flex items-center gap-2 cursor-pointer"
          >
            <Plus size={16} /> Add to team
          </button>
        </div>
        <div className="table-wrap projects-table-wrap">
          <table className="dash-table projects-table w-full text-left whitespace-nowrap">
            <thead>
              <tr>
                <th className="px-5 py-3">Member</th>
                <th className="px-5 py-3">Role</th>
                <th className="px-5 py-3">RACI</th>
                <th className="px-5 py-3">%</th>
                <th className="px-5 py-3">Start</th>
                <th className="px-5 py-3">End</th>
                <th className="px-5 py-3">Status</th>
                <th className="px-5 py-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {activeAssignments.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-5 py-8 text-slate-500">
                    No team members assigned yet.
                  </td>
                </tr>
              ) : (
                activeAssignments.map(a => (
                  <tr key={a.id} className="hover:bg-slate-50/50">
                    <td className="px-5 py-3 font-medium text-slate-900">{getUserName(a.userId)}</td>
                    <td className="px-5 py-3 text-slate-600">{getRoleLabel(a.role)}</td>
                    <td className="px-5 py-3 text-slate-600">{a.raci || "—"}</td>
                    <td className="px-5 py-3 text-slate-600">{a.allocationPercent}%</td>
                    <td className="px-5 py-3 text-slate-600">{a.startDate || "—"}</td>
                    <td className="px-5 py-3 text-slate-600">{a.endDate || "—"}</td>
                    <td className="px-5 py-3"><StatusChip status={a.status} /></td>
                    <td className="px-5 py-3 text-right">
                      <button 
                        onClick={() => endAssignment.mutate({ id: a.id, projectId })}
                        className="text-red-500 hover:text-red-700 text-sm font-medium"
                      >
                        End
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* Tasks Table */}
      <section className="dash-widget dash-widget--projects card">
        <div className="dash-widget-head dash-widget-head--split">
          <div>
            <h3 className="dash-widget-title">Tasks & Delegation</h3>
            <p className="dash-widget-sub">Track and assign project tasks</p>
          </div>
          <button 
            onClick={() => setIsTaskModalOpen(true)}
            className="btn btn-primary btn-sm flex items-center gap-2 cursor-pointer"
          >
            <Plus size={16} /> Add task
          </button>
        </div>
        <div className="table-wrap projects-table-wrap">
          <table className="dash-table projects-table w-full text-left whitespace-nowrap">
            <thead>
              <tr>
                <th className="px-5 py-3">Task</th>
                <th className="px-5 py-3">Assignee</th>
                <th className="px-5 py-3">RACI</th>
                <th className="px-5 py-3">Priority</th>
                <th className="px-5 py-3">Deadline</th>
                <th className="px-5 py-3">Status</th>
                <th className="px-5 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {tasks.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-5 py-8 text-center text-slate-500">
                    No tasks assigned yet.
                  </td>
                </tr>
              ) : (
                tasks.map(t => (
                  <tr key={t.id} className="hover:bg-slate-50/50">
                    <td className="px-5 py-3 font-medium text-slate-900">{t.title}</td>
                    <td className="px-5 py-3 text-slate-600">{t.assigneeUserId ? getUserName(t.assigneeUserId) : "Unassigned"}</td>
                    <td className="px-5 py-3 text-slate-600">{t.raci || "—"}</td>
                    <td className="px-5 py-3">
                      <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                        t.priority === 'high' ? 'bg-red-100 text-red-700' :
                        t.priority === 'low' ? 'bg-slate-100 text-slate-700' :
                        'bg-amber-100 text-amber-700'
                      }`}>
                        {t.priority.toUpperCase()}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-slate-600">{t.deadline || "—"}</td>
                    <td className="px-5 py-3"><StatusChip status={t.status} /></td>
                    <td className="px-5 py-3 text-right">
                      {t.status !== "done" && (
                        <button 
                          onClick={() => updateTask.mutate({ id: t.id, projectId, data: { status: "done" } })}
                          className="text-indigo-600 hover:text-indigo-800 text-sm font-medium mr-3"
                        >
                          Mark Done
                        </button>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      <AssignTeamModal
        isOpen={isAssignModalOpen}
        onClose={() => setIsAssignModalOpen(false)}
        projectId={projectId}
      />
      <AddTaskModal
        isOpen={isTaskModalOpen}
        onClose={() => setIsTaskModalOpen(false)}
        projectId={projectId}
      />
    </div>
  );
}
