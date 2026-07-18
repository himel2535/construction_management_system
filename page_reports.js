import { renderTable } from "./cmp_table.js";

import { listenList, listenValue } from "./svc_data.js";

import { formatBDT } from "./util_format.js";

import { setActiveNav } from "./cmp_layout.js";

import { statusChip } from "./cmp_ui.js";
import { showToast } from "./cmp_toast.js";
import { mountProcurementStockReports } from "./page_reports_procurement.js";
import { reconcileSitePayroll } from "./svc_payroll.js";
import { canPerformAction } from "./svc_governance.js";
import { paymentModeLabel } from "./util_payroll.js";



export function mountReports(container) {

  setActiveNav();

  const root = document.createElement("div");

  root.className = "page-content";



  const stats = document.createElement("div");

  stats.className = "stat-grid";

  stats.id = "report-stats";

  root.appendChild(stats);



  const billingHost = document.createElement("div");

  billingHost.style.marginTop = "1rem";

  const purchHost = document.createElement("div");

  purchHost.style.marginTop = "1rem";

  const financialHost = document.createElement("div");
  financialHost.className = "card card-pad financial-mgmt-section";
  financialHost.style.marginTop = "1rem";
  financialHost.innerHTML = `
    <h3 class="section-title">Financial management (§2.7)</h3>
    <div id="financial-mgmt-stats" class="r3-stat-row"></div>
    <div id="financial-invoice-snapshot" class="r3-report-block"></div>
  `;

  const projectCostHost = document.createElement("div");

  projectCostHost.className = "card card-pad";

  projectCostHost.style.marginTop = "1rem";

  projectCostHost.innerHTML = `<h3 class="section-title">Project cost control</h3><div id="project-cost-table"></div>`;



  const subcontractHost = document.createElement("div");

  subcontractHost.className = "card card-pad";

  subcontractHost.style.marginTop = "1rem";

  subcontractHost.innerHTML = `<h3 class="section-title">Subcontract exposure</h3><div id="subcontract-report-table"></div>`;



  const govHost = document.createElement("div");

  govHost.className = "card card-pad r3-reports";

  govHost.style.marginTop = "1rem";

  govHost.innerHTML = `

    <h3 class="section-title">Enterprise governance (Release 3)</h3>

    <div id="gov-compliance" class="r3-report-block"></div>

    <div id="gov-approvals" class="r3-report-block"></div>

    <div id="gov-co" class="r3-report-block"></div>

    <div id="gov-pnl" class="r3-report-block"></div>

  `;

  const hseDocHost = document.createElement("div");
  hseDocHost.className = "card card-pad hse-doc-section";
  hseDocHost.style.marginTop = "1rem";
  hseDocHost.innerHTML = `
    <h3 class="section-title">Document &amp; HSE (§2.8–2.9)</h3>
    <div id="hse-doc-stats" class="r3-stat-row"></div>
    <div id="document-expiry-stats" class="r3-report-block"></div>
  `;



  const analyticsHost = document.createElement("div");
  analyticsHost.className = "card card-pad analytics-section";
  analyticsHost.style.marginTop = "1rem";
  analyticsHost.innerHTML = `
    <h3 class="section-title">Reporting &amp; Analytics (§2.11)</h3>
    <div id="analytics-profitability" class="r3-report-block"></div>
    <div id="analytics-delays" class="r3-report-block"></div>
    <div id="analytics-utilization" class="r3-report-block"></div>
    <div id="analytics-sector" class="r3-report-block"></div>
  `;

  const workerPayrollHost = document.createElement("div");
  workerPayrollHost.className = "card card-pad worker-payroll-section";
  workerPayrollHost.style.marginTop = "1rem";
  workerPayrollHost.innerHTML = `
    <h3 class="section-title">Site Worker &amp; Payroll (§2.13)</h3>
    <div id="worker-payroll-site" class="r3-report-block"></div>
    <div id="worker-payroll-advances" class="r3-report-block"></div>
    <div id="worker-payroll-payments" class="r3-report-block"></div>
    <div id="worker-payroll-reconcile" class="r3-report-block"></div>
  `;

  const r4Host = document.createElement("div");

  r4Host.className = "card card-pad r4-reports";

  r4Host.style.marginTop = "1rem";

  r4Host.innerHTML = `

    <h3 class="section-title">Multi-tenant &amp; sync (Release 4)</h3>

    <div id="r4-tenants" class="r3-report-block"></div>

    <div id="r4-sync" class="r3-report-block"></div>

  `;



  const stockHost = document.createElement("div");
  stockHost.id = "procurement-stock-host";

  root.append(billingHost, purchHost, financialHost, projectCostHost, stockHost, subcontractHost, hseDocHost, govHost, analyticsHost, workerPayrollHost, r4Host);

  container.appendChild(root);



  let totalBilled = 0;

  let clientReceivable = 0;

  let monthExpense = 0;

  let subcontractOutstanding = 0;



  listenList("clientInvoices", (list) => {

    totalBilled = list

      .filter((b) => b.status !== "cancelled")

      .reduce((a, b) => a + Number(b.amount || 0), 0);

    clientReceivable = list

      .filter((b) => b.status !== "cancelled" && b.status !== "paid")

      .reduce((a, b) => a + Math.max(0, Number(b.amount || 0) - Number(b.paidAmount || 0)), 0);



    billingHost.innerHTML = "";

    billingHost.appendChild(

      renderTable(

        "client-billing-reg",

        [

          { key: "clientName", label: "Client" },

          { key: "projectName", label: "Project" },

          { key: "billType", label: "Type" },

          { key: "amount", label: "Amount", align: "right" },

          { key: "paidAmount", label: "Paid", align: "right" },

          { key: "status", label: "Status" },

        ],

        list,

        (b) => ({

          clientName: b.clientName,

          projectName: b.projectName || "—",

          billType: b.billType || "milestone",

          amount: formatBDT(b.amount),

          paidAmount: formatBDT(b.paidAmount || 0),

          status: b.status,

        })

      )

    );

    updateStats();

  });



  listenList("purchases", (list) => {

    const month = new Date().toISOString().slice(0, 7);

    monthExpense = list

      .filter((p) => p.date?.startsWith(month) && p.status !== "cancelled")

      .reduce((a, p) => a + p.amount, 0);

    purchHost.innerHTML = "";

    purchHost.appendChild(

      renderTable(

        "exp",

        [

          { key: "vendorName", label: "Vendor" },

          { key: "date", label: "Date" },

          { key: "amount", label: "Amount", align: "right" },

        ],

        list,

        (p) => ({

          vendorName: p.vendorName,

          date: p.date,

          amount: formatBDT(p.amount),

        })

      )

    );

    updateStats();

  });



  listenList("subcontracts", (list) => {

    subcontractOutstanding = list

      .filter((s) => s.status !== "closed")

      .reduce(

        (sum, s) => sum + Math.max(0, Number(s.contractValue || 0) - Number(s.paidAmount || 0)),

        0

      );



    const host = document.getElementById("subcontract-report-table");

    if (host) {

      if (!list.length) {

        host.innerHTML = `<p class="proj-empty">No subcontract records</p>`;

      } else {

        host.innerHTML = `

          <table class="dash-table">

            <thead><tr><th>Scope</th><th>Supplier</th><th class="text-right">Contract</th><th class="text-right">Paid</th><th class="text-right">Outstanding</th><th>Status</th></tr></thead>

            <tbody>

              ${list.map((s) => {

                const outstanding = Math.max(0, Number(s.contractValue || 0) - Number(s.paidAmount || 0));

                return `<tr>

                  <td>${s.scope || s.title || "—"}</td>

                  <td>${s.supplierName || "—"}</td>

                  <td class="text-right">${formatBDT(s.contractValue || 0)}</td>

                  <td class="text-right">${formatBDT(s.paidAmount || 0)}</td>

                  <td class="text-right">${formatBDT(outstanding)}</td>

                  <td>${statusChip(s.status || "active")}</td>

                </tr>`;

              }).join("")}

            </tbody>

          </table>

        `;

      }

    }

    updateStats();

  });



  listenValue("reportsCache/dailySummary", (s) => {

    if (s?.clientReceivable != null) clientReceivable = s.clientReceivable;

    if (s?.subcontractOutstanding != null) subcontractOutstanding = s.subcontractOutstanding;

    const invEl = document.getElementById("financial-invoice-snapshot");
    if (invEl && s) {
      invEl.innerHTML = `
        <h4 class="r3-subhead">Invoice snapshot</h4>
        <div class="r3-stat-row">
          <span>Open client bills (receivable): <strong>${formatBDT(s.clientReceivable || 0)}</strong></span>
          <span>Gov IPC outstanding: <strong>${formatBDT(s.govIpcOutstanding || 0)}</strong></span>
          <span>Subcontract outstanding: <strong>${formatBDT(s.subcontractOutstanding || 0)}</strong></span>
        </div>
      `;
    }

    updateStats();

  });



  listenValue("reportsCache/governanceCompliance", (g) => {

    const el = document.getElementById("gov-compliance");

    if (!el || !g) return;

    el.innerHTML = `

      <h4 class="r3-subhead">Quality &amp; safety compliance</h4>

      <div class="r3-stat-row">

        <span>Quality open: <strong>${g.qualityOpen}</strong></span>

        <span>Quality approved: <strong>${g.qualityApproved}</strong></span>

        <span>Safety open: <strong>${g.safetyOpen}</strong></span>

        <span>Critical/high: <strong>${g.safetyCritical}</strong></span>

        <span>Open NCRs: <strong>${g.ncrOpen ?? 0}</strong></span>

      </div>

    `;

    const hseEl = document.getElementById("hse-doc-stats");
    if (hseEl) {
      hseEl.innerHTML = `
        <span>Quality open: <strong>${g.qualityOpen ?? 0}</strong></span>
        <span>Safety open: <strong>${g.safetyOpen ?? 0}</strong></span>
        <span>Critical safety: <strong>${g.safetyCritical ?? 0}</strong></span>
        <span>Open NCRs: <strong>${g.ncrOpen ?? 0}</strong></span>
      `;
    }

  });

  listenValue("reportsCache/documentExpiry", (ex) => {
    const el = document.getElementById("document-expiry-stats");
    if (!el || !ex) return;
    el.innerHTML = `
      <h4 class="r3-subhead">Permit &amp; license expiry</h4>
      <div class="r3-stat-row">
        <span>Expiring within 30 days: <strong>${ex.warn ?? 0}</strong></span>
        <span>Expired: <strong>${ex.critical ?? 0}</strong></span>
      </div>
    `;
  });

  listenValue("reportsCache/hseSummary", (h) => {
    if (!h) return;
    const el = document.getElementById("hse-doc-stats");
    if (el) {
      el.innerHTML = `
        <span>Quality open: <strong>${h.qualityOpen ?? 0}</strong></span>
        <span>Safety open: <strong>${h.safetyOpen ?? 0}</strong></span>
        <span>Critical safety: <strong>${h.safetyCritical ?? 0}</strong></span>
        <span>Open NCRs: <strong>${h.ncrOpen ?? 0}</strong></span>
      `;
    }
  });

  listenValue("reportsCache/pendingApprovals", (list) => {

    const el = document.getElementById("gov-approvals");

    if (!el) return;

    const rows = list || [];

    el.innerHTML = `

      <h4 class="r3-subhead">Pending approvals aging</h4>

      ${rows.length ? `<table class="dash-table"><thead><tr><th>Entity</th><th>Title</th><th>Age (days)</th></tr></thead>

        <tbody>${rows.map((r) => `<tr><td>${r.entityType}</td><td>${r.title || "—"}</td><td>${r.ageDays}</td></tr>`).join("")}</tbody></table>`

        : `<p class="proj-empty">No pending approvals</p>`}

    `;

    const finStats = document.getElementById("financial-mgmt-stats");
    if (finStats) {
      const expensePending = rows.filter((r) => r.entityType === "projectExpense").length;
      finStats.innerHTML = `
        <span>Expense approvals pending: <strong>${expensePending}</strong></span>
        <span>Total pending items: <strong>${rows.length}</strong></span>
      `;
    }

  });

  let lastCo = null;

  let lastClaim = null;

  function renderCoExposure() {

    const el = document.getElementById("gov-co");

    if (!el) return;

    el.innerHTML = `

      <h4 class="r3-subhead">Change orders &amp; claim exposure</h4>

      <div class="r3-stat-row">

        <span>CO approved value: <strong>${formatBDT(lastCo?.approvedValue || 0)}</strong></span>

        <span>CO pending: <strong>${formatBDT(lastCo?.pendingValue || 0)}</strong></span>

        <span>Claim exposure: <strong>${formatBDT(lastClaim?.total || 0)}</strong></span>

      </div>

    `;

  }

  listenValue("reportsCache/changeOrderSummary", (co) => {

    lastCo = co;

    renderCoExposure();

  });

  listenValue("reportsCache/claimExposure", (ex) => {

    lastClaim = ex;

    renderCoExposure();

  });

  listenValue("reportsCache/projectPnL", (rows) => {

    const el = document.getElementById("gov-pnl");

    if (!el) return;

    const list = rows || [];

    el.innerHTML = `

      <h4 class="r3-subhead">Project P&amp;L snapshot</h4>

      ${list.length ? `<table class="dash-table"><thead><tr><th>Project</th><th class="text-right">Revenue</th><th class="text-right">Actual cost</th><th class="text-right">Margin</th></tr></thead>

        <tbody>${list.map((r) => `<tr><td>${r.name}</td><td class="text-right">${formatBDT(r.revenue)}</td><td class="text-right">${formatBDT(r.actualCost)}</td><td class="text-right">${formatBDT(r.margin)}</td></tr>`).join("")}</tbody></table>`

        : `<p class="proj-empty">No P&amp;L data</p>`}

    `;

  });



  listenValue("reportsCache/tenantOps", (rows) => {

    const el = document.getElementById("r4-tenants");

    if (!el) return;

    const list = rows || [];

    el.innerHTML = `

      <h4 class="r3-subhead">Tenant operations</h4>

      <table class="dash-table"><thead><tr><th>Company</th><th>Code</th><th>Status</th></tr></thead>

        <tbody>${list.map((t) => `<tr><td>${t.name}</td><td>${t.code}</td><td>${t.active ? statusChip("on_time", "active") : statusChip("delayed", "inactive")}</td></tr>`).join("")}</tbody></table>

    `;

  });



  listenValue("reportsCache/syncHealth", (s) => {

    const el = document.getElementById("r4-sync");

    if (!el || !s) return;

    el.innerHTML = `

      <h4 class="r3-subhead">Offline sync health</h4>

      <div class="r3-stat-row">

        <span>Device: <strong>${s.deviceId}</strong></span>

        <span>Pending ops: <strong>${s.pendingOps}</strong></span>

        <span>Conflicts: <strong>${s.conflictCount}</strong></span>

        <span>Online: <strong>${s.online ? "yes" : "no"}</strong></span>

      </div>

    `;

  });



  listenValue("reportsCache/projectCostSummary", (rows) => {

    const host = document.getElementById("project-cost-table");

    if (!host) return;

    const list = rows || [];

    if (!list.length) {

      host.innerHTML = `<p class="proj-empty">No project cost data</p>`;

      return;

    }

    host.innerHTML = `

      <table class="dash-table">

        <thead><tr><th>Project</th><th class="text-right">Budget</th><th class="text-right">Committed</th><th class="text-right">Actual</th><th class="text-right">Remaining</th><th>Util %</th></tr></thead>

        <tbody>

          ${list.map((r) => `

            <tr>

              <td>${r.name}</td>

              <td class="text-right">${formatBDT(r.budgetTotal)}</td>

              <td class="text-right">${formatBDT(r.committed)}</td>

              <td class="text-right">${formatBDT(r.actual)}</td>

              <td class="text-right">${formatBDT(r.remaining)}</td>

              <td>${r.overBudget ? statusChip("delayed") : statusChip("on_time")} ${r.utilization}%</td>

            </tr>`).join("")}

        </tbody>

      </table>

    `;

  });



  listenValue("reportsCache/analytics", (a) => {
    if (!a) return;
    const profEl = document.getElementById("analytics-profitability");
    if (profEl) {
      const rows = a.profitability || [];
      profEl.innerHTML = `
        <h4 class="r3-subhead">Project profitability</h4>
        ${rows.length ? `<table class="dash-table"><thead><tr><th>Project</th><th>Sector</th><th class="text-right">Revenue</th><th class="text-right">Cost</th><th class="text-right">Margin</th><th>Margin %</th></tr></thead>
          <tbody>${rows.map((r) => `<tr><td>${r.name}</td><td>${r.sector}</td><td class="text-right">${formatBDT(r.revenue)}</td><td class="text-right">${formatBDT(r.cost)}</td><td class="text-right">${formatBDT(r.margin)}</td><td>${r.marginPct}%</td></tr>`).join("")}</tbody></table>`
          : `<p class="proj-empty">No profitability data</p>`}
      `;
    }

    const delayEl = document.getElementById("analytics-delays");
    if (delayEl && a.delayAnalysis) {
      const rows = a.delayAnalysis.delayedRows || [];
      const causes = a.delayAnalysis.causeSummary || [];
      delayEl.innerHTML = `
        <h4 class="r3-subhead">Delay analysis</h4>
        ${causes.length ? `<div class="analytics-cause-row">${causes.map((c) => `<span class="chip delay-cause--${c.cause}">${c.label}: ${c.count}</span>`).join("")}</div>` : ""}
        ${rows.length ? `<table class="dash-table"><thead><tr><th>Project</th><th>Milestone</th><th>Planned</th><th>Days late</th><th>Cause</th></tr></thead>
          <tbody>${rows.map((r) => `<tr><td>${r.projectName}</td><td>${r.title}</td><td>${r.plannedDate}</td><td>${r.daysLate}</td><td><span class="chip delay-cause--${r.delayCause}">${r.delayCauseLabel}</span></td></tr>`).join("")}</tbody></table>`
          : `<p class="proj-empty">No delayed milestones</p>`}
      `;
    }

    const utilEl = document.getElementById("analytics-utilization");
    if (utilEl && a.resourceUtilization) {
      const over = a.resourceUtilization.overAllocated || [];
      const under = a.resourceUtilization.underAllocated || [];
      utilEl.innerHTML = `
        <h4 class="r3-subhead">Resource utilization</h4>
        <div class="analytics-util-grid">
          <div><strong>Over-allocated</strong>
            ${over.length ? `<ul class="analytics-util-list">${over.map((u) => `<li>${u.name} — ${u.total}% across ${u.projects.length} project(s)</li>`).join("")}</ul>` : `<p class="proj-empty">None</p>`}
          </div>
          <div><strong>Under-allocated (&lt;50%)</strong>
            ${under.length ? `<ul class="analytics-util-list">${under.map((u) => `<li>${u.name} — ${u.total}%</li>`).join("")}</ul>` : `<p class="proj-empty">None</p>`}
          </div>
        </div>
      `;
    }

    const sectorEl = document.getElementById("analytics-sector");
    if (sectorEl && a.sectorComparison) {
      const gov = a.sectorComparison.Government || {};
      const priv = a.sectorComparison.Private || {};
      sectorEl.innerHTML = `
        <h4 class="r3-subhead">Government vs Private performance</h4>
        <div class="sector-compare-grid">
          ${[["Government", gov], ["Private", priv]].map(([label, s]) => `
            <div class="sector-compare-card">
              <h5>${label}</h5>
              <dl class="sector-kpi-list">
                <div><dt>Projects</dt><dd>${s.projectCount ?? 0}</dd></div>
                <div><dt>Avg margin</dt><dd>${s.avgMarginPct ?? 0}%</dd></div>
                <div><dt>Delayed milestones</dt><dd>${s.delayedCount ?? 0}</dd></div>
              </dl>
              <div class="sector-bar" aria-hidden="true"><span style="width:${Math.min(100, s.avgMarginPct ?? 0)}%"></span></div>
            </div>
          `).join("")}
        </div>
      `;
    }
  });



  function renderWorkerPayrollReports(data) {
    if (!data) return;
    const siteEl = document.getElementById("worker-payroll-site");
    if (siteEl) {
      const rows = data.siteSummary || [];
      siteEl.innerHTML = `
        <h4 class="r3-subhead">Site-wise payroll summary</h4>
        ${rows.length ? `<table class="dash-table"><thead><tr><th>Project</th><th class="text-right">Labor paid</th><th class="text-right">Calculated</th></tr></thead>
          <tbody>${rows.map((r) => `<tr><td>${r.projectName}</td><td class="text-right">${formatBDT(r.laborPaid)}</td><td class="text-right">${formatBDT(r.laborCalculated)}</td></tr>`).join("")}</tbody></table>`
          : `<p class="proj-empty">No payroll data</p>`}
      `;
    }
    const advEl = document.getElementById("worker-payroll-advances");
    if (advEl) {
      const rows = data.outstandingAdvances || [];
      advEl.innerHTML = `
        <h4 class="r3-subhead">Outstanding advances</h4>
        ${rows.length ? `<table class="dash-table"><thead><tr><th>Worker</th><th class="text-right">Outstanding</th></tr></thead>
          <tbody>${rows.map((r) => `<tr><td>${r.workerName}</td><td class="text-right">${formatBDT(r.outstanding)}</td></tr>`).join("")}</tbody></table>`
          : `<p class="proj-empty">No outstanding advances</p>`}
      `;
    }
    const payEl = document.getElementById("worker-payroll-payments");
    if (payEl) {
      const rows = data.paymentLog || [];
      payEl.innerHTML = `
        <h4 class="r3-subhead">Payment confirmation log</h4>
        ${rows.length ? `<table class="dash-table"><thead><tr><th>Date</th><th>Worker</th><th class="text-right">Amount</th><th>Mode</th><th>Site In-charge</th></tr></thead>
          <tbody>${rows.slice(0, 15).map((r) => `<tr><td>${r.date || "—"}</td><td>${r.workerName}</td><td class="text-right">${formatBDT(r.amount)}</td><td>${paymentModeLabel(r.paymentMode)}</td><td>${r.siteInChargeName}</td></tr>`).join("")}</tbody></table>`
          : `<p class="proj-empty">No payments logged</p>`}
      `;
    }
    const recEl = document.getElementById("worker-payroll-reconcile");
    if (recEl && (canPerformAction("approve") || canPerformAction("approve_expense"))) {
      const month = data.monthKey || new Date().toISOString().slice(0, 7);
      recEl.innerHTML = `
        <h4 class="r3-subhead">Accountant reconciliation</h4>
        <p class="section-sub">Reconcile site payroll against project labor budget for ${month}.</p>
        <button type="button" class="btn btn-primary btn-sm" id="reports-reconcile-payroll">Reconcile first project</button>
      `;
      recEl.querySelector("#reports-reconcile-payroll")?.addEventListener("click", async () => {
        const pid = data.siteSummary?.[0]?.projectId;
        if (!pid) {
          showToast("No project in summary", "error");
          return;
        }
        try {
          await reconcileSitePayroll(pid, month);
          showToast("Payroll reconciled");
        } catch (err) {
          showToast(err.message, "error");
        }
      });
    }
  }

  listenValue("reportsCache/workerPayroll", (data) => renderWorkerPayrollReports(data));



  function updateStats() {

    stats.innerHTML = `

      <div class="card card-pad stat-card"><div class="label">Total billed</div><div class="value">${formatBDT(totalBilled)}</div></div>

      <div class="card card-pad stat-card"><div class="label">Client receivable</div><div class="value">${formatBDT(clientReceivable)}</div></div>

      <div class="card card-pad stat-card"><div class="label">Subcontract outstanding</div><div class="value">${formatBDT(subcontractOutstanding)}</div></div>

      <div class="card card-pad stat-card"><div class="label">Monthly expense</div><div class="value">${formatBDT(monthExpense)}</div></div>

    `;

  }



  updateStats();

  const unmountStock = mountProcurementStockReports(stockHost);

  return { unmount: () => unmountStock?.() };

}

