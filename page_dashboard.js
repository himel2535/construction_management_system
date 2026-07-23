import { listenValue, listenList } from "./svc_data.js";
import { setActiveNav, refreshSidebarNav } from "./cmp_layout.js";
import { setPageChrome } from "./cmp_header.js";
import { getCurrentRole, getAssignedProjectIds } from "./svc_governance.js";
import { getCurrentUserId } from "./svc_auth.js";
import { enrichProjectList } from "./svc_projectDetails.js";
import {
  computeDashboardKpis,
  buildProjectPerformanceRows,
  buildAttentionItems,
  buildApprovalGroups,
  buildSiteActivity,
  buildProcurementAlerts,
  buildBillingSnapshot,
  buildBudgetSummary,
  buildUpcomingMilestones,
  buildCashFlowChartData,
} from "./util_dashboard.js";
import {
  renderKpiRow,
  renderProjectPerformanceTable,
  renderAttentionPanel,
  renderCashFlowComboChart,
  renderBudgetDonut,
  renderPendingApprovals,
  renderSiteActivity,
  renderProcurementAlerts,
  renderBillingPanel,
  renderMilestonesStrip,
} from "./cmp_dashboardWidgets.js";
import { navigateTo } from "./util_route.js";
import { fillDashboardSkeletons } from "./cmp_skeleton.js";

function parseNestedByProject(root) {
  const out = {};
  if (!root || typeof root !== "object") return out;
  for (const [pid, bucket] of Object.entries(root)) {
    if (!bucket || typeof bucket !== "object") continue;
    out[pid] = Object.entries(bucket).map(([id, row]) => ({ id, ...row }));
  }
  return out;
}

export function mountDashboard(container) {
  if (getCurrentRole() === "client") {
    navigateTo("/client-portal");
    container.innerHTML = "";
    return { unmount: () => {} };
  }

  setActiveNav();
  setPageChrome({
    title: "Dashboard",
    subtitle: "Welcome back! Here's what's happening with your business today.",
    showDateRange: true,
    quickActionLabel: "+ Quick Action",
    onQuickAction: () => {
      navigateTo("/projects/new");
    },
  });

  import("./svc_alertEngine.js").then(({ scanAndEmitAlerts }) => {
    scanAndEmitAlerts().catch(() => {});
  });

  container.innerHTML = "";

  const root = document.createElement("div");
  root.className = "dashboard-page dashboard-mockup";
  root.innerHTML = `
    <div class="dash-kpi-row" id="dash-kpi"></div>
    <div class="dash-row-2">
      <div id="dash-performance"></div>
      <div id="dash-attention"></div>
    </div>
    <div class="dash-row-3">
      <div id="dash-cashflow"></div>
      <div id="dash-budget"></div>
      <div id="dash-approvals"></div>
    </div>
    <div class="dash-row-4">
      <div id="dash-site"></div>
      <div id="dash-procurement"></div>
      <div id="dash-billing"></div>
    </div>
    <div id="dash-milestones"></div>
  `;
  container.appendChild(root);

  const hosts = {
    kpi: root.querySelector("#dash-kpi"),
    performance: root.querySelector("#dash-performance"),
    attention: root.querySelector("#dash-attention"),
    cashflow: root.querySelector("#dash-cashflow"),
    budget: root.querySelector("#dash-budget"),
    approvals: root.querySelector("#dash-approvals"),
    site: root.querySelector("#dash-site"),
    procurement: root.querySelector("#dash-procurement"),
    billing: root.querySelector("#dash-billing"),
    milestones: root.querySelector("#dash-milestones"),
  };

  fillDashboardSkeletons(hosts);

  const state = {
    projects: [],
    clientInvoices: [],
    milestonesByProject: {},
    paymentMilestonesByProject: {},
    ipcBillsByProject: {},
    documentsByProject: {},
    approvalQueue: [],
    attendance: [],
    materials: [],
    purchaseOrders: [],
    projectExpenses: [],
    maintenance: [],
    salaryPayments: [],
    siteDiariesByProject: {},
    siteInCharges: [],
    safetyIncidentsByProject: {},
    projectRosterByProject: {},
    materialRequestsByProject: {},
  };

  const ready = {
    projects: false,
    milestones: false,
    invoices: false,
    approvals: false,
    materials: false,
    purchaseOrders: false,
    attendance: false,
    expenses: false,
    salaries: false,
    siteDiaries: false,
    siteInCharges: false,
  };

  let cashFlowPeriod = "month";

  function visibleProjects() {
    const assigned = getAssignedProjectIds(getCurrentUserId(), getCurrentRole());
    if (assigned === null) return state.projects;
    return state.projects.filter((p) => assigned.includes(p.id));
  }

  function renderKpiSection() {
    if (!ready.projects) return;
    const projects = visibleProjects();
    renderKpiRow(hosts.kpi, computeDashboardKpis(state, projects));
  }

  function renderPerformanceSection() {
    if (!ready.projects || !ready.milestones) return;
    const projects = visibleProjects();
    renderProjectPerformanceTable(
      hosts.performance,
      buildProjectPerformanceRows(projects, state.milestonesByProject)
    );
  }

  function renderAttentionSection() {
    if (!ready.projects || !ready.materials) return;
    const projects = visibleProjects();
    renderAttentionPanel(hosts.attention, buildAttentionItems(state, projects));
  }

  function renderCashFlowSection() {
    if (!ready.projects || !ready.expenses || !ready.invoices || !ready.salaries) return;
    renderCashFlowComboChart(hosts.cashflow, buildCashFlowChartData(state, cashFlowPeriod), {
      period: cashFlowPeriod,
      onPeriodChange: (p) => {
        cashFlowPeriod = p;
        renderCashFlowSection();
      },
    });
  }

  function renderBudgetSection() {
    if (!ready.projects) return;
    const projects = visibleProjects();
    renderBudgetDonut(hosts.budget, buildBudgetSummary(projects));
  }

  function renderApprovalsSection() {
    if (!ready.approvals) return;
    renderPendingApprovals(hosts.approvals, buildApprovalGroups(state.approvalQueue));
  }

  function renderSiteSection() {
    if (!ready.projects || !ready.attendance || !ready.siteDiaries || !ready.siteInCharges) return;
    const projects = visibleProjects();
    renderSiteActivity(hosts.site, buildSiteActivity(state, projects));
  }

  function renderProcurementSection() {
    if (!ready.materials || !ready.purchaseOrders) return;
    renderProcurementAlerts(hosts.procurement, buildProcurementAlerts(state));
  }

  function renderBillingSection() {
    if (!ready.invoices) return;
    renderBillingPanel(hosts.billing, buildBillingSnapshot(state.clientInvoices));
  }

  function renderMilestonesSection() {
    if (!ready.projects || !ready.milestones) return;
    const projects = visibleProjects();
    const visibleIds = new Set(projects.map((p) => p.id));
    const scopedMilestones = {};
    for (const [pid, list] of Object.entries(state.milestonesByProject || {})) {
      if (visibleIds.has(pid)) scopedMilestones[pid] = list;
    }
    renderMilestonesStrip(hosts.milestones, buildUpcomingMilestones(scopedMilestones, projects));
  }

  const unsubs = [];

  unsubs.push(listenList("projects", (rows) => {
    state.projects = enrichProjectList(rows);
    ready.projects = true;
    renderKpiSection();
    renderBudgetSection();
    renderPerformanceSection();
    renderAttentionSection();
    renderMilestonesSection();
    refreshSidebarNav();
  }));
  unsubs.push(listenList("clientInvoices", (rows) => {
    state.clientInvoices = rows;
    ready.invoices = true;
    renderBillingSection();
    renderCashFlowSection();
    if (ready.projects) renderKpiSection();
  }));
  unsubs.push(listenList("approvalQueue", (rows) => {
    state.approvalQueue = rows;
    ready.approvals = true;
    renderApprovalsSection();
    refreshSidebarNav();
  }));
  unsubs.push(listenList("workerAttendance", (rows) => {
    state.attendance = rows;
    ready.attendance = true;
    renderSiteSection();
  }));
  unsubs.push(listenList("inventoryMaterials", (rows) => {
    state.materials = rows;
    ready.materials = true;
    renderAttentionSection();
    renderProcurementSection();
  }));
  unsubs.push(listenList("purchaseOrders", (rows) => {
    state.purchaseOrders = rows;
    ready.purchaseOrders = true;
    renderProcurementSection();
    renderCashFlowSection();
  }));
  unsubs.push(listenList("projectExpenses", (rows) => {
    state.projectExpenses = rows;
    ready.expenses = true;
    renderCashFlowSection();
    if (ready.projects) renderKpiSection();
  }));
  unsubs.push(listenList("assetMaintenance", (rows) => {
    state.maintenance = rows;
  }));
  unsubs.push(listenList("workerSalaryPayments", (rows) => {
    state.salaryPayments = rows;
    ready.salaries = true;
    renderCashFlowSection();
    if (ready.projects) renderKpiSection();
  }));
  unsubs.push(listenValue("projectMilestones", (rootVal) => {
    state.milestonesByProject = parseNestedByProject(rootVal);
    ready.milestones = true;
    renderPerformanceSection();
    renderMilestonesSection();
  }));
  unsubs.push(listenValue("paymentMilestones", (rootVal) => {
    state.paymentMilestonesByProject = parseNestedByProject(rootVal);
  }));
  unsubs.push(listenValue("ipcBills", (rootVal) => {
    state.ipcBillsByProject = parseNestedByProject(rootVal);
  }));
  unsubs.push(listenValue("projectDocuments", (rootVal) => {
    state.documentsByProject = parseNestedByProject(rootVal);
  }));
  unsubs.push(listenValue("siteDiaries", (rootVal) => {
    state.siteDiariesByProject = parseNestedByProject(rootVal);
    ready.siteDiaries = true;
    renderSiteSection();
  }));
  unsubs.push(listenList("siteInCharges", (rows) => {
    state.siteInCharges = rows;
    ready.siteInCharges = true;
    renderSiteSection();
  }));
  unsubs.push(listenValue("safetyIncidents", (rootVal) => {
    state.safetyIncidentsByProject = parseNestedByProject(rootVal);
  }));
  unsubs.push(listenValue("projectRoster", (rootVal) => {
    state.projectRosterByProject = parseNestedByProject(rootVal);
  }));
  unsubs.push(listenValue("materialRequests", (rootVal) => {
    state.materialRequestsByProject = parseNestedByProject(rootVal);
  }));

  return { unmount: () => unsubs.forEach((u) => u()) };
}
