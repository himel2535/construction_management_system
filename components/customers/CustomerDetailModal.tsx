import { X, Edit, ExternalLink, Calendar, MapPin, Building2, User } from "lucide-react";
import Link from "next/link";
import Avatar from "@/components/ui/Avatar";
import { TypePill, HealthPill } from "@/components/ui/StatusPill";

interface CustomerDetailModalProps {
  customer: any;
  onClose: () => void;
  onEdit: (c: any) => void;
}

export default function CustomerDetailModal({ customer, onClose, onEdit }: CustomerDetailModalProps) {
  if (!customer) return null;

  const formatDate = (ts: any) => {
    if (!ts) return "—";
    const d = new Date(ts);
    return isNaN(d.getTime()) ? "—" : d.toLocaleDateString();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-start justify-between p-6 border-b border-slate-100">
          <div className="flex items-center gap-4">
            <Avatar name={customer.name} size="lg" />
            <div>
              <h2 className="text-xl font-bold text-slate-800">{customer.name}</h2>
              <div className="text-sm text-slate-500 mt-1 flex items-center gap-2">
                <span>{customer.phone || "No phone"}</span>
                {customer.email && (
                  <>
                    <span>·</span>
                    <span>{customer.email}</span>
                  </>
                )}
              </div>
            </div>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 bg-slate-100 p-2 rounded-md">
            <X size={20} />
          </button>
        </div>

        {/* Body */}
        <div className="p-6">
          <div className="grid grid-cols-2 gap-6 mb-8">
            <div>
              <div className="text-xs font-semibold text-slate-400 mb-1 uppercase tracking-wider">Type</div>
              <TypePill type={customer.clientType || "private"} />
            </div>
            <div>
              <div className="text-xs font-semibold text-slate-400 mb-1 uppercase tracking-wider">Status</div>
              <HealthPill health={customer.status === "inactive" ? "delayed" : "on_track"} label={customer.status === "inactive" ? "Inactive" : "Active"} />
            </div>
            <div>
              <div className="text-xs font-semibold text-slate-400 mb-1 uppercase tracking-wider">Joined</div>
              <div className="text-slate-700 font-medium flex items-center gap-2">
                <Calendar size={16} className="text-slate-400" />
                {formatDate(customer.createdAt)}
              </div>
            </div>
            <div>
              <div className="text-xs font-semibold text-slate-400 mb-1 uppercase tracking-wider">Portal Access</div>
              <div className="text-slate-700 font-medium">
                {customer.portalAccessEnabled ? "Enabled" : "Disabled"}
              </div>
            </div>
            <div>
              <div className="text-xs font-semibold text-slate-400 mb-1 uppercase tracking-wider">Contract Ref</div>
              <div className="text-slate-700 font-medium">{customer.contractRef || "—"}</div>
            </div>
            <div>
              <div className="text-xs font-semibold text-slate-400 mb-1 uppercase tracking-wider">Company</div>
              <div className="text-slate-700 font-medium flex items-center gap-2">
                <Building2 size={16} className="text-slate-400" />
                {customer.companyName || "—"}
              </div>
            </div>
            <div className="col-span-2">
              <div className="text-xs font-semibold text-slate-400 mb-1 uppercase tracking-wider">Address</div>
              <div className="text-slate-700 font-medium flex items-start gap-2">
                <MapPin size={16} className="text-slate-400 mt-0.5 shrink-0" />
                {customer.address || "—"}
              </div>
            </div>
          </div>

          {(customer.contactPerson || customer.notes) && (
            <div className="border-t border-slate-100 pt-6 mb-8">
              <h3 className="text-sm font-bold text-slate-800 mb-4">Contact & Notes</h3>
              <div className="space-y-4">
                {customer.contactPerson && (
                  <div>
                    <div className="text-xs font-semibold text-slate-400 mb-1 uppercase tracking-wider">Contact Person</div>
                    <div className="text-slate-700 flex items-center gap-2">
                      <User size={16} className="text-slate-400" />
                      {customer.contactPerson}
                    </div>
                  </div>
                )}
                {customer.notes && (
                  <div>
                    <div className="text-xs font-semibold text-slate-400 mb-1 uppercase tracking-wider">Notes</div>
                    <div className="text-slate-700 bg-slate-50 p-4 rounded-md text-sm whitespace-pre-wrap border border-slate-100">
                      {customer.notes}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Footer Actions */}
          <div className="border-t border-slate-100 pt-6 flex items-center gap-3">
            <button 
              onClick={() => {
                onClose();
                onEdit(customer);
              }}
              className="px-4 py-2 bg-slate-900 text-white rounded-md font-medium hover:bg-slate-800 flex items-center gap-2 transition-colors cursor-pointer"
            >
              <Edit size={16} /> Edit Client
            </button>
            <Link 
              href={`/projects?clientId=${customer.id}`}
              className="px-4 py-2 bg-white border border-slate-300 text-slate-700 rounded-md font-medium hover:bg-slate-50 flex items-center gap-2 transition-colors cursor-pointer"
            >
              <ExternalLink size={16} /> View Projects ({customer.totalProjects || 0})
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
