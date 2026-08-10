"use client";

import { useState } from "react";
import Link from "next/link";
import { 
  FolderKanban, 
  Plus, 
  Search, 
  Eye, 
  CheckCircle2, 
  Clock, 
  TrendingUp,
  X,
  RotateCcw,
  Download
} from "lucide-react";
import Loader from "@/components/ui/Loader";
import { useProjects } from "@/lib/hooks/useProjects";
import { Project, ProjectSchema } from "@/lib/schemas";
import Sparkline from "@/components/ui/Sparkline";
import Avatar from "@/components/ui/Avatar";
import { TypePill, HealthPill, StatusChip } from "@/components/ui/StatusPill";

export default function ProjectsPage() {
  const { data: projects = [], isLoading, isError, error } = useProjects();

  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [typeFilter, setTypeFilter] = useState<string>("all");

  const filteredProjects = projects.filter((project) => {
    const matchesSearch = 
      project.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (project.clientName && project.clientName.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (project.code && project.code.toLowerCase().includes(searchQuery.toLowerCase()));
    const matchesStatus = statusFilter === "all" || project.status === statusFilter;
    const matchesType = typeFilter === "all" || project.projectType === typeFilter;
    return matchesSearch && matchesStatus && matchesType;
  });

  const totalCount = projects.length;
  const ongoingCount = projects.filter(p => (p.status || "ongoing") === "ongoing").length;
  const govCount = projects.filter(p => (p.projectType || "private") === "government" || p.projectType === "government_civil").length;
  const privCount = projects.filter(p => (p.projectType || "private") === "private" || p.projectType === "private_civil").length;
  const totalBudgetSum = projects.reduce((sum, p) => sum + (p.contractValue || 0), 0);
  
  const govPct = totalCount ? Math.round((govCount / totalCount) * 100) : 0;

  // Format compact BDT
  const formatCompactBDT = (val: number) => {
    if (!val) return "BDT 0";
    if (val >= 10000000) return `BDT ${(val / 10000000).toFixed(2)} Cr`;
    if (val >= 100000) return `BDT ${(val / 100000).toFixed(2)} L`;
    return `BDT ${val.toLocaleString()}`;
  };

  return (
    <div className="projects-page dashboard-page dashboard-mockup">
      {/* Metrics Row */}
      <div className="dash-kpi-row">
        {/* Total Projects */}
        <div className="dash-kpi-card card cust-kpi-card cust-kpi-card--yellow">
          <div className="cust-kpi-spark">
            <Sparkline values={[2, 3, 4, totalCount || 1, totalCount || 2, totalCount || 3, totalCount || 4]} tone="yellow" />
          </div>
          <div className="dash-kpi-head">
            <div className="dash-kpi-icon dash-kpi-icon--flat !bg-transparent">
              <img src="/assets/icons/dashboard/kpi-projects.svg" alt="Projects" className="w-10 h-10" />
            </div>
            <div className="dash-kpi-main">
              <span className="dash-kpi-label">Total Projects</span>
              <div className="dash-kpi-value">{totalCount}</div>
            </div>
          </div>
          <div className="dash-kpi-foot">
            <div className="dash-kpi-foot-left">
              {totalCount ? `${ongoingCount} ongoing` : "No projects yet"}
            </div>
          </div>
        </div>

        {/* Ongoing */}
        <div className="dash-kpi-card card cust-kpi-card">
          <div className="cust-kpi-spark">
            <Sparkline values={[1, 2, ongoingCount || 1, ongoingCount || 2, ongoingCount, ongoingCount, ongoingCount]} tone="green" />
          </div>
          <div className="dash-kpi-head">
            <div className="dash-kpi-icon dash-kpi-icon--flat !bg-transparent">
              <img src="/assets/icons/dashboard/kpi-collection.svg" alt="Ongoing" className="w-10 h-10" />
            </div>
            <div className="dash-kpi-main">
              <span className="dash-kpi-label">Ongoing</span>
              <div className="dash-kpi-value">{ongoingCount}</div>
            </div>
          </div>
          <div className="dash-kpi-foot">
            <div className="dash-kpi-foot-left">
              {totalCount ? `${Math.round((ongoingCount / totalCount) * 100)}% of portfolio` : "No ongoing projects"}
            </div>
          </div>
        </div>

        {/* Government */}
        <div className="dash-kpi-card card cust-kpi-card">
          <div className="cust-kpi-spark">
            <Sparkline values={[0, 1, govCount || 1, govCount || 2, govCount, govCount, govCount]} tone="orange" />
          </div>
          <div className="dash-kpi-head">
            <div className="dash-kpi-icon dash-kpi-icon--flat !bg-transparent">
              <img src="/assets/icons/dashboard/milestone-building.svg" alt="Government" className="w-10 h-10" />
            </div>
            <div className="dash-kpi-main">
              <span className="dash-kpi-label">Government</span>
              <div className="dash-kpi-value">{govCount}</div>
            </div>
          </div>
          <div className="dash-kpi-foot">
            <div className="dash-kpi-foot-left">
              {totalCount ? `${govPct}% government` : "No gov projects"}
            </div>
          </div>
        </div>

        {/* Private / Local */}
        <div className="dash-kpi-card card cust-kpi-card">
          <div className="cust-kpi-spark">
            <Sparkline values={[privCount || 1, privCount || 2, privCount, privCount, privCount, privCount, privCount]} tone="teal" />
          </div>
          <div className="dash-kpi-head">
            <div className="dash-kpi-icon dash-kpi-icon--flat !bg-transparent">
              <img src="/assets/icons/dashboard/milestone-home.svg" alt="Private" className="w-10 h-10" />
            </div>
            <div className="dash-kpi-main">
              <span className="dash-kpi-label">Private / Local</span>
              <div className="dash-kpi-value">{privCount}</div>
            </div>
          </div>
          <div className="dash-kpi-foot">
            <div className="dash-kpi-foot-left">
              {totalCount ? `${privCount} private` : "No private projects"}
            </div>
          </div>
        </div>

        {/* Total Budget */}
        <div className="dash-kpi-card card cust-kpi-card">
          <div className="cust-kpi-spark">
            <Sparkline values={[totalBudgetSum ? 4 : 2, 3, totalBudgetSum ? 5 : 2, 4, 3, 2, 2]} tone="blue" />
          </div>
          <div className="dash-kpi-head">
            <div className="dash-kpi-icon dash-kpi-icon--flat !bg-transparent">
              <img src="/assets/icons/dashboard/kpi-taka.svg" alt="Budget" className="w-10 h-10" />
            </div>
            <div className="dash-kpi-main">
              <span className="dash-kpi-label">Total Budget</span>
              <div className="dash-kpi-value">{formatCompactBDT(totalBudgetSum)}</div>
            </div>
          </div>
          <div className="dash-kpi-foot">
            <div className="dash-kpi-foot-left">
              {totalCount ? `Across ${totalCount} project${totalCount === 1 ? "" : "s"}` : "No budget recorded"}
            </div>
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      <section className="dash-widget dash-widget--projects card mt-4">
        {/* Header Title */}
        <div className="dash-widget-head dash-widget-head--split">
          <div>
            <h3 className="dash-widget-title">Project Directory</h3>
            <p className="dash-widget-sub">Search, filter, and open projects</p>
          </div>
          <span className="cust-toolbar-count">Showing {filteredProjects.length} projects</span>
        </div>
        
        <div className="dash-widget-body">
          {/* Toolbar */}
          <div className="toolbar-row customers-toolbar">
            <div className="toolbar-filters">
              <select 
                className="toolbar-select"
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
              >
                <option value="all">All statuses</option>
                <option value="ongoing">Ongoing</option>
                <option value="planning">Planning</option>
                <option value="completed">Completed</option>
                <option value="on-hold">On Hold</option>
              </select>
              
              <select 
                className="toolbar-select"
                value={typeFilter}
                onChange={(e) => setTypeFilter(e.target.value)}
              >
                <option value="all">All types</option>
                <option value="government">Government</option>
                <option value="private">Private</option>
              </select>
            </div>
            
            <div className="toolbar-actions">
              <div className="cust-toolbar-search toolbar-search">
                <span className="search-icon" aria-hidden="true"><Search size={16} /></span>
                <input 
                  type="search" 
                  className="cust-toolbar-search-input" 
                  placeholder="Search name or code..." 
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>
              <div className="cust-toolbar-btn-group">
                <button 
                  type="button" 
                  className="btn btn-secondary btn-sm cust-toolbar-btn cust-toolbar-btn--clear"
                  onClick={() => { setSearchQuery(""); setStatusFilter("all"); setTypeFilter("all"); }}
                >
                  <RotateCcw size={14} className="mr-1" /> Clear
                </button>
                <button type="button" className="btn btn-secondary btn-sm cust-toolbar-btn cust-toolbar-btn--export">
                  <Download size={14} className="mr-1" /> Export
                </button>
                <Link 
                  href="/projects/add" 
                  className="btn btn-primary btn-sm bg-slate-900 text-white hover:bg-slate-800 border-none flex items-center gap-1"
                >
                  <Plus size={16} /> New Project
                </Link>
              </div>
            </div>
          </div>
          
          {/* Table */}
          <div className="table-wrap projects-table-wrap">
            <table className="dash-table proj-table">
              <thead>
                <tr>
                  <th className="col-num">#</th>
                  <th>PROJECT</th>
                  <th className="cust-col-center">TYPE</th>
                  <th>CLIENT</th>
                  <th className="cust-col-center">PM</th>
                  <th className="cust-col-center">PROGRESS</th>
                  <th className="cust-col-center">STATUS</th>
                  <th className="cust-col-center">HEALTH</th>
                  <th className="cust-col-center">ACTIONS</th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  <tr><td colSpan={9} className="text-center p-8"><Loader text="Loading projects..." /></td></tr>
                ) : filteredProjects.length === 0 ? (
                   <tr><td colSpan={9} className="text-center p-8 text-slate-500">No projects found matching filters.</td></tr>
                ) : filteredProjects.map((project, idx) => (
                  <tr key={project.id || project.name} className="cust-row proj-dir-row hover:bg-slate-50 transition-colors">
                    <td className="col-num">{idx + 1}</td>
                    <td>
                      <div className="cell-user cust-client-cell flex items-center gap-3">
                        <Avatar name={project.name} size="sm" />
                        <div className="cell-user-text">
                          <strong className="text-slate-900 font-semibold">{project.name}</strong>
                          {project.code && <span className="text-muted cust-contact-sub block text-xs">{project.code}</span>}
                        </div>
                      </div>
                    </td>
                    <td className="cust-col-center"><TypePill type={project.projectType} /></td>
                    <td>{project.clientName || <span className="text-muted">—</span>}</td>
                    <td className="cust-col-center">{project.projectManagerId ? "Demo User" : <span className="text-muted">—</span>}</td>
                    <td className="cust-col-center w-32">
                      <div className="proj-dir-progress text-xs text-slate-500 text-center">
                        <div className="w-full bg-slate-200 h-1.5 rounded-full mb-1">
                          <div className="bg-slate-400 h-full rounded-full" style={{ width: `${project.progressPercent || 0}%` }} />
                        </div>
                        {project.progressPercent || 0}%
                      </div>
                    </td>
                    <td className="cust-col-center"><StatusChip status={project.status || "ongoing"} /></td>
                    <td className="cust-col-center">
                       {/* Simplified health calculation logic based on status since we don't have full milestone calculation in frontend atm */}
                       <HealthPill health={project.status === "delayed" || project.status === "on-hold" ? "delayed" : project.status === "ongoing" && (project.progressPercent || 0) < 20 ? "at_risk" : "on_track"} />
                    </td>
                    <td className="cust-col-center">
                      <div className="table-actions table-actions--cust">
                        <Link href={`/projects/${project.id || project.name}`} className="icon-btn icon-btn--sm proj-view text-slate-400 hover:text-slate-600 flex items-center justify-center">
                          <Eye size={16} />
                        </Link>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          
        </div>
      </section>
    </div>
  );
}
