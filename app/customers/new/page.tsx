"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Building2, Landmark, Check, Plus, AlertCircle, Users } from "lucide-react";
import Link from "next/link";
import { useCreateCustomer } from "@/lib/hooks/useCustomers";

export default function AddClientPage() {
  const router = useRouter();
  const [clientType, setClientType] = useState<"private" | "government">("private");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState("");
  const createCustomerMutation = useCreateCustomer();

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setFormError("");
    setIsSubmitting(true);
    
    try {
      const formData = new FormData(e.currentTarget);
      const data = Object.fromEntries(formData.entries());

      const payload = {
        name: data.name as string,
        companyName: data.companyName as string,
        email: data.email as string,
        phone: data.phone as string,
        address: data.address as string,
        contactPerson: data.contactPerson as string || "",
        contractRef: data.contractRef as string || "",
        status: (data.status as string) as "active" | "inactive" | "lead",
        clientType: clientType,
        notes: data.notes as string,
        totalProjects: 0,
        totalBilled: 0,
      };
      // For now, we put them in notes if we don't have columns, or we can just append to address/notes.
      const extraDetails = `NID: ${data.nid}\nContract Ref: ${data.contractRef}\n` + 
        (clientType === "government" ? `Gov Contact: ${data.contactPersonName}, ${data.contactPersonDesignation}` : "");
      
      if (extraDetails.trim()) {
        payload.notes = (payload.notes ? payload.notes + "\n\n" : "") + extraDetails.trim();
      }

      await createCustomerMutation.mutateAsync(payload);
      
      router.push("/customers");
    } catch (error: any) {
      console.error("Failed to create client", error);
      setFormError(error?.message || "Failed to save the client. Please check your inputs.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 pb-20">
      {/* Top Navigation */}
      <div className="bg-white border-b border-slate-200 sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link href="/customers" className="w-8 h-8 flex items-center justify-center rounded-full bg-slate-100 text-slate-500 hover:bg-slate-200 transition-colors">
              <ArrowLeft size={18} />
            </Link>
            <div>
              <h1 className="text-xl font-bold text-slate-800 tracking-tight">Create New Client</h1>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button 
              type="button" 
              onClick={() => router.push("/customers")}
              className="px-4 py-2 text-sm font-medium text-slate-600 hover:text-slate-900 transition-colors"
            >
              Cancel
            </button>
            <button 
              type="submit" 
              form="add-client-form" 
              disabled={isSubmitting}
              className="px-5 py-2 text-sm font-medium text-white bg-amber-600 hover:bg-amber-700 rounded-lg shadow-sm flex items-center gap-2 transition-all disabled:opacity-70"
            >
              <Plus size={16} />
              {isSubmitting ? "Saving..." : "Save Client"}
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-6 py-8">
        {formError && (
          <div className="mb-6 p-4 rounded-lg bg-red-50 border border-red-200 flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
            <div>
              <h4 className="text-sm font-semibold text-red-800">Error creating client</h4>
              <p className="text-sm text-red-700 mt-1">{formError}</p>
            </div>
          </div>
        )}

        <form id="add-client-form" onSubmit={handleSubmit} className="space-y-8">
          
          {/* Section 1: Client Type */}
          <section className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
            <div className="px-8 py-6 border-b border-slate-100 bg-slate-50/50">
              <h2 className="text-lg font-bold text-slate-800">Client Type</h2>
              <p className="text-sm text-slate-500 mt-1">Select the classification to enable specific tracking fields.</p>
            </div>
            <div className="p-8">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                {/* Private Card */}
                <label className={`relative cursor-pointer rounded-xl p-6 transition-all ring-1 ${clientType === "private" ? "ring-2 ring-amber-600 bg-amber-50/20" : "ring-slate-200 hover:ring-slate-300 hover:bg-slate-50"}`}>
                  <input 
                    type="radio" 
                    name="clientTypeSelect" 
                    className="sr-only" 
                    checked={clientType === "private"}
                    onChange={() => setClientType("private")}
                  />
                  {clientType === "private" && (
                    <div className="absolute top-4 right-4 w-6 h-6 rounded-full bg-amber-600 text-white flex items-center justify-center">
                      <Check size={14} strokeWidth={3} />
                    </div>
                  )}
                  <div className={`w-12 h-12 rounded-lg flex items-center justify-center mb-4 ${clientType === "private" ? "bg-amber-100 text-amber-700" : "bg-slate-100 text-slate-500"}`}>
                    <Users className="w-6 h-6" />
                  </div>
                  <h4 className={`text-lg font-semibold ${clientType === "private" ? "text-amber-950" : "text-slate-800"}`}>Private / Local</h4>
                  <p className="text-sm text-slate-500 mt-2 leading-relaxed">Individuals or private corporations.</p>
                </label>
                
                {/* Government Card */}
                <label className={`relative cursor-pointer rounded-xl p-6 transition-all ring-1 ${clientType === "government" ? "ring-2 ring-amber-600 bg-amber-50/20" : "ring-slate-200 hover:ring-slate-300 hover:bg-slate-50"}`}>
                  <input 
                    type="radio" 
                    name="clientTypeSelect" 
                    className="sr-only" 
                    checked={clientType === "government"}
                    onChange={() => setClientType("government")}
                  />
                  {clientType === "government" && (
                    <div className="absolute top-4 right-4 w-6 h-6 rounded-full bg-amber-600 text-white flex items-center justify-center">
                      <Check size={14} strokeWidth={3} />
                    </div>
                  )}
                  <div className={`w-12 h-12 rounded-lg flex items-center justify-center mb-4 ${clientType === "government" ? "bg-amber-100 text-amber-700" : "bg-slate-100 text-slate-500"}`}>
                    <Landmark className="w-6 h-6" />
                  </div>
                  <h4 className={`text-lg font-semibold ${clientType === "government" ? "text-amber-950" : "text-slate-800"}`}>Government / Agency</h4>
                  <p className="text-sm text-slate-500 mt-2 leading-relaxed">Government agencies requiring official contact details.</p>
                </label>
              </div>
            </div>
          </section>

          {/* Section 2: Basic Info */}
          <section className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
            <div className="px-8 py-6 border-b border-slate-100 bg-slate-50/50">
              <h2 className="text-lg font-bold text-slate-800">Client Details</h2>
              <p className="text-sm text-slate-500 mt-1">Core identifying information for this client.</p>
            </div>
            <div className="p-8 space-y-6">
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <label className="text-sm font-semibold text-slate-700">Client / Company Name <span className="text-red-500">*</span></label>
                  <input type="text" name="name" required placeholder="e.g. Apex Holdings Ltd." className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:bg-white focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 transition-all" />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-semibold text-slate-700">Business Type / Sector</label>
                  <input type="text" name="companyName" placeholder="e.g. Real Estate Developer" className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:bg-white focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 transition-all" />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <label className="text-sm font-semibold text-slate-700">Phone Number <span className="text-red-500">*</span></label>
                  <input type="text" name="phone" required placeholder="+880 1700-000000" className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:bg-white focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 transition-all" />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-semibold text-slate-700">Email Address</label>
                  <input type="email" name="email" placeholder="client@company.com" className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:bg-white focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 transition-all" />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <label className="text-sm font-semibold text-slate-700">NID / National ID</label>
                  <input type="text" name="nid" placeholder="National ID" className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:bg-white focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 transition-all" />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-semibold text-slate-700">Contract / work order ref</label>
                  <input type="text" name="contractRef" placeholder="e.g. WO-2025-014" className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:bg-white focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 transition-all" />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-semibold text-slate-700">Address</label>
                <textarea name="address" rows={2} placeholder="Street, area, city" className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:bg-white focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 transition-all resize-none"></textarea>
              </div>

              <div className="pt-4 border-t border-slate-100">
                <label className="text-sm font-semibold text-slate-700 block mb-3">Status</label>
                <div className="flex flex-wrap gap-3">
                  {['active', 'inactive', 'lead'].map((statusOption) => (
                    <label key={statusOption} className="cursor-pointer group">
                      <input type="radio" name="status" value={statusOption} className="sr-only peer" defaultChecked={statusOption === 'active'} />
                      <span className="px-5 py-2.5 text-sm font-medium rounded-lg border border-slate-200 text-slate-600 peer-checked:bg-slate-900 peer-checked:text-white peer-checked:border-slate-900 group-hover:border-slate-400 transition-all capitalize inline-block">
                        {statusOption}
                      </span>
                    </label>
                  ))}
                </div>
              </div>

            </div>
          </section>

          {/* Section 3: Government Specific Fields */}
          {clientType === "government" && (
            <section className="bg-white rounded-2xl shadow-sm border border-amber-200 overflow-hidden ring-1 ring-amber-100">
              <div className="px-8 py-6 border-b border-amber-100 bg-amber-50/30 flex items-center gap-3">
                <div className="p-2 bg-amber-100 text-amber-700 rounded-lg">
                  <Landmark size={20} />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-amber-900">Government Contact</h2>
                  <p className="text-sm text-amber-700/70 mt-1">Provide the primary contact person details for the agency.</p>
                </div>
              </div>
              
              <div className="p-8 space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <label className="text-sm font-semibold text-slate-700">Contact Person Name</label>
                    <input type="text" name="contactPersonName" placeholder="Name" className="w-full px-4 py-2.5 bg-slate-50 border border-amber-200/60 rounded-lg text-sm focus:bg-white focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 transition-all" />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-semibold text-slate-700">Contact Designation</label>
                    <input type="text" name="contactPersonDesignation" placeholder="e.g. Executive Engineer" className="w-full px-4 py-2.5 bg-slate-50 border border-amber-200/60 rounded-lg text-sm focus:bg-white focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 transition-all" />
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
