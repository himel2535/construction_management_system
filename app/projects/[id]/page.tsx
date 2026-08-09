"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { 
  ArrowLeft, Building2, Landmark, CheckCircle2, 
  Clock, Calendar, Wallet, FileText, Activity, Archive, Edit 
} from "lucide-react";
import { useProject } from "@/lib/hooks/useProjects";
import { TypePill, HealthPill, StatusChip } from "@/components/ui/StatusPill";
import Avatar from "@/components/ui/Avatar";
import Sparkline from "@/components/ui/Sparkline";
import TeamTab from "@/components/projects/TeamTab";
import ResourcesTab from "@/components/projects/ResourcesTab";
import BoqTab from "@/components/projects/BoqTab";
import ProgressTab from "@/components/projects/ProgressTab";
import BillingTab from "@/components/projects/BillingTab";
import DocumentsTab from "@/components/projects/DocumentsTab";
import EditProjectModal from "@/components/projects/EditProjectModal";
import { useUpdateProject } from "@/lib/hooks/useProjects";

export default function ProjectDetailsPage() {
  const params = useParams();
  const router = useRouter();
  const projectId = params.id as string;
  
  const { data: project, isLoading, isError } = useProject(projectId);
  const [activeTab, setActiveTab] = useState("overview");
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const updateProjectMutation = useUpdateProject();

  const handleArchive = async () => {
    if (window.confirm("Are you sure you want to archive this project?")) {
      try {
        await updateProjectMutation.mutateAsync({
          id: projectId,
          data: { status: "closed" }
        });
        alert("Project archived successfully");
        router.push("/projects");
      } catch (error) {
        console.error("Error archiving project:", error);
        alert("Failed to archive project.");
      }
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-slate-500 font-medium">Loading project details...</div>
      </div>
    );
  }

  if (isError || !project) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center flex-col gap-4">
        <div className="text-red-500 font-medium">Project not found or failed to load.</div>
        <Link href="/projects" className="text-blue-600 hover:underline">Back to projects</Link>
      </div>
    );
  }

  const isGov = project.projectType === "government" || project.projectType === "government_civil";
  const projectIcon = isGov ? <Landmark size={24} /> : <Building2 size={24} />;
  
  // Format compact BDT
  const formatCompactBDT = (val: number) => {
    if (!val) return "BDT 0";
    if (val >= 10000000) return `BDT ${(val / 10000000).toFixed(2)} Cr`;
    if (val >= 100000) return `BDT ${(val / 100000).toFixed(2)} L`;
    return `BDT ${val.toLocaleString()}`;
  };

  const budget = project.contractValue || 0;
  const progress = project.progressPercent || 0;

  return (
    <div className="projects-page dashboard-page dashboard-mockup">
      {/* Top Navigation */}
      <div className="dash-header flex justify-between items-center w-full">
        <div className="dash-header-title flex items-center gap-3">
          <Link href="/projects" className="text-slate-500 hover:text-slate-800 transition-colors mr-2">
            <ArrowLeft size={20} />
          </Link>
          <div className="flex items-center gap-3">
            <img src="/assets/icons/dashboard/kpi-projects.svg" alt="Project" className="w-10 h-10" />
            <h2 className="text-xl font-bold text-slate-800 m-0">{project.name}</h2>
          </div>
        </div>
        <div className="dash-header-actions flex gap-3">
          <button 
            onClick={handleArchive}
            disabled={updateProjectMutation.isPending}
            className="btn btn-edit btn-sm flex items-center gap-2 cursor-pointer"
          >
            <Archive size={16} /> {updateProjectMutation.isPending ? "Archiving..." : "Archive"}
          </button>
          <button 
            onClick={() => setIsEditModalOpen(true)}
            className="btn btn-primary btn-sm flex items-center gap-2 cursor-pointer"
          >
            <Edit size={16} /> Edit Profile
          </button>
        </div>
      </div>

      <div className="flex flex-col md:flex-row gap-2 w-full mt-6 inv-kpi-host">
          
          <div className="dash-kpi-card card cust-kpi-card flex-1 !p-4 !h-auto">
            <div className="cust-kpi-spark">
              <Sparkline values={[4,5,4,6,7,6,8]} tone="blue" />
            </div>
            <div className="dash-kpi-head items-center">
              <div className="dash-kpi-icon dash-kpi-icon--flat !bg-transparent">
                <img src="/assets/icons/dashboard/kpi-contract.svg" alt="Contract" className="w-10 h-10" />
              </div>
              <div className="dash-kpi-main">
                <span className="dash-kpi-label">Budget / Contract</span>
                <div className="dash-kpi-value">{formatCompactBDT(budget)}</div>
              </div>
            </div>
            <div className="dash-kpi-foot">
              <div className="dash-kpi-foot-left">Contract Value</div>
            </div>
          </div>

          <div className="dash-kpi-card card cust-kpi-card flex-1 !p-4 !h-auto">
            <div className="cust-kpi-spark">
              <Sparkline values={[1,2,3,4,4,5,6]} tone="green" />
            </div>
            <div className="dash-kpi-head items-center">
              <div className="dash-kpi-icon dash-kpi-icon--flat !bg-transparent">
                <img src="/assets/icons/dashboard/kpi-collection.svg" alt="Progress" className="w-10 h-10" />
              </div>
              <div className="dash-kpi-main">
                <span className="dash-kpi-label">Progress</span>
                <div className="dash-kpi-value">{progress}%</div>
              </div>
            </div>
            <div className="dash-kpi-foot">
              <div className="dash-kpi-foot-left">Overall completion</div>
            </div>
          </div>

          <div className="dash-kpi-card card cust-kpi-card flex-1 !p-4 !h-auto">
            <div className="cust-kpi-spark">
              <Sparkline values={[2,2,2,2,2,2,2]} tone="teal" />
            </div>
            <div className="dash-kpi-head items-center">
              <div className="dash-kpi-icon dash-kpi-icon--flat !bg-transparent">
                <img src="/assets/icons/dashboard/attention-payment.svg" alt="Timeline" className="w-10 h-10" />
              </div>
              <div className="dash-kpi-main">
                <span className="dash-kpi-label">Timeline</span>
                <div className="dash-kpi-value text-sm mt-1">{project.startDate || "TBD"} — {project.endDate || "TBD"}</div>
              </div>
            </div>
            <div className="dash-kpi-foot">
              <div className="dash-kpi-foot-left">Project schedule</div>
            </div>
          </div>
          
          <div className="dash-kpi-card card cust-kpi-card flex-1 !p-4 !h-auto">
            <div className="cust-kpi-spark">
              <Sparkline values={[3,3,2,4,3,2,3]} tone="orange" />
            </div>
            <div className="dash-kpi-head items-center">
              <div className="dash-kpi-icon dash-kpi-icon--flat !bg-transparent">
                <img src="/assets/icons/dashboard/attention-approval.svg" alt="IPCs" className="w-10 h-10" />
              </div>
              <div className="dash-kpi-main">
                <span className="dash-kpi-label">Open IPCs</span>
                <div className="dash-kpi-value">0</div>
              </div>
            </div>
            <div className="dash-kpi-foot">
              <div className="dash-kpi-foot-left">Unpaid invoices</div>
            </div>
          </div>
          
      </div>

      <div className="py-6">

        {/* Tab Navigation */}
        <div className="proj-tab-subnav pur-pill-tabs pur-pill-tabs--proc-main mb-6">
          {["overview", "boq", "progress", "billing", "resources", "team", "documents"].map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`proj-tab pur-tab-pill pur-tab-pill--${tab} ${activeTab === tab ? "is-active" : ""}`}
            >
              {tab.charAt(0).toUpperCase() + tab.slice(1)}
            </button>
          ))}
        </div>
        
        {/* Tab Content */}
        <div className="mt-4">
          {activeTab === "overview" && (
            <section className="dash-widget dash-widget--projects card">
              <div className="dash-widget-head dash-widget-head--split">
                <div>
                  <h3 className="dash-widget-title">Project Overview</h3>
                  <p className="dash-widget-sub">At-a-glance summary, stats, and recent activity</p>
                </div>
              </div>

              <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-10">
                <div>
                  <h3 className="text-sm font-semibold text-slate-800 mb-4 uppercase tracking-wider">Description</h3>
                  <div className="bg-slate-50 rounded-lg p-5 border border-slate-100 text-sm text-slate-600 leading-relaxed">
                    {(project.details as any)?.description || "No description provided for this project."}
                  </div>
                </div>

                <div>
                  <h3 className="text-sm font-semibold text-slate-800 mb-4 uppercase tracking-wider">Key Details</h3>
                  <div className="space-y-4">
                    <div className="flex justify-between items-center py-2 border-b border-slate-100">
                      <span className="text-sm text-slate-500">Location</span>
                      <span className="text-sm font-medium text-slate-800">{(project.details as any)?.location || "—"}</span>
                    </div>
                    <div className="flex justify-between items-center py-2 border-b border-slate-100">
                      <span className="text-sm text-slate-500">Client</span>
                      <span className="text-sm font-medium text-slate-800">{project.clientName || "—"}</span>
                    </div>
                    <div className="flex justify-between items-center py-2 border-b border-slate-100">
                      <span className="text-sm text-slate-500">Start Date</span>
                      <span className="text-sm font-medium text-slate-800">{project.startDate || "—"}</span>
                    </div>
                    <div className="flex justify-between items-center py-2 border-b border-slate-100">
                      <span className="text-sm text-slate-500">End Date</span>
                      <span className="text-sm font-medium text-slate-800">{project.endDate || "—"}</span>
                    </div>
                  </div>
                </div>
              </div>
            </section>
          )}

          {activeTab === "team" && (
            <TeamTab projectId={projectId} />
          )}

          {activeTab === "resources" && (
            <ResourcesTab projectId={projectId} />
          )}

          {activeTab === "boq" && (
            <BoqTab projectId={projectId} gov={project.projectType === "gov"} />
          )}

          {activeTab === "progress" && (
            <ProgressTab projectId={projectId} />
          )}

          {activeTab === "billing" && (
            <BillingTab projectId={projectId} clientId={project.clientId} contractValue={project.contractValue || 0} />
          )}

          {activeTab === "documents" && (
            <DocumentsTab projectId={projectId} />
          )}

          {activeTab !== "overview" && activeTab !== "team" && activeTab !== "resources" && activeTab !== "boq" && activeTab !== "progress" && activeTab !== "billing" && activeTab !== "documents" && (
            <div className="p-16 flex flex-col items-center justify-center text-center">
              <div className="w-16 h-16 rounded-full bg-slate-100 text-slate-400 flex items-center justify-center mb-4">
                <Clock size={24} />
              </div>
              <h3 className="text-lg font-bold text-slate-800 mb-2">Coming Soon</h3>
              <p className="text-sm text-slate-500 max-w-sm">
                The <strong className="text-slate-700 capitalize">{activeTab}</strong> module is currently being ported to the new Next.js interface. It will be available shortly.
              </p>
            </div>
          )}
        </div>

      </div>
      
      {project && (
        <EditProjectModal
          isOpen={isEditModalOpen}
          onClose={() => setIsEditModalOpen(false)}
          project={project}
        />
      )}
    </div>
  );
}
