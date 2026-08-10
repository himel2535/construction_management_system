"use client";

import { useState } from "react";
import { FileText, Plus, Download } from "lucide-react";
import Loader from "@/components/ui/Loader";
import { useProjectInvoices } from "@/lib/hooks/useProjectBilling";
import { StatusChip } from "@/components/ui/StatusPill";
import CreateInvoiceModal from "@/components/modals/CreateInvoiceModal";
import ViewInvoiceModal from "@/components/modals/ViewInvoiceModal";

export default function BillingTab({ projectId, clientId, contractValue }: { projectId: string, clientId?: string | null, contractValue: number }) {
  const { data: invoices = [], isLoading } = useProjectInvoices(projectId);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedInvoice, setSelectedInvoice] = useState<any | null>(null);

  if (isLoading) {
    return <div className="p-8 flex justify-center"><Loader text="Loading billing data..." /></div>;
  }

  const formatCurrency = (val: number) => `BDT ${val.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  const totalBilled = invoices.reduce((sum, inv) => sum + (inv.amount || 0), 0);
  const totalPaid = invoices.reduce((sum, inv) => sum + (inv.paidAmount || 0), 0);
  const totalOutstanding = totalBilled - totalPaid;
  const billingProgress = contractValue > 0 ? (totalBilled / contractValue) * 100 : 0;

  return (
    <div className="">
      {/* Metrics */}
      <div className="flex flex-col md:flex-row gap-2 w-full mb-6">
        <div className="dash-kpi-card card cust-kpi-card flex-1 !p-4 !h-auto">
          <div className="dash-kpi-head items-center">
            <div className="dash-kpi-icon dash-kpi-icon--flat !bg-transparent">
              <img src="/assets/icons/dashboard/kpi-contract.svg" alt="Contract Value" className="w-10 h-10" />
            </div>
            <div className="dash-kpi-main">
              <span className="dash-kpi-label uppercase tracking-wider">Contract Value</span>
              <div className="dash-kpi-value">{formatCurrency(contractValue)}</div>
            </div>
          </div>
        </div>
        
        <div className="dash-kpi-card card cust-kpi-card flex-1 !p-4 !h-auto">
          <div className="dash-kpi-head items-center">
            <div className="dash-kpi-icon dash-kpi-icon--flat !bg-transparent">
              <img src="/assets/icons/dashboard/attention-payment.svg" alt="Total Billed" className="w-10 h-10" />
            </div>
            <div className="dash-kpi-main">
              <span className="dash-kpi-label uppercase tracking-wider">Total Billed</span>
              <div className="dash-kpi-value">{formatCurrency(totalBilled)}</div>
            </div>
          </div>
        </div>

        <div className="dash-kpi-card card cust-kpi-card flex-1 !p-4 !h-auto">
          <div className="dash-kpi-head items-center">
            <div className="dash-kpi-icon dash-kpi-icon--flat !bg-transparent">
              <img src="/assets/icons/dashboard/approval-billing.svg" alt="Total Paid" className="w-10 h-10" />
            </div>
            <div className="dash-kpi-main">
              <span className="dash-kpi-label uppercase tracking-wider">Total Paid</span>
              <div className="dash-kpi-value">{formatCurrency(totalPaid)}</div>
            </div>
          </div>
        </div>

        <div className="dash-kpi-card card cust-kpi-card flex-1 !p-4 !h-auto">
          <div className="dash-kpi-head items-center">
            <div className="dash-kpi-icon dash-kpi-icon--flat !bg-transparent">
              <img src="/assets/icons/dashboard/attention-warning.svg" alt="Outstanding" className="w-10 h-10" />
            </div>
            <div className="dash-kpi-main">
              <span className="dash-kpi-label uppercase tracking-wider">Outstanding</span>
              <div className="dash-kpi-value text-red-600">{formatCurrency(totalOutstanding)}</div>
            </div>
          </div>
        </div>
      </div>

      {/* Progress Bar */}
      <div className="mb-8">
        <div className="flex justify-between items-center mb-2">
          <span className="text-sm font-medium text-slate-600">Billing Progress</span>
          <span className="text-sm font-bold text-slate-800">{Math.min(billingProgress, 100).toFixed(1)}%</span>
        </div>
        <div className="w-full bg-slate-200 rounded-full h-2.5">
          <div className="bg-emerald-500 h-2.5 rounded-full transition-all duration-500" style={{ width: `${Math.min(billingProgress, 100)}%` }}></div>
        </div>
      </div>

      {/* Invoices Table */}
      <section className="dash-widget dash-widget--projects card mb-8">
        <div className="dash-widget-head dash-widget-head--split">
          <div>
            <h3 className="dash-widget-title flex items-center gap-2"><FileText size={18} className="text-slate-500" /> Invoices & IPCs</h3>
            <p className="dash-widget-sub">Manage client billing and payments</p>
          </div>
          <button 
            onClick={() => setIsModalOpen(true)}
            className="btn btn-primary btn-sm flex items-center gap-2 cursor-pointer"
          >
            <Plus size={16} /> Create Invoice
          </button>
        </div>
        <div className="table-wrap projects-table-wrap">
          <table className="dash-table projects-table w-full text-left whitespace-nowrap">
            <thead>
              <tr>
                <th className="px-5 py-3">Invoice Type</th>
                <th className="px-5 py-3">Bill Date</th>
                <th className="px-5 py-3">Due Date</th>
                <th className="px-5 py-3">Amount</th>
                <th className="px-5 py-3">Paid Amount</th>
                <th className="px-5 py-3">Status</th>
                <th className="px-5 py-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {invoices.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-5 py-8 text-slate-500">
                    No invoices generated yet.
                  </td>
                </tr>
              ) : (
                invoices.map(inv => (
                  <tr key={inv.id} className="hover:bg-slate-50/50">
                    <td className="px-5 py-3 font-medium text-slate-900">{inv.billType || "Standard Invoice"}</td>
                    <td className="px-5 py-3 text-slate-600">{inv.billDate || "—"}</td>
                    <td className="px-5 py-3 text-slate-600">{inv.dueDate || "—"}</td>
                    <td className="px-5 py-3 font-semibold text-slate-800">{formatCurrency(inv.amount)}</td>
                    <td className="px-5 py-3 text-emerald-600 font-medium">{formatCurrency(inv.paidAmount)}</td>
                    <td className="px-5 py-3"><StatusChip status={inv.status} /></td>
                    <td className="px-5 py-3">
                      <button 
                        onClick={() => setSelectedInvoice(inv)}
                        className="text-indigo-600 hover:text-indigo-800 text-sm font-medium"
                      >
                        View
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      <CreateInvoiceModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        projectId={projectId}
        clientId={clientId}
      />
      <ViewInvoiceModal
        isOpen={!!selectedInvoice}
        onClose={() => setSelectedInvoice(null)}
        invoice={selectedInvoice}
      />
    </div>
  );
}
