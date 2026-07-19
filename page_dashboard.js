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
    location.hash = "#/client-portal";
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
      location.hash = "#/projects/new";
    },
  });

  import("./svc_alertEngine.js").then(({ scanAndEmitAlerts }) => {
    scanAndEmitAlerts().catch(() => {});
  });

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

  let cashFlowPeriod = "month";

  function visibleProjects() {
    const assigned = getAssignedProjectIds(getCurrentUserId(), getCurrentRole());
    if (assigned === null) return state.projects;
    return state.projects.filter((p) => assigned.includes(p.id));
  }

  function renderDashboard() {
    const projects = visibleProjects();
    const kpis = computeDashboardKpis(state, projects);
    renderKpiRow(hosts.kpi, kpis);
    renderProjectPerformanceTable(hosts.performance, buildProjectPerformanceRows(projects, state.milestonesByProject));
    renderAttentionPanel(hosts.attention, buildAttentionItems(state, projects));
    renderCashFlowComboChart(hosts.cashflow, buildCashFlowChartData(state, cashFlowPeriod), {
      period: cashFlowPeriod,
      onPeriodChange: (p) => {
        cashFlowPeriod = p;
        renderDashboard();
      },
    });
    renderBudgetDonut(hosts.budget, buildBudgetSummary(projects));
    renderPendingApprovals(hosts.approvals, buildApprovalGroups(state.approvalQueue));
    renderSiteActivity(hosts.site, buildSiteActivity(state, projects));
    renderProcurementAlerts(hosts.procurement, buildProcurementAlerts(state));
    renderBillingPanel(hosts.billing, buildBillingSnapshot(state.clientInvoices));
    renderMilestonesStrip(hosts.milestones, buildUpcomingMilestones(state.milestonesByProject, projects));
  }

  const unsubs = [];
  const refresh = () => {
    renderDashboard();
    refreshSidebarNav();
  };

  unsubs.push(listenList("projects", (rows) => {
    state.projects = enrichProjectList(rows);
    refresh();
  }));
  unsubs.push(listenList("clientInvoices", (rows) => {
    state.clientInvoices = rows;
    refresh();
  }));
  unsubs.push(listenList("approvalQueue", (rows) => {
    state.approvalQueue = rows;
    refresh();
  }));
  unsubs.push(listenList("workerAttendance", (rows) => {
    state.attendance = rows;
    refresh();
  }));
  unsubs.push(listenList("inventoryMaterials", (rows) => {
    state.materials = rows;
    refresh();
  }));
  unsubs.push(listenList("purchaseOrders", (rows) => {
    state.purchaseOrders = rows;
    refresh();
  }));
  unsubs.push(listenList("projectExpenses", (rows) => {
    state.projectExpenses = rows;
    refresh();
  }));
  unsubs.push(listenList("assetMaintenance", (rows) => {
    state.maintenance = rows;
    refresh();
  }));
  unsubs.push(listenList("workerSalaryPayments", (rows) => {
    state.salaryPayments = rows;
    refresh();
  }));
  unsubs.push(listenValue("projectMilestones", (rootVal) => {
    state.milestonesByProject = parseNestedByProject(rootVal);
    refresh();
  }));
  unsubs.push(listenValue("paymentMilestones", (rootVal) => {
    state.paymentMilestonesByProject = parseNestedByProject(rootVal);
    refresh();
  }));
  unsubs.push(listenValue("ipcBills", (rootVal) => {
    state.ipcBillsByProject = parseNestedByProject(rootVal);
    refresh();
  }));
  unsubs.push(listenValue("projectDocuments", (rootVal) => {
    state.documentsByProject = parseNestedByProject(rootVal);
    refresh();
  }));
  unsubs.push(listenValue("siteDiaries", (rootVal) => {
    state.siteDiariesByProject = parseNestedByProject(rootVal);
    refresh();
  }));
  unsubs.push(listenList("siteInCharges", (rows) => {
    state.siteInCharges = rows;
    refresh();
  }));
  unsubs.push(listenValue("safetyIncidents", (rootVal) => {
    state.safetyIncidentsByProject = parseNestedByProject(rootVal);
    refresh();
  }));
  unsubs.push(listenValue("projectRoster", (rootVal) => {
    state.projectRosterByProject = parseNestedByProject(rootVal);
    refresh();
  }));
  unsubs.push(listenValue("materialRequests", (rootVal) => {
    state.materialRequestsByProject = parseNestedByProject(rootVal);
    refresh();
  }));

  renderDashboard();

  return { unmount: () => unsubs.forEach((u) => u()) };
}
