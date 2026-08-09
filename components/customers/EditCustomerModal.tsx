import { useState } from "react";
import { X, AlertCircle, Building2, User, Phone, Mail, MapPin, Check, Landmark } from "lucide-react";
import { useUpdateCustomer } from "@/lib/hooks/useCustomers";
import { useProjects } from "@/lib/hooks/useProjects";

interface EditCustomerModalProps {
  customer: any;
  onClose: () => void;
}

export default function EditCustomerModal({ customer, onClose }: EditCustomerModalProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState("");
  const updateMutation = useUpdateCustomer();
  const { data: projects = [] } = useProjects();

  if (!customer) return null;

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
        clientType: data.clientType as string,
        status: data.status as string,
        contactPerson: data.contactPerson as string,
        contractRef: data.contractRef as string,
        portalAccessEnabled: data.portalAccessEnabled === "true",
        projectId: data.projectId as string,
        nid: data.nid as string,
        totalBilled: parseFloat(data.totalBilled as string) || 0,
        notes: data.notes as string,
      };

      await updateMutation.mutateAsync({ id: customer.id, data: payload });
      onClose();
    } catch (err: any) {
      setFormError(err.message || "Failed to update client");
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between p-6 border-b border-slate-100">
          <div>
            <h2 className="text-xl font-bold text-slate-800">Edit Client</h2>
            <p className="text-sm text-slate-500 mt-1">Update {customer.name}&apos;s details</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 bg-slate-100 p-2 rounded-md">
            <X size={20} />
          </button>
        </div>

        <div className="p-6 overflow-y-auto">
          {formError && (
            <div className="mb-6 p-4 bg-red-50 text-red-700 rounded-md flex items-start gap-3 border border-red-100">
              <AlertCircle size={20} className="shrink-0 mt-0.5" />
              <div>
                <strong className="font-semibold block mb-1">Error updating client</strong>
                <span className="text-sm">{formError}</span>
              </div>
            </div>
          )}

          <form id="edit-client-form" onSubmit={handleSubmit} className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Basic Details */}
              <div className="space-y-4">
                <h3 className="font-semibold text-slate-800 text-sm border-b border-slate-100 pb-2">Basic Info</h3>
                
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Client Name *</label>
                  <div className="relative">
                    <User size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input type="text" name="name" defaultValue={customer.name} required className="w-full !pl-10 pr-3 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-amber-500" placeholder="e.g. John Doe or Acme Corp" />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Company / Organization</label>
                  <div className="relative">
                    <Building2 size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input type="text" name="companyName" defaultValue={customer.companyName} className="w-full !pl-10 pr-3 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-amber-500" placeholder="e.g. Acme Corporation" />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Client Type</label>
                  <div className="grid grid-cols-2 gap-3">
                    <label className={`border rounded-md p-3 flex items-center justify-center gap-2 cursor-pointer transition-colors ${customer.clientType === "private" ? "border-amber-500 bg-amber-50 text-amber-700" : "border-slate-200 text-slate-600 hover:bg-slate-50"}`}>
                      <input type="radio" name="clientType" value="private" defaultChecked={customer.clientType !== "government"} className="sr-only" />
                      <Building2 size={16} />
                      <span className="font-medium text-sm">Private</span>
                    </label>
                    <label className={`border rounded-md p-3 flex items-center justify-center gap-2 cursor-pointer transition-colors ${customer.clientType === "government" ? "border-amber-500 bg-amber-50 text-amber-700" : "border-slate-200 text-slate-600 hover:bg-slate-50"}`}>
                      <input type="radio" name="clientType" value="government" defaultChecked={customer.clientType === "government"} className="sr-only" />
                      <Landmark size={16} />
                      <span className="font-medium text-sm">Government</span>
                    </label>
                  </div>
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Status</label>
                  <select name="status" defaultValue={customer.status || "active"} className="w-full px-3 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-amber-500">
                    <option value="active">Active</option>
                    <option value="inactive">Inactive</option>
                    <option value="lead">Lead</option>
                  </select>
                </div>
              </div>

              {/* Contact Details */}
              <div className="space-y-4">
                <h3 className="font-semibold text-slate-800 text-sm border-b border-slate-100 pb-2">Contact Details</h3>
                
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Phone Number</label>
                  <div className="relative">
                    <Phone size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input type="tel" name="phone" defaultValue={customer.phone} className="w-full !pl-10 pr-3 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-amber-500" placeholder="+880 1..." />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Email Address</label>
                  <div className="relative">
                    <Mail size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input type="email" name="email" defaultValue={customer.email} className="w-full !pl-10 pr-3 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-amber-500" placeholder="contact@example.com" />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Billing / Office Address</label>
                  <div className="relative">
                    <MapPin size={16} className="absolute left-3 top-3 text-slate-400" />
                    <textarea name="address" defaultValue={customer.address} rows={2} className="w-full !pl-10 pr-3 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-amber-500" placeholder="Full address..."></textarea>
                  </div>
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Contact Person (if company)</label>
                  <div className="relative">
                    <User size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input type="text" name="contactPerson" defaultValue={customer.contactPerson} className="w-full !pl-10 pr-3 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-amber-500" placeholder="Name of primary contact" />
                  </div>
                </div>
              </div>
            </div>

            <div className="space-y-4">
               <h3 className="font-semibold text-slate-800 text-sm border-b border-slate-100 pb-2">Additional Settings</h3>
               
               <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                 <div>
                   <label className="block text-sm font-medium text-slate-700 mb-1">Contract / Registration Ref</label>
                   <input type="text" name="contractRef" defaultValue={customer.contractRef} className="w-full px-3 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-amber-500" placeholder="e.g. REG-2024-001" />
                 </div>
                 
                 <div>
                   <label className="block text-sm font-medium text-slate-700 mb-1">Client Portal Access</label>
                   <select name="portalAccessEnabled" defaultValue={customer.portalAccessEnabled ? "true" : "false"} className="w-full px-3 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-amber-500">
                     <option value="false">Disabled</option>
                     <option value="true">Enabled</option>
                   </select>
                   <p className="text-xs text-slate-500 mt-1">Allow client to view project progress online</p>
                 </div>
                 
                 <div>
                   <label className="block text-sm font-medium text-slate-700 mb-1">NID</label>
                   <input type="text" name="nid" defaultValue={customer.nid} className="w-full px-3 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-amber-500" placeholder="National ID" />
                 </div>

                 <div>
                   <label className="block text-sm font-medium text-slate-700 mb-1">Primary Project</label>
                   <select name="projectId" defaultValue={customer.projectId || ""} className="w-full px-3 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-amber-500">
                     <option value="">-- Select Project --</option>
                     {projects.map((p: any) => (
                       <option key={p.id} value={p.id}>{p.name}</option>
                     ))}
                   </select>
                 </div>

                 <div>
                   <label className="block text-sm font-medium text-slate-700 mb-1">Outstanding Balance (BDT)</label>
                   <input type="number" name="totalBilled" defaultValue={customer.totalBilled || 0} className="w-full px-3 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-amber-500" placeholder="0.00" />
                 </div>
               </div>
               
               <div>
                 <label className="block text-sm font-medium text-slate-700 mb-1">Notes / Remarks</label>
                 <textarea name="notes" defaultValue={customer.notes} rows={3} className="w-full px-3 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-amber-500" placeholder="Any internal notes about this client..."></textarea>
               </div>
            </div>
          </form>
        </div>

        <div className="p-6 border-t border-slate-100 flex justify-end gap-3 bg-slate-50 mt-auto rounded-b-lg">
          <button type="button" onClick={onClose} className="px-4 py-2 text-slate-700 font-medium hover:bg-slate-200 bg-slate-100 rounded-md transition-colors cursor-pointer">
            Cancel
          </button>
          <button type="submit" form="edit-client-form" disabled={isSubmitting} className="px-6 py-2 bg-amber-600 text-white rounded-md font-medium hover:bg-amber-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 cursor-pointer shadow-sm transition-colors">
            {isSubmitting ? (
              <>Saving...</>
            ) : (
              <><Check size={18} /> Save Changes</>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
