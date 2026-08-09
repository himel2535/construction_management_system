"use client";

import { useState } from "react";
import { X, Building2, Landmark, Check } from "lucide-react";
import { useUpdateProject } from "@/lib/hooks/useProjects";
import { useCustomers } from "@/lib/hooks/useCustomers";
import { useEffect } from "react";

interface EditProjectModalProps {
  isOpen: boolean;
  onClose: () => void;
  project: any;
}

export default function EditProjectModal({ isOpen, onClose, project }: EditProjectModalProps) {
  const [projectType, setProjectType] = useState<"private" | "government">(project?.projectType || "private");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const updateProjectMutation = useUpdateProject();

  useEffect(() => {
    if (project) {
      setProjectType(project.projectType || "private");
    }
  }, [project]);
  const { data: clients } = useCustomers();

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      const formData = new FormData(e.currentTarget);
      const data = Object.fromEntries(formData.entries());

      let finalClientName = data.clientName as string;
      const selectedClientId = data.clientId as string;

      if (!finalClientName && selectedClientId && clients) {
        const client = clients.find(c => c.id === selectedClientId);
        if (client) {
          finalClientName = client.name || client.companyName || "";
        }
      }

      // Base fields
                  const basePayload: any = {
        name: data.name as string,
        code: data.code as string,
        projectType: projectType,
        clientName: finalClientName,
        status: (data.status as string) || "planning",
        contractValue: parseFloat(data.contractValue as string) || 0,
      };
      
      if (selectedClientId) basePayload.clientId = selectedClientId;
      if (data.startDate) basePayload.startDate = data.startDate;
      if (data.endDate) basePayload.endDate = data.endDate;
      if (data.projectManagerId) basePayload.projectManagerId = data.projectManagerId;

      
      if (selectedClientId) basePayload.clientId = selectedClientId;
      if (data.startDate) basePayload.startDate = data.startDate;
      if (data.endDate) basePayload.endDate = data.endDate;
      if (data.projectManagerId) basePayload.projectManagerId = data.projectManagerId;


      // Government specific fields put into details
            const details = {
        location: data.location as string,
        description: data.description as string,
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

      await updateProjectMutation.mutateAsync({
        id: project.id,
        data: {
          ...basePayload,
          details,
        } as any,
      });
      
      onClose();
    } catch (error) {
      console.error("Failed to update project", error);
      alert("Failed to update project. Please check your inputs.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-900/50 z-50 flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-5xl my-8 flex flex-col max-h-[90vh]">
        
        {/* Header */}
        <div className="flex items-center justify-between px-8 py-5 border-b border-slate-100 shrink-0">
          <div>
            <h2 className="text-2xl font-semibold text-slate-800">Edit Project</h2>
            <p className="text-slate-500 text-sm mt-1">Enter project details on one page — same layout as client records.</p>
          </div>
          <button onClick={onClose} className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-full transition-colors">
            <X size={20} />
          </button>
        </div>

        {/* Body */}
        <div className="p-8 overflow-y-auto flex-1">
          <form id="add-project-form" onSubmit={handleSubmit} className="space-y-10">
            
            {/* Top Cards & Info */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-10">
              
              {/* Left Column - Type Selection */}
              <div>
                <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-4">Project Details</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {/* Private Card */}
                  <label className={`relative cursor-pointer border-2 rounded-xl p-4 transition-all ${projectType === "private" ? "border-red-800 bg-red-50/30" : "border-slate-200 hover:border-slate-300"}`}>
                    <input 
                      type="radio" 
                      name="projectTypeSelect" 
                      className="sr-only" 
                      checked={projectType === "private"}
                      onChange={() => setProjectType("private")}
                    />
                    {projectType === "private" && (
                      <div className="absolute top-3 right-3 text-red-800">
                        <Check size={18} />
                      </div>
                    )}
                    <Building2 className={`w-8 h-8 mb-3 ${projectType === "private" ? "text-red-800" : "text-slate-400"}`} />
                    <h4 className={`font-semibold ${projectType === "private" ? "text-red-900" : "text-slate-700"}`}>Private / Local</h4>
                    <p className="text-xs text-slate-500 mt-1 leading-relaxed">Private clients — flexible billing and faster approvals</p>
                  </label>
                  
                  {/* Government Card */}
                  <label className={`relative cursor-pointer border-2 rounded-xl p-4 transition-all ${projectType === "government" ? "border-red-800 bg-red-50/30" : "border-slate-200 hover:border-slate-300"}`}>
                    <input 
                      type="radio" 
                      name="projectTypeSelect" 
                      className="sr-only" 
                      checked={projectType === "government"}
                      onChange={() => setProjectType("government")}
                    />
                    {projectType === "government" && (
                      <div className="absolute top-3 right-3 text-red-800">
                        <Check size={18} />
                      </div>
                    )}
                    <Landmark className={`w-8 h-8 mb-3 ${projectType === "government" ? "text-red-800" : "text-slate-400"}`} />
                    <h4 className={`font-semibold ${projectType === "government" ? "text-red-900" : "text-slate-700"}`}>Government</h4>
                    <p className="text-xs text-slate-500 mt-1 leading-relaxed">Tender, work order, measurement book, bank guarantee, IPC</p>
                  </label>
                </div>
              </div>

              {/* Right Column - Basic Info */}
              <div>
                <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-4">Project Info</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="block text-sm font-medium text-slate-700">Project name *</label>
                    <input type="text" name="name" defaultValue={project?.name || ""} required className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm focus:outline-none focus:ring-1 focus:ring-red-500" />
                  </div>
                  <div className="space-y-1.5">
                    <label className="block text-sm font-medium text-slate-700">Project code</label>
                    <input type="text" name="code" defaultValue={project?.code || ""} className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm focus:outline-none focus:ring-1 focus:ring-red-500" />
                  </div>
                  <div className="space-y-1.5">
                    <label className="block text-sm font-medium text-slate-700">Location *</label>
                    <input type="text" name="location" defaultValue={project?.location || ""} required className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm focus:outline-none focus:ring-1 focus:ring-red-500" />
                  </div>
                  <div className="space-y-1.5">
                    <label className="block text-sm font-medium text-slate-700">Client / owner</label>
                    <select name="clientId" defaultValue={project?.clientId || ""} className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm focus:outline-none focus:ring-1 focus:ring-red-500 bg-white">
                      <option value="">— Select client / owner —</option>
                      {clients?.map((client) => (
                        <option key={client.id} value={client.id}>
                          {client.name} {client.companyName ? `(${client.companyName})` : ""}
                        </option>
                      ))}
                    </select>
                    <input type="text" name="clientName" defaultValue={project?.clientName || ""} placeholder="Optional display name" className="w-full mt-2 px-3 py-2 border border-slate-300 rounded-md text-sm focus:outline-none focus:ring-1 focus:ring-red-500" />
                  </div>
                </div>

                <div className="mt-6">
                  <label className="block text-sm font-medium text-slate-700 mb-2">Status</label>
                  <div className="flex flex-wrap gap-2">
                    {['planning', 'ongoing', 'on-hold', 'completed', 'closed', 'archived'].map((statusOption) => (
                      <label key={statusOption} className="cursor-pointer">
                        <input type="radio" name="status" value={statusOption} className="sr-only peer" defaultChecked={statusOption === 'planning'} />
                        <span className="px-3 py-1 text-xs font-medium rounded-full border border-slate-200 text-slate-600 peer-checked:bg-red-900 peer-checked:text-white peer-checked:border-red-900 transition-colors capitalize">
                          {statusOption.replace('-', ' ')}
                        </span>
                      </label>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* Schedule & Team */}
            <div>
              <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-4 border-b border-slate-100 pb-2">Schedule & Team</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <label className="block text-sm font-medium text-slate-700">Start date</label>
                      <input type="date" name="startDate" defaultValue={project?.startDate || ""} className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm focus:outline-none focus:ring-1 focus:ring-red-500" />
                    </div>
                    <div className="space-y-1.5">
                      <label className="block text-sm font-medium text-slate-700">End date</label>
                      <input type="date" name="endDate" defaultValue={project?.endDate || ""} className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm focus:outline-none focus:ring-1 focus:ring-red-500" />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <label className="block text-sm font-medium text-slate-700">Contract value (BDT)</label>
                      <input type="number" name="contractValue" defaultValue={project?.contractValue || ""} className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm focus:outline-none focus:ring-1 focus:ring-red-500" />
                    </div>
                    <div className="space-y-1.5">
                      <label className="block text-sm font-medium text-slate-700">Project manager</label>
                      <select name="projectManagerId" defaultValue={project?.projectManagerId || ""} className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm focus:outline-none focus:ring-1 focus:ring-red-500 bg-white">
                        <option value="">Owner Admin (owner)</option>
                      </select>
                    </div>
                  </div>
                </div>
                <div className="space-y-1.5">
                  <label className="block text-sm font-medium text-slate-700">Description</label>
                  <textarea name="description" defaultValue={project?.description || ""} rows={4} className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm focus:outline-none focus:ring-1 focus:ring-red-500 resize-none"></textarea>
                </div>
              </div>
            </div>

            {/* Government Contract Fields */}
            {projectType === "government" && (
              <div className="space-y-8 mt-10">
                <h3 className="text-sm font-bold text-red-800 uppercase tracking-wider mb-4 border-b-2 border-red-800/20 pb-2">Government Contract</h3>
                
                {/* Tender / E-GP */}
                <div className="bg-slate-50 p-6 rounded-lg border border-slate-100">
                  <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-4">Tender / E-GP</h4>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div className="space-y-1.5">
                      <label className="block text-sm font-medium text-slate-700">Employer agency</label>
                      <select name="employerAgency" defaultValue={project?.details?.employerAgency || ""} className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm bg-white">
                        <option value="">Select agency</option>
                        <option value="LGED">LGED</option>
                        <option value="PWD">PWD</option>
                        <option value="RHD">RHD</option>
                      </select>
                      <span className="text-xs text-slate-400">LGED, PWD, RHD, etc.</span>
                    </div>
                    <div className="space-y-1.5">
                      <label className="block text-sm font-medium text-slate-700">Tender ref / e-GP ID</label>
                      <input type="text" name="tenderRef" defaultValue={project?.details?.tenderRef || ""} className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm" />
                    </div>
                    <div className="space-y-1.5">
                      <label className="block text-sm font-medium text-slate-700">Notice date</label>
                      <input type="date" name="noticeDate" defaultValue={project?.details?.noticeDate || ""} className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm" />
                    </div>
                    <div className="space-y-1.5">
                      <label className="block text-sm font-medium text-slate-700">Submission deadline</label>
                      <input type="date" name="submissionDeadline" defaultValue={project?.details?.submissionDeadline || ""} className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm" />
                    </div>
                    <div className="space-y-1.5 md:col-span-2">
                      <label className="block text-sm font-medium text-slate-700">Tender document URL</label>
                      <input type="url" name="tenderDocUrl" defaultValue={project?.details?.tenderDocUrl || ""} placeholder="https://..." className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm" />
                    </div>
                    <div className="space-y-1.5">
                      <label className="block text-sm font-medium text-slate-700">NIT no</label>
                      <input type="text" name="nitNo" defaultValue={project?.details?.nitNo || ""} className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm" />
                    </div>
                  </div>
                </div>

                {/* Work Order */}
                <div className="bg-slate-50 p-6 rounded-lg border border-slate-100">
                  <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-4">Work Order</h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-1.5">
                      <label className="block text-sm font-medium text-slate-700">Work order reference</label>
                      <input type="text" name="workOrderRef" defaultValue={project?.details?.workOrderRef || ""} className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm" />
                    </div>
                    <div className="space-y-1.5">
                      <label className="block text-sm font-medium text-slate-700">Issue date</label>
                      <input type="date" name="issueDate" defaultValue={project?.details?.issueDate || ""} className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm" />
                    </div>
                    <div className="space-y-1.5 md:col-span-2">
                      <label className="block text-sm font-medium text-slate-700">Scope of work</label>
                      <textarea name="scopeOfWork" defaultValue={project?.details?.scopeOfWork || ""} rows={3} className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm resize-none"></textarea>
                    </div>
                  </div>
                </div>

                {/* Contract & Retention */}
                <div className="bg-slate-50 p-6 rounded-lg border border-slate-100">
                  <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-4">Contract & Retention</h4>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div className="space-y-1.5">
                      <label className="block text-sm font-medium text-slate-700">Contract date</label>
                      <input type="date" name="contractDate" defaultValue={project?.details?.contractDate || ""} className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm" />
                    </div>
                    <div className="space-y-1.5">
                      <label className="block text-sm font-medium text-slate-700">Completion date</label>
                      <input type="date" name="completionDate" defaultValue={project?.details?.completionDate || ""} className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm" />
                    </div>
                    <div className="space-y-1.5">
                      <label className="block text-sm font-medium text-slate-700">Retention %</label>
                      <input type="number" name="retentionPercent" defaultValue={project?.details?.retentionPercent || ""} defaultValue="10" className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm" />
                    </div>
                    <div className="space-y-1.5">
                      <label className="block text-sm font-medium text-slate-700">LD rate / day (BDT)</label>
                      <input type="number" name="ldRatePerDay" defaultValue={project?.details?.ldRatePerDay || ""} defaultValue="0" className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm" />
                    </div>
                    <div className="space-y-1.5 md:col-span-3">
                      <label className="block text-sm font-medium text-slate-700">Retention release conditions</label>
                      <textarea name="retentionReleaseConditions" defaultValue={project?.details?.retentionReleaseConditions || ""} rows={2} className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm resize-none"></textarea>
                    </div>
                  </div>
                </div>

                {/* Guarantees */}
                <div className="bg-slate-50 p-6 rounded-lg border border-slate-100">
                  <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-4">Guarantees</h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-1.5">
                      <label className="block text-sm font-medium text-slate-700">Performance guarantee (BDT)</label>
                      <input type="number" name="performanceGuarantee" defaultValue={project?.details?.performanceGuarantee || ""} className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm" />
                    </div>
                    <div className="space-y-1.5">
                      <label className="block text-sm font-medium text-slate-700">Security deposit</label>
                      <input type="number" name="securityDeposit" defaultValue={project?.details?.securityDeposit || ""} className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm" />
                    </div>
                  </div>
                </div>

                {/* Bank Guarantee */}
                <div className="bg-slate-50 p-6 rounded-lg border border-slate-100">
                  <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-4">Bank Guarantee</h4>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div className="space-y-1.5">
                      <label className="block text-sm font-medium text-slate-700">BG type</label>
                      <select name="bgType" defaultValue={project?.details?.bgType || ""} className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm bg-white">
                        <option value="Performance guarantee">Performance guarantee</option>
                        <option value="Advance payment guarantee">Advance payment guarantee</option>
                      </select>
                    </div>
                    <div className="space-y-1.5">
                      <label className="block text-sm font-medium text-slate-700">BG amount (BDT)</label>
                      <input type="number" name="bgAmount" defaultValue={project?.details?.bgAmount || ""} className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm" />
                    </div>
                    <div className="space-y-1.5">
                      <label className="block text-sm font-medium text-slate-700">Issuing bank</label>
                      <input type="text" name="issuingBank" defaultValue={project?.details?.issuingBank || ""} className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm" />
                    </div>
                    <div className="space-y-1.5">
                      <label className="block text-sm font-medium text-slate-700">BG expiry</label>
                      <input type="date" name="bgExpiry" defaultValue={project?.details?.bgExpiry || ""} className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm" />
                    </div>
                    <div className="space-y-1.5">
                      <label className="block text-sm font-medium text-slate-700">BG status</label>
                      <select name="bgStatus" defaultValue={project?.details?.bgStatus || ""} className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm bg-white">
                        <option value="Active">Active</option>
                        <option value="Expired">Expired</option>
                        <option value="Released">Released</option>
                      </select>
                    </div>
                  </div>
                </div>

              </div>
            )}
          </form>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-8 py-5 border-t border-slate-100 shrink-0 bg-slate-50 rounded-b-xl">
          <button 
            type="submit" 
            form="add-project-form" 
            disabled={isSubmitting}
            className="px-6 py-2 bg-red-900 text-white rounded-md font-medium hover:bg-red-950 transition-colors disabled:opacity-50"
          >
            {isSubmitting ? "Adding..." : "Add project"}
          </button>
          <button 
            type="button" 
            onClick={onClose}
            className="px-6 py-2 border border-slate-300 text-slate-700 rounded-md font-medium hover:bg-slate-50 transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
