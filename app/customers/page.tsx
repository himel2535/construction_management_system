"use client";

import { useState } from "react";
import { 
  Users, 
  Building2, 
  Search, 
  RotateCcw, 
  Download, 
  Upload, 
  Eye, 
  Edit,
  Plus
} from "lucide-react";
import Loader from "@/components/ui/Loader";
import Link from "next/link";
import { useCustomers } from "@/lib/hooks/useCustomers";
import Sparkline from "@/components/ui/Sparkline";
import Avatar from "@/components/ui/Avatar";
import { TypePill, HealthPill } from "@/components/ui/StatusPill";
import CustomerDetailModal from "@/components/customers/CustomerDetailModal";
import EditCustomerModal from "@/components/customers/EditCustomerModal";
import { useProjects } from "@/lib/hooks/useProjects";

export default function CustomersPage() {
  const { data: customers = [], isLoading } = useCustomers();
  const { data: projects = [] } = useProjects();

  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [typeFilter, setTypeFilter] = useState<string>("all");

  const [viewingCustomer, setViewingCustomer] = useState<any>(null);
  const [editingCustomer, setEditingCustomer] = useState<any>(null);
  const [nameFilter, setNameFilter] = useState("");
  const [phoneFilter, setPhoneFilter] = useState("");
  const [emailFilter, setEmailFilter] = useState("");

  const filteredCustomers = customers.filter((customer) => {
    const matchesSearch = 
      customer.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (customer.companyName && customer.companyName.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (customer.phone && customer.phone.includes(searchQuery));
      
    const matchesName = nameFilter === "" || customer.name.toLowerCase().includes(nameFilter.toLowerCase());
    const matchesPhone = phoneFilter === "" || (customer.phone && customer.phone.includes(phoneFilter));
    const matchesEmail = emailFilter === "" || (customer.email && customer.email.toLowerCase().includes(emailFilter.toLowerCase()));
    
    const matchesStatus = statusFilter === "all" || customer.status === statusFilter;
    const matchesType = typeFilter === "all" || (customer.clientType || "private") === typeFilter;
    
    return matchesSearch && matchesStatus && matchesType && matchesName && matchesPhone && matchesEmail;
  });

  const totalCount = customers.length;
  const activeCount = customers.filter(c => c.status === "active").length;
  const inactiveCount = totalCount - activeCount;
  const withEmailCount = customers.filter(c => c.email && c.email.trim() !== "").length;
  const addedMonthCount = 0; // Mocked for now, need logic for 'added this month' based on createdAt
  
  const activePct = totalCount ? Math.round((activeCount / totalCount) * 100) : 0;
  const emailPct = totalCount ? Math.round((withEmailCount / totalCount) * 100) : 0;
  
  // Aggregate mock outstanding
  const totalOutstanding = customers.reduce((sum, c) => sum + (c.totalBilled || 0), 0);
  const formatCompactBDT = (val: number) => {
    if (!val) return "BDT 0";
    if (val >= 10000000) return `BDT ${(val / 10000000).toFixed(2)} Cr`;
    if (val >= 100000) return `BDT ${(val / 100000).toFixed(2)} L`;
    return `BDT ${val.toLocaleString()}`;
  };

  const formatDate = (d: string | number) => new Date(d).toLocaleDateString("en-US", { year: "numeric", month: "numeric", day: "numeric" });

  return (
    <div className="customers-page dashboard-page dashboard-mockup">
      {/* Metrics Row */}
      <div className="dash-kpi-row" id="cust-metrics">
        
        <div className="dash-kpi-card card cust-kpi-card cust-kpi-card--yellow">
          <div className="cust-kpi-spark">
            <Sparkline values={[2, 3, 4, totalCount || 1, totalCount || 2, totalCount || 3, totalCount || 4]} tone="yellow" />
          </div>
          <div className="dash-kpi-head">
            <div className="dash-kpi-icon dash-kpi-icon--flat !bg-transparent">
              <img src="/assets/icons/dashboard/cust-kpi-total-clients.svg" alt="Total Clients" className="w-10 h-10" />
            </div>
            <div className="dash-kpi-main">
              <span className="dash-kpi-label">Total Clients</span>
              <div className="dash-kpi-value">{totalCount}</div>
            </div>
          </div>
          <div className="dash-kpi-foot">
            <div className="dash-kpi-foot-left">{totalCount ? `${activeCount} active · ${inactiveCount} inactive` : "No clients yet"}</div>
          </div>
        </div>

        <div className="dash-kpi-card card cust-kpi-card">
          <div className="cust-kpi-spark">
            <Sparkline values={[1, 2, activeCount || 1, activeCount || 2, activeCount, activeCount, activeCount]} tone="green" />
          </div>
          <div className="dash-kpi-head">
            <div className="dash-kpi-icon dash-kpi-icon--flat !bg-transparent">
              <img src="/assets/icons/dashboard/cust-kpi-active-clients.svg" alt="Active Clients" className="w-10 h-10" />
            </div>
            <div className="dash-kpi-main">
              <span className="dash-kpi-label">Active Clients</span>
              <div className="dash-kpi-value">{activeCount}</div>
            </div>
          </div>
          <div className="dash-kpi-foot">
            <div className="dash-kpi-foot-left">{totalCount ? `${activePct}% of total` : "No active clients"}</div>
          </div>
        </div>

        <div className="dash-kpi-card card cust-kpi-card">
          <div className="cust-kpi-spark">
            <Sparkline values={[0, 1, 1, addedMonthCount || 1, addedMonthCount || 2, addedMonthCount, addedMonthCount]} tone="orange" />
          </div>
          <div className="dash-kpi-head">
            <div className="dash-kpi-icon dash-kpi-icon--flat !bg-transparent">
              <img src="/assets/icons/dashboard/cust-kpi-added-month.svg" alt="Added" className="w-10 h-10" />
            </div>
            <div className="dash-kpi-main">
              <span className="dash-kpi-label">Added This Month</span>
              <div className="dash-kpi-value">{addedMonthCount}</div>
            </div>
          </div>
          <div className="dash-kpi-foot">
            <div className="dash-kpi-foot-left">{addedMonthCount ? `${addedMonthCount} new this month` : "None added this month"}</div>
          </div>
        </div>

        <div className="dash-kpi-card card cust-kpi-card cust-kpi-card--yellow">
          <div className="cust-kpi-spark">
            <Sparkline values={[withEmailCount || 1, withEmailCount || 2, withEmailCount, withEmailCount, withEmailCount, withEmailCount, withEmailCount]} tone="yellow" />
          </div>
          <div className="dash-kpi-head">
            <div className="dash-kpi-icon dash-kpi-icon--flat !bg-transparent">
              <img src="/assets/icons/dashboard/cust-kpi-email.svg" alt="Email" className="w-10 h-10" />
            </div>
            <div className="dash-kpi-main">
              <span className="dash-kpi-label">With Email on File</span>
              <div className="dash-kpi-value">{withEmailCount}</div>
            </div>
          </div>
          <div className="dash-kpi-foot">
            <div className="dash-kpi-foot-left">{totalCount ? `${emailPct}% have email` : "No clients yet"}</div>
          </div>
        </div>

        <div className="dash-kpi-card card cust-kpi-card dash-kpi-card--attention">
          <div className="cust-kpi-spark">
            <Sparkline values={[totalOutstanding ? 4 : 2, 3, totalOutstanding ? 5 : 2, 4, totalOutstanding ? 6 : 2, 3, 2]} tone="red" />
          </div>
          <div className="dash-kpi-head">
            <div className="dash-kpi-icon dash-kpi-icon--flat !bg-transparent">
              <img src="/assets/icons/dashboard/cust-kpi-outstanding.svg" alt="Outstanding" className="w-10 h-10" />
            </div>
            <div className="dash-kpi-main">
              <span className="dash-kpi-label">Outstanding Receivable</span>
              <div className="dash-kpi-value">{formatCompactBDT(totalOutstanding)}</div>
            </div>
          </div>
          <div className="dash-kpi-foot">
            <div className="dash-kpi-foot-left">No overdue clients</div>
          </div>
        </div>
      </div>

      <section className="dash-widget dash-widget--clients card mt-4">
        <div className="dash-widget-head dash-widget-head--split">
          <div>
            <h3 className="dash-widget-title">Client Directory</h3>
            <p className="dash-widget-sub">Search, filter, and manage project owners</p>
          </div>
          <span className="cust-toolbar-count" id="cust-count">Showing {filteredCustomers.length} clients</span>
        </div>
        
        <div className="dash-widget-body">
          <div className="toolbar-row customers-toolbar">
            <div className="toolbar-filters">
              <input type="text" className="toolbar-input" placeholder="Name" value={nameFilter} onChange={e => setNameFilter(e.target.value)} />
              <input type="text" className="toolbar-input" placeholder="Phone" value={phoneFilter} onChange={e => setPhoneFilter(e.target.value)} />
              <input type="text" className="toolbar-input" placeholder="Email" value={emailFilter} onChange={e => setEmailFilter(e.target.value)} />
              <select className="toolbar-select" value={typeFilter} onChange={e => setTypeFilter(e.target.value)}>
                <option value="all">All types (Government/Private)</option>
                <option value="government">Government</option>
                <option value="private">Private</option>
              </select>
              <select className="toolbar-select" value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
                <option value="all">All statuses</option>
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>
            </div>
            <div className="toolbar-actions">
              <div className="cust-toolbar-search toolbar-search">
                <span className="search-icon" aria-hidden="true"><Search size={16} /></span>
                <input type="search" className="cust-toolbar-search-input" placeholder="Search clients..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} />
              </div>
              <div className="cust-toolbar-btn-group">
                <button type="button" className="btn btn-secondary btn-sm cust-toolbar-btn cust-toolbar-btn--clear" onClick={() => { setSearchQuery(""); setNameFilter(""); setPhoneFilter(""); setEmailFilter(""); setStatusFilter("all"); setTypeFilter("all"); }}>
                  <RotateCcw size={14} className="mr-1" /> Clear
                </button>
                <button type="button" className="btn btn-secondary btn-sm cust-toolbar-btn cust-toolbar-btn--export">
                  <Download size={14} className="mr-1" /> Export
                </button>
                <button type="button" className="btn btn-secondary btn-sm cust-toolbar-btn cust-toolbar-btn--import">
                  <Upload size={14} className="mr-1" /> Import
                </button>
                <Link href="/customers/new" className="btn btn-primary btn-sm bg-amber-600 text-white hover:bg-amber-700 border-none flex items-center gap-1">
                  <Plus size={16} /> Add New Client
                </Link>
              </div>
            </div>
          </div>
          
          <div className="table-wrap customers-table-wrap">
            <table className="dash-table customers-table">
              <thead>
                <tr>
                  <th className="col-num">#</th>
                  <th>CLIENT</th>
                  <th className="cust-col-center">TYPE</th>
                  <th>PHONE</th>
                  <th>EMAIL</th>
                  <th className="cust-col-center">LINKED PROJECTS</th>
                  <th className="cust-col-center">OUTSTANDING</th>
                  <th className="cust-col-center">STATUS</th>
                  <th className="cust-col-center">JOINED</th>
                  <th className="cust-col-center">ACTIONS</th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  <tr><td colSpan={10} className="text-center p-8"><Loader text="Loading clients..." /></td></tr>
                ) : filteredCustomers.length === 0 ? (
                  <tr><td colSpan={10} className="text-center p-8 text-slate-500">No customers match your filters.</td></tr>
                ) : filteredCustomers.map((c, idx) => (
                  <tr key={c.id || c.name} className="cust-row hover:bg-slate-50 transition-colors cursor-pointer" onClick={() => setViewingCustomer(c)}>
                    <td className="col-num">{idx + 1}</td>
                    <td>
                      <div className="cell-user cust-client-cell flex items-center gap-3">
                        <Avatar name={c.name} size="sm" />
                        <div className="cell-user-text cust-client-name-row flex flex-col">
                          <strong className="text-slate-900 font-semibold">{c.name}</strong>
                          <div className="text-xs text-slate-500 truncate max-w-[200px]">{c.companyName}</div>
                        </div>
                      </div>
                    </td>
                    <td className="cust-col-center"><TypePill type={c.clientType || "private"} /></td>
                    <td>{c.phone || <span className="text-muted">—</span>}</td>
                    <td>{c.email || <span className="text-muted">—</span>}</td>
                    <td className="cust-col-center">
                      {c.projectId ? (
                        <button type="button" className="cust-proj-pill-btn cust-proj-link">
                          <span className="cust-proj-pill">{projects.find((p: any) => p.id === c.projectId)?.name || "Unknown Project"}</span>
                        </button>
                      ) : (c.totalProjects || 0) > 0 ? (
                        <button type="button" className="cust-proj-pill-btn cust-proj-link">
                          <span className="cust-proj-pill">{c.totalProjects} project{c.totalProjects !== 1 ? "s" : ""}</span>
                        </button>
                      ) : <span className="text-muted">—</span>}
                    </td>
                    <td className="col-money cust-col-center">
                      {c.totalBilled ? (
                         <span className="cust-outstanding">{c.totalBilled?.toLocaleString()}</span>
                      ) : <span className="text-muted">—</span>}
                    </td>
                    <td className="cust-col-center">
                       <HealthPill health={c.status === "inactive" ? "delayed" : "on_track"} label={c.status === "inactive" ? "Inactive" : "Active"} />
                    </td>
                    <td className="col-date cust-col-center">
                       {c.createdAt ? formatDate(c.createdAt) : <span className="text-muted">—</span>}
                    </td>
                    <td className="cust-col-center">
                      <div className="table-actions table-actions--cust">
                        <button type="button" onClick={(e) => { e.stopPropagation(); setViewingCustomer(c); }} className="icon-btn icon-btn--sm view-cust text-slate-400 hover:text-slate-600"><Eye size={16} /></button>
                        <button type="button" onClick={(e) => { e.stopPropagation(); setEditingCustomer(c); }} className="icon-btn icon-btn--sm edit-cust text-slate-400 hover:text-slate-600"><Edit size={16} /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {viewingCustomer && (
        <CustomerDetailModal
          customer={viewingCustomer}
          onClose={() => setViewingCustomer(null)}
          onEdit={(c) => {
            setViewingCustomer(null);
            setEditingCustomer(c);
          }}
        />
      )}

      {editingCustomer && (
        <EditCustomerModal
          customer={editingCustomer}
          onClose={() => setEditingCustomer(null)}
        />
      )}
    </div>
  );
}
