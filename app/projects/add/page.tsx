"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Building2, Landmark, Check, Plus, AlertCircle, UploadCloud } from "lucide-react";
import Link from "next/link";
import { useCreateProject } from "@/lib/hooks/useProjects";

export default function AddProjectPage() {
  const router = useRouter();
  const [projectType, setProjectType] = useState<"private" | "government">("private");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState("");
  const createProjectMutation = useCreateProject();

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setFormError("");
    setIsSubmitting(true);
    
    try {
      const formData = new FormData(e.currentTarget);
      const data = Object.fromEntries(formData.entries());

      // Base fields
      const basePayload = {
        name: data.name as string,
        code: data.code as string,
        projectType: projectType,
        clientId: data.clientId as string,
        clientName: data.clientName as string,
        status: (data.status as string) || "planning",
        startDate: data.startDate as string,
        endDate: data.endDate as string,
        contractValue: parseFloat(data.contractValue as string) || 0,
        projectManagerId: data.projectManagerId as string,
      };

      // Specific fields put into details
      const details = {
        location: data.location,
        description: data.description,
        ...(projectType === "government" ? {
          employerAgency: data.employerAgency,
          tenderRef: data.tenderRef,
          noticeDate: data.noticeDate,
          submissionDeadline: data.submissionDeadline,
          tenderDocUrl: data.tenderDocUrl,
          nitNo: data.nitNo,
          workOrderRef: data.workOrderRef,
          issueDate: data.issueDate,
          scopeOfWork: data.scopeOfWork,
          contractDate: data.contractDate,
          completionDate: data.completionDate,
          retentionPercent: parseFloat(data.retentionPercent as string) || 0,
          ldRatePerDay: parseFloat(data.ldRatePerDay as string) || 0,
          retentionReleaseConditions: data.retentionReleaseConditions,
          performanceGuarantee: parseFloat(data.performanceGuarantee as string) || 0,
          securityDeposit: parseFloat(data.securityDeposit as string) || 0,
          bgType: data.bgType,
          bgAmount: parseFloat(data.bgAmount as string) || 0,
          issuingBank: data.issuingBank,
          bgExpiry: data.bgExpiry,
          bgStatus: data.bgStatus,
        } : {})
      };

      await createProjectMutation.mutateAsync({
        ...basePayload,
        details,
      } as any);
      
      router.push("/projects");
    } catch (error: any) {
      console.error("Failed to create project", error);
      setFormError(error?.message || "Failed to save the project. Please check your inputs.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 pb-20">
      {/* Top Navigation */}
      <div className="bg-white border-b border-slate-200 sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link href="/projects" className="w-8 h-8 flex items-center justify-center rounded-full bg-slate-100 text-slate-500 hover:bg-slate-200 transition-colors">
              <ArrowLeft size={18} />
            </Link>
            <div>
              <h1 className="text-xl font-bold text-slate-800 tracking-tight">Create New Project</h1>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button 
              type="button" 
              onClick={() => router.push("/projects")}
              className="px-4 py-2 text-sm font-medium text-slate-600 hover:text-slate-900 transition-colors"
            >
              Cancel
            </button>
            <button 
              type="submit" 
              form="add-project-form" 
              disabled={isSubmitting}
              className="px-5 py-2 text-sm font-medium text-white bg-red-800 hover:bg-red-900 rounded-lg shadow-sm flex items-center gap-2 transition-all disabled:opacity-70"
            >
              <Plus size={16} />
              {isSubmitting ? "Creating..." : "Save Project"}
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-6 py-8">
        {formError && (
          <div className="mb-6 p-4 rounded-lg bg-red-50 border border-red-200 flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
            <div>
              <h4 className="text-sm font-semibold text-red-800">Error creating project</h4>
              <p className="text-sm text-red-700 mt-1">{formError}</p>
            </div>
          </div>
        )}

        <form id="add-project-form" onSubmit={handleSubmit} className="space-y-8">
          
          {/* Section 1: Project Type */}
          <section className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
            <div className="px-8 py-6 border-b border-slate-100 bg-slate-50/50">
              <h2 className="text-lg font-bold text-slate-800">Project Type</h2>
              <p className="text-sm text-slate-500 mt-1">Select the classification to enable specific tracking fields.</p>
            </div>
            <div className="p-8">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                {/* Private Card */}
                <label className={`relative cursor-pointer rounded-xl p-6 transition-all ring-1 ${projectType === "private" ? "ring-2 ring-red-800 bg-red-50/20" : "ring-slate-200 hover:ring-slate-300 hover:bg-slate-50"}`}>
                  <input 
                    type="radio" 
                    name="projectTypeSelect" 
                    className="sr-only" 
                    checked={projectType === "private"}
                    onChange={() => setProjectType("private")}
                  />
                  {projectType === "private" && (
                    <div className="absolute top-4 right-4 w-6 h-6 rounded-full bg-red-800 text-white flex items-center justify-center">
                      <Check size={14} strokeWidth={3} />
                    </div>
                  )}
                  <div className={`w-12 h-12 rounded-lg flex items-center justify-center mb-4 ${projectType === "private" ? "bg-red-100 text-red-800" : "bg-slate-100 text-slate-500"}`}>
                    <Building2 className="w-6 h-6" />
                  </div>
                  <h4 className={`text-lg font-semibold ${projectType === "private" ? "text-red-950" : "text-slate-800"}`}>Private / Local</h4>
                  <p className="text-sm text-slate-500 mt-2 leading-relaxed">Standard private projects with flexible billing and customized phases.</p>
                </label>
                
                {/* Government Card */}
                <label className={`relative cursor-pointer rounded-xl p-6 transition-all ring-1 ${projectType === "government" ? "ring-2 ring-red-800 bg-red-50/20" : "ring-slate-200 hover:ring-slate-300 hover:bg-slate-50"}`}>
                  <input 
                    type="radio" 
                    name="projectTypeSelect" 
                    className="sr-only" 
                    checked={projectType === "government"}
                    onChange={() => setProjectType("government")}
                  />
                  {projectType === "government" && (
                    <div className="absolute top-4 right-4 w-6 h-6 rounded-full bg-red-800 text-white flex items-center justify-center">
                      <Check size={14} strokeWidth={3} />
                    </div>
                  )}
                  <div className={`w-12 h-12 rounded-lg flex items-center justify-center mb-4 ${projectType === "government" ? "bg-red-100 text-red-800" : "bg-slate-100 text-slate-500"}`}>
                    <Landmark className="w-6 h-6" />
                  </div>
                  <h4 className={`text-lg font-semibold ${projectType === "government" ? "text-red-950" : "text-slate-800"}`}>Government Contract</h4>
                  <p className="text-sm text-slate-500 mt-2 leading-relaxed">Official tenders requiring e-GP, MB records, bank guarantees, and IPCs.</p>
                </label>
              </div>
            </div>
          </section>

          {/* Section 2: Basic Info */}
          <section className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
            <div className="px-8 py-6 border-b border-slate-100 bg-slate-50/50">
              <h2 className="text-lg font-bold text-slate-800">Basic Details</h2>
              <p className="text-sm text-slate-500 mt-1">Core identifying information for this project.</p>
            </div>
            <div className="p-8 space-y-6">
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <label className="text-sm font-semibold text-slate-700">Project name <span className="text-red-500">*</span></label>
                  <input type="text" name="name" required placeholder="e.g. Highway construction 2km" className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:bg-white focus:outline-none focus:ring-2 focus:ring-red-500/20 focus:border-red-500 transition-all" />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-semibold text-slate-700">Project code</label>
                  <input type="text" name="code" placeholder="e.g. PRJ-2026-001" className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:bg-white focus:outline-none focus:ring-2 focus:ring-red-500/20 focus:border-red-500 transition-all" />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <label className="text-sm font-semibold text-slate-700">Location <span className="text-red-500">*</span></label>
                  <input type="text" name="location" required placeholder="City, Area, or full address" className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:bg-white focus:outline-none focus:ring-2 focus:ring-red-500/20 focus:border-red-500 transition-all" />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-semibold text-slate-700">Client / Owner</label>
                  <div className="flex gap-2">
                    <select name="clientId" className="w-1/2 px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:bg-white focus:outline-none focus:ring-2 focus:ring-red-500/20 focus:border-red-500 transition-all">
                      <option value="">— Existing Client —</option>
                      {/* Options */}
                    </select>
                    <input type="text" name="clientName" placeholder="Or type new client name" className="w-1/2 px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:bg-white focus:outline-none focus:ring-2 focus:ring-red-500/20 focus:border-red-500 transition-all" />
                  </div>
                </div>
              </div>

              <div className="pt-4 border-t border-slate-100">
                <label className="text-sm font-semibold text-slate-700 block mb-3">Current Status</label>
                <div className="flex flex-wrap gap-3">
                  {['planning', 'ongoing', 'on-hold', 'completed'].map((statusOption) => (
                    <label key={statusOption} className="cursor-pointer group">
                      <input type="radio" name="status" value={statusOption} className="sr-only peer" defaultChecked={statusOption === 'planning'} />
                      <span className="px-5 py-2.5 text-sm font-medium rounded-lg border border-slate-200 text-slate-600 peer-checked:bg-slate-900 peer-checked:text-white peer-checked:border-slate-900 group-hover:border-slate-400 transition-all capitalize inline-block">
                        {statusOption.replace('-', ' ')}
                      </span>
                    </label>
                  ))}
                </div>
              </div>

            </div>
          </section>

          {/* Section 3: Schedule & Finance */}
          <section className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
            <div className="px-8 py-6 border-b border-slate-100 bg-slate-50/50">
              <h2 className="text-lg font-bold text-slate-800">Schedule & Finance</h2>
              <p className="text-sm text-slate-500 mt-1">Timeline and budget allocations.</p>
            </div>
            <div className="p-8 space-y-6">
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <label className="text-sm font-semibold text-slate-700">Contract Value (BDT) <span className="text-red-500">*</span></label>
                  <div className="relative">
                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 font-medium text-sm">৳</span>
                    <input type="number" name="contractValue" required defaultValue="0" min="0" className="w-full pl-8 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm font-medium focus:bg-white focus:outline-none focus:ring-2 focus:ring-red-500/20 focus:border-red-500 transition-all" />
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-semibold text-slate-700">Project Manager</label>
                  <select name="projectManagerId" className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:bg-white focus:outline-none focus:ring-2 focus:ring-red-500/20 focus:border-red-500 transition-all">
                    <option value="">Select Manager</option>
                    <option value="demo">Owner Admin (owner)</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <label className="text-sm font-semibold text-slate-700">Planned Start Date</label>
                  <input type="date" name="startDate" className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:bg-white focus:outline-none focus:ring-2 focus:ring-red-500/20 focus:border-red-500 transition-all text-slate-600" />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-semibold text-slate-700">Estimated End Date</label>
                  <input type="date" name="endDate" className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:bg-white focus:outline-none focus:ring-2 focus:ring-red-500/20 focus:border-red-500 transition-all text-slate-600" />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-semibold text-slate-700">Description</label>
                <textarea name="description" rows={3} placeholder="Brief summary of the project scope..." className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:bg-white focus:outline-none focus:ring-2 focus:ring-red-500/20 focus:border-red-500 transition-all resize-none"></textarea>
              </div>

            </div>
          </section>

          {/* Section 4: Government Specific Fields */}
          {projectType === "government" && (
            <section className="bg-white rounded-2xl shadow-sm border border-red-200 overflow-hidden ring-1 ring-red-100">
              <div className="px-8 py-6 border-b border-red-100 bg-red-50/30 flex items-center gap-3">
                <div className="p-2 bg-red-100 text-red-700 rounded-lg">
                  <Landmark size={20} />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-red-900">Government Contract Data</h2>
                  <p className="text-sm text-red-700/70 mt-1">Tender, Retention, and Bank Guarantee details.</p>
                </div>
              </div>
              
              <div className="p-8 space-y-10">
                {/* Tender / E-GP */}
                <div>
                  <h3 className="text-sm font-bold text-slate-900 mb-4 flex items-center gap-2"><span className="w-1.5 h-1.5 rounded-full bg-red-600"></span> Tender & E-GP</h3>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                    <div className="space-y-2">
                      <label className="text-xs font-semibold text-slate-600 uppercase tracking-wider">Employer Agency</label>
                      <select name="employerAgency" className="w-full px-3 py-2 border border-slate-200 rounded-md text-sm">
                        <option value="">Select agency</option>
                        <option value="LGED">LGED</option>
                        <option value="PWD">PWD</option>
                        <option value="RHD">RHD</option>
                      </select>
                    </div>
                    <div className="space-y-2">
                      <label className="text-xs font-semibold text-slate-600 uppercase tracking-wider">Tender Ref / e-GP ID</label>
                      <input type="text" name="tenderRef" className="w-full px-3 py-2 border border-slate-200 rounded-md text-sm" />
                    </div>
                    <div className="space-y-2">
                      <label className="text-xs font-semibold text-slate-600 uppercase tracking-wider">NIT no</label>
                      <input type="text" name="nitNo" className="w-full px-3 py-2 border border-slate-200 rounded-md text-sm" />
                    </div>
                    <div className="space-y-2">
                      <label className="text-xs font-semibold text-slate-600 uppercase tracking-wider">Notice date</label>
                      <input type="date" name="noticeDate" className="w-full px-3 py-2 border border-slate-200 rounded-md text-sm text-slate-600" />
                    </div>
                    <div className="space-y-2">
                      <label className="text-xs font-semibold text-slate-600 uppercase tracking-wider">Submission deadline</label>
                      <input type="date" name="submissionDeadline" className="w-full px-3 py-2 border border-slate-200 rounded-md text-sm text-slate-600" />
                    </div>
                    <div className="space-y-2 md:col-span-1">
                      <label className="text-xs font-semibold text-slate-600 uppercase tracking-wider">Doc URL</label>
                      <div className="flex gap-2">
                        <input type="url" name="tenderDocUrl" placeholder="https://..." className="w-full px-3 py-2 border border-slate-200 rounded-md text-sm" />
                      </div>
                    </div>
                  </div>
                </div>

                <div className="w-full h-px bg-slate-100"></div>

                {/* Work Order & Contract */}
                <div>
                  <h3 className="text-sm font-bold text-slate-900 mb-4 flex items-center gap-2"><span className="w-1.5 h-1.5 rounded-full bg-red-600"></span> Work Order & Terms</h3>
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-5">
                    <div className="space-y-2 md:col-span-2">
                      <label className="text-xs font-semibold text-slate-600 uppercase tracking-wider">Work order reference</label>
                      <input type="text" name="workOrderRef" className="w-full px-3 py-2 border border-slate-200 rounded-md text-sm" />
                    </div>
                    <div className="space-y-2">
                      <label className="text-xs font-semibold text-slate-600 uppercase tracking-wider">Issue date</label>
                      <input type="date" name="issueDate" className="w-full px-3 py-2 border border-slate-200 rounded-md text-sm text-slate-600" />
                    </div>
                    <div className="space-y-2">
                      <label className="text-xs font-semibold text-slate-600 uppercase tracking-wider">Contract date</label>
                      <input type="date" name="contractDate" className="w-full px-3 py-2 border border-slate-200 rounded-md text-sm text-slate-600" />
                    </div>
                    
                    <div className="space-y-2">
                      <label className="text-xs font-semibold text-slate-600 uppercase tracking-wider">Retention %</label>
                      <input type="number" name="retentionPercent" defaultValue="10" className="w-full px-3 py-2 border border-slate-200 rounded-md text-sm" />
                    </div>
                    <div className="space-y-2">
                      <label className="text-xs font-semibold text-slate-600 uppercase tracking-wider">LD rate / day</label>
                      <input type="number" name="ldRatePerDay" defaultValue="0" className="w-full px-3 py-2 border border-slate-200 rounded-md text-sm" />
                    </div>
                    <div className="space-y-2 md:col-span-2">
                      <label className="text-xs font-semibold text-slate-600 uppercase tracking-wider">Retention release conditions</label>
                      <input type="text" name="retentionReleaseConditions" placeholder="e.g. 50% on practical completion..." className="w-full px-3 py-2 border border-slate-200 rounded-md text-sm" />
                    </div>
                  </div>
                </div>

                <div className="w-full h-px bg-slate-100"></div>

                {/* Bank Guarantee */}
                <div>
                  <h3 className="text-sm font-bold text-slate-900 mb-4 flex items-center gap-2"><span className="w-1.5 h-1.5 rounded-full bg-red-600"></span> Bank Guarantees</h3>
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-5">
                    <div className="space-y-2">
                      <label className="text-xs font-semibold text-slate-600 uppercase tracking-wider">Performance (BDT)</label>
                      <input type="number" name="performanceGuarantee" className="w-full px-3 py-2 border border-slate-200 rounded-md text-sm" />
                    </div>
                    <div className="space-y-2">
                      <label className="text-xs font-semibold text-slate-600 uppercase tracking-wider">Security Deposit (BDT)</label>
                      <input type="number" name="securityDeposit" className="w-full px-3 py-2 border border-slate-200 rounded-md text-sm" />
                    </div>
                    <div className="space-y-2 md:col-span-2">
                      <label className="text-xs font-semibold text-slate-600 uppercase tracking-wider">BG Type</label>
                      <select name="bgType" className="w-full px-3 py-2 border border-slate-200 rounded-md text-sm bg-white">
                        <option value="Performance guarantee">Performance guarantee</option>
                        <option value="Advance payment guarantee">Advance payment guarantee</option>
                      </select>
                    </div>
                    <div className="space-y-2 md:col-span-2">
                      <label className="text-xs font-semibold text-slate-600 uppercase tracking-wider">Issuing bank</label>
                      <input type="text" name="issuingBank" className="w-full px-3 py-2 border border-slate-200 rounded-md text-sm" />
                    </div>
                    <div className="space-y-2">
                      <label className="text-xs font-semibold text-slate-600 uppercase tracking-wider">BG amount</label>
                      <input type="number" name="bgAmount" className="w-full px-3 py-2 border border-slate-200 rounded-md text-sm" />
                    </div>
                    <div className="space-y-2">
                      <label className="text-xs font-semibold text-slate-600 uppercase tracking-wider">BG expiry</label>
                      <input type="date" name="bgExpiry" className="w-full px-3 py-2 border border-slate-200 rounded-md text-sm text-slate-600" />
                    </div>
                  </div>
                </div>

              </div>
            </section>
          )}

        </form>
      </div>
    </div>
  );
}
