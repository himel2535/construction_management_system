import { renderTable } from "./cmp_table.js";
import { listenList, listenValue } from "./svc_data.js";
import { formatBDT } from "./util_format.js";
import { setActiveNav } from "./cmp_layout.js";
import { setPageChrome } from "./cmp_header.js";
import { statusChip } from "./cmp_ui.js";
import { showToast } from "./cmp_toast.js";
import { mountProcurementStockReports } from "./page_reports_procurement.js";
import { reconcileSitePayroll } from "./svc_payroll.js";
import { canPerformAction } from "./svc_governance.js";
import {
  REPORT_TABLE_PREVIEW,
  REPORT_VIEW_ALL,
  renderProjectCostTable,
  renderAnalyticsBlocks,
  renderWorkerPayrollBlocks,
  renderReportsKpiRow,
  renderFinancialMgmtPanel,
  renderHseDocPanel,
  renderGovernancePanel,
  renderMultitenantBlocks,
  reportsWidgetShell,
  REPORT_SECTION_TABS,
  REPORTS_TAB_STORAGE_KEY,
  renderReportsTabBar,
  wrapReportsTabPanel,
} from "./cmp_reports.js";

function simpleReportsWidget(title, sub, bodyId, opts = {}) {
  const el = document.createElement("div");
  el.innerHTML = reportsWidgetShell({ title, sub, bodyId, ...opts });
  return el.firstElementChild;
}

function styleReportsTableBlock(hostEl, tableBlock) {
  if (!hostEl || !tableBlock) return;
  tableBlock.classList.add("reports-table-wrap");
  const table = tableBlock.querySelector("table");
  if (table) table.classList.add("dash-table", "projects-table");
  hostEl.appendChild(tableBlock);
}

export function mountReports(container) {
  setActiveNav();
  setPageChrome({
    title: "Reports",
    subtitle: "Summary reports and governance metrics — use tabs below to switch areas.",
  });

  const root = document.createElement("div");
  root.className = "reports-page dashboard-page dashboard-mockup";

  const stats = document.createElement("div");
  stats.className = "dash-kpi-row";
  stats.id = "report-stats";
  root.appendChild(stats);

  const tabHostEl = document.createElement("div");
  tabHostEl.className = "rep-tab-host";

  const contentHostEl = document.createElement("div");
  contentHostEl.className = "rep-content-host";

  let activeTab = sessionStorage.getItem(REPORTS_TAB_STORAGE_KEY) || "billing";
  if (!REPORT_SECTION_TABS.some((t) => t.id === activeTab)) activeTab = "billing";

  function isVisible(tabId) {
    return activeTab === tabId;
  }

  function setActiveTab(id) {
    if (!REPORT_SECTION_TABS.some((t) => t.id === id)) return;
    activeTab = id;
    try {
      sessionStorage.setItem(REPORTS_TAB_STORAGE_KEY, id);
    } catch {
      /* ignore */
    }
    contentHostEl.querySelectorAll(".rep-tab-panel").forEach((panel) => {
      const on = panel.dataset.repTab === id;
      panel.hidden = !on;
    });
    tabHostEl.querySelectorAll(".rep-tab-pill").forEach((btn) => {
      const on = btn.dataset.repTab === id;
      btn.classList.toggle("is-active", on);
      btn.setAttribute("aria-selected", on ? "true" : "false");
    });
  }

  const billingWidget = simpleReportsWidget("Client billing register", "Invoices and collection status", "billing-table-host", {
    headerIcon: "billing",
  });
  const purchWidget = simpleReportsWidget("Purchases & expenses", "Vendor spend register", "purchases-table-host", {
    headerIcon: "purchases",
  });
  const financialWidget = simpleReportsWidget(
    "Financial management",
    "Pending approvals and receivables snapshot",
    "financial-mgmt-body",
    { headerIcon: "financial" }
  );
  financialWidget.classList.add("financial-mgmt-section");

  const projectCostWidget = simpleReportsWidget(
    "Project cost control",
    "Budget, committed, and actual by project",
    "project-cost-body",
    { viewAllHref: REPORT_VIEW_ALL.projectCost, headerIcon: "projectCost" }
  );

  const stockWidget = simpleReportsWidget(
    "Procurement & stock",
    "PO workflow on Purchases — central stock GRN, issue, usage",
    "procurement-stock-host",
    { headerIcon: "purchases" }
  );
  stockWidget.classList.add("procurement-stock-section");

  const subcontractWidget = simpleReportsWidget("Subcontract exposure", "Contract value and outstanding", "subcontract-report-table");

  const hseWidget = simpleReportsWidget(
    "Document & HSE",
    "Quality, safety, and permit expiry snapshot",
    "hse-doc-body",
    { headerIcon: "hse" }
  );
  hseWidget.classList.add("hse-doc-section");

  const govWidget = simpleReportsWidget(
    "Enterprise governance",
    "Compliance, approvals, exposure, and P&L snapshot",
    "gov-reports-body",
    { headerIcon: "governance" }
  );
  govWidget.classList.add("governance-reports-section");

  const analyticsWidget = simpleReportsWidget(
    "Reporting & Analytics",
    "Profitability, delays, utilization, and sector KPIs",
    "analytics-body",
    { viewAllHref: REPORT_VIEW_ALL.analytics, headerIcon: "analytics" }
  );
  analyticsWidget.classList.add("analytics-reports-section");

  const workerPayrollWidget = simpleReportsWidget(
    "Site Worker & Payroll",
    "Site payroll, advances, and payment confirmation",
    "worker-payroll-body",
    { viewAllHref: REPORT_VIEW_ALL.workerPayroll, headerIcon: "workerPayroll" }
  );
  workerPayrollWidget.classList.add("worker-payroll-reports-section");

  const multitenantWidget = simpleReportsWidget(
    "Multi-tenant & sync",
    "Registered companies and device sync status",
    "multitenant-body",
    { headerIcon: "multitenant" }
  );
  multitenantWidget.classList.add("multitenant-reports-section");

  const sectionNodes = [
    ["billing", billingWidget],
    ["purchases", purchWidget],
    ["financial", financialWidget],
    ["project_cost", projectCostWidget],
    ["procurement", stockWidget],
    ["subcontract", subcontractWidget],
    ["hse", hseWidget],
    ["governance", govWidget],
    ["analytics", analyticsWidget],
    ["payroll", workerPayrollWidget],
    ["multitenant", multitenantWidget],
  ];

  for (const [tabId, node] of sectionNodes) {
    contentHostEl.appendChild(wrapReportsTabPanel(tabId, node, isVisible(tabId)));
  }

  root.append(tabHostEl, contentHostEl);
  container.appendChild(root);

  tabHostEl.appendChild(renderReportsTabBar(REPORT_SECTION_TABS, activeTab, setActiveTab));
  setActiveTab(activeTab);

  const billingHost = billingWidget.querySelector("#billing-table-host");
  const purchHost = purchWidget.querySelector("#purchases-table-host");

  let totalBilled = 0;

  let clientReceivable = 0;

  let monthExpense = 0;

  let subcontractOutstanding = 0;

  let finExpensePending = 0;
  let finTotalPending = 0;
  let finClientReceivable = 0;
  let finGovIpcOutstanding = 0;
  let finSubcontractOutstanding = 0;
  let govPending = [];

  function refreshFinancialPanel() {
    const el = document.getElementById("financial-mgmt-body");
    if (!el) return;
    el.innerHTML = renderFinancialMgmtPanel({
      expensePending: finExpensePending,
      totalPending: finTotalPending,
      clientReceivable: finClientReceivable,
      govIpcOutstanding: finGovIpcOutstanding,
      subcontractOutstanding: finSubcontractOutstanding,
      pendingApprovals: govPending,
    });
  }

  refreshFinancialPanel();

  let hseQualityOpen = 0;
  let hseQualityApproved = 0;
  let hseSafetyOpen = 0;
  let hseSafetyCritical = 0;
  let hseNcrOpen = 0;
  let hseExpiringWarn = 0;
  let hseExpired = 0;

  function refreshHseDocPanel() {
    const el = document.getElementById("hse-doc-body");
    if (!el) return;
    el.innerHTML = renderHseDocPanel({
      qualityOpen: hseQualityOpen,
      qualityApproved: hseQualityApproved,
      safetyOpen: hseSafetyOpen,
      safetyCritical: hseSafetyCritical,
      ncrOpen: hseNcrOpen,
      expiringWarn: hseExpiringWarn,
      expired: hseExpired,
    });
  }

  refreshHseDocPanel();

  let govCompliance = null;
  let govCo = null;
  let govClaim = null;
  let govPnl = [];

  function refreshGovernancePanel() {
    const el = document.getElementById("gov-reports-body");
    if (!el) return;
    el.innerHTML = renderGovernancePanel({
      compliance: govCompliance,
      pendingApprovals: govPending,
      changeOrders: govCo,
      claimExposure: govClaim,
      pnlRows: govPnl,
    });
  }

  refreshGovernancePanel();

  listenList("clientInvoices", (list) => {

    totalBilled = list

      .filter((b) => b.status !== "cancelled")

      .reduce((a, b) => a + Number(b.amount || 0), 0);

    clientReceivable = list

      .filter((b) => b.status !== "cancelled" && b.status !== "paid")

      .reduce((a, b) => a + Math.max(0, Number(b.amount || 0) - Number(b.paidAmount || 0)), 0);



    billingHost.innerHTML = "";
    styleReportsTableBlock(
      billingHost,
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
    styleReportsTableBlock(
      purchHost,
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

          <table class="dash-table projects-table">

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

    if (!s) return;

    if (s.clientReceivable != null) clientReceivable = s.clientReceivable;

    if (s.subcontractOutstanding != null) subcontractOutstanding = s.subcontractOutstanding;

    finClientReceivable = s.clientReceivable ?? 0;
    finGovIpcOutstanding = s.govIpcOutstanding ?? 0;
    finSubcontractOutstanding = s.subcontractOutstanding ?? 0;
    refreshFinancialPanel();

    updateStats();

  });



  listenValue("reportsCache/governanceCompliance", (g) => {

    if (!g) return;

    govCompliance = g;
    refreshGovernancePanel();

    if (g.qualityOpen != null) hseQualityOpen = g.qualityOpen ?? 0;
    if (g.qualityApproved != null) hseQualityApproved = g.qualityApproved ?? 0;
    if (g.safetyOpen != null) hseSafetyOpen = g.safetyOpen ?? 0;
    if (g.safetyCritical != null) hseSafetyCritical = g.safetyCritical ?? 0;
    if (g.ncrOpen != null) hseNcrOpen = g.ncrOpen ?? 0;
    refreshHseDocPanel();

  });

  listenValue("reportsCache/documentExpiry", (ex) => {
    if (!ex) return;
    hseExpiringWarn = ex.warn ?? 0;
    hseExpired = ex.critical ?? 0;
    refreshHseDocPanel();
  });

  listenValue("reportsCache/hseSummary", (h) => {
    if (!h) return;
    hseQualityOpen = h.qualityOpen ?? 0;
    hseSafetyOpen = h.safetyOpen ?? 0;
    hseSafetyCritical = h.safetyCritical ?? 0;
    hseNcrOpen = h.ncrOpen ?? 0;
    refreshHseDocPanel();
  });

  listenValue("reportsCache/pendingApprovals", (list) => {

    const rows = list || [];

    govPending = rows;
    refreshGovernancePanel();

    finExpensePending = rows.filter((r) => r.entityType === "projectExpense").length;
    finTotalPending = rows.length;
    refreshFinancialPanel();

  });

  listenValue("reportsCache/changeOrderSummary", (co) => {

    govCo = co;
    refreshGovernancePanel();

  });

  listenValue("reportsCache/claimExposure", (ex) => {

    govClaim = ex;
    refreshGovernancePanel();

  });

  listenValue("reportsCache/projectPnL", (rows) => {
    govPnl = rows || [];
    refreshGovernancePanel();
  });

  let multitenantOps = [];
  let multitenantSync = null;

  function refreshMultitenantPanel() {
    const el = document.getElementById("multitenant-body");
    if (!el) return;
    el.innerHTML = renderMultitenantBlocks({
      tenantOps: multitenantOps,
      syncHealth: multitenantSync,
    });
  }

  refreshMultitenantPanel();

  listenValue("reportsCache/tenantOps", (rows) => {
    multitenantOps = rows || [];
    refreshMultitenantPanel();
  });

  listenValue("reportsCache/syncHealth", (s) => {
    multitenantSync = s || null;
    refreshMultitenantPanel();
  });

  listenValue("reportsCache/projectCostSummary", (rows) => {
    const host = document.getElementById("project-cost-body");
    if (!host) return;
    host.innerHTML = renderProjectCostTable(rows || [], {
      limit: REPORT_TABLE_PREVIEW,
      viewAllHref: REPORT_VIEW_ALL.projectCost,
      showViewAllLink: false,
    });
  });

  listenValue("reportsCache/analytics", (a) => {
    const host = document.getElementById("analytics-body");
    if (!host) return;
    if (!a) {
      host.innerHTML = `<p class="proj-empty">No analytics data</p>`;
      return;
    }
    host.innerHTML = renderAnalyticsBlocks(a, {
      tableLimit: REPORT_TABLE_PREVIEW,
      viewAllHref: REPORT_VIEW_ALL.analytics,
      showViewAllLink: false,
    });
  });

  function bindPayrollReconcile(scope, data) {
    scope.querySelector("#reports-reconcile-payroll")?.addEventListener("click", async () => {
      const pid = data?.siteSummary?.[0]?.projectId;
      if (!pid) {
        showToast("No project in summary", "error");
        return;
      }
      const month = data?.monthKey || new Date().toISOString().slice(0, 7);
      try {
        await reconcileSitePayroll(pid, month);
        showToast("Payroll reconciled");
      } catch (err) {
        showToast(err.message, "error");
      }
    });
  }

  function renderWorkerPayrollReports(data) {
    const host = document.getElementById("worker-payroll-body");
    if (!host) return;
    if (!data) return;
    const showReconcile = canPerformAction("approve") || canPerformAction("approve_expense");
    host.innerHTML = renderWorkerPayrollBlocks(data, {
      tableLimit: REPORT_TABLE_PREVIEW,
      viewAllHref: REPORT_VIEW_ALL.workerPayroll,
      includeReconcile: showReconcile,
      showViewAllLink: false,
    });
    if (showReconcile) bindPayrollReconcile(host, data);
  }

  listenValue("reportsCache/workerPayroll", (data) => renderWorkerPayrollReports(data));

  function updateStats() {
    stats.innerHTML = renderReportsKpiRow({
      totalBilled,
      clientReceivable,
      subcontractOutstanding,
      monthExpense,
    });
  }



  updateStats();

  const unmountStock = mountProcurementStockReports(stockWidget.querySelector("#procurement-stock-host"));

  return { unmount: () => unmountStock?.() };

}

