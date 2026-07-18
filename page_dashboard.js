import { listenValue, listenList } from "./svc_data.js";
import { setActiveNav } from "./cmp_layout.js";
import { setPageChrome } from "./cmp_header.js";
import { metricCard, statusChip, progressBar, sectionCard, renderCashFlowChart, formatMetricBDT } from "./cmp_ui.js";
import { todayISO } from "./util_workers.js";
import { listLowStock, listPendingReturns } from "./util_inventory.js";
import { isMaintenanceOverdue, latestMaintenanceByAsset } from "./util_assets.js";
import { getCurrentRole, getAssignedProjectIds } from "./svc_governance.js";
import { getCurrentUserId } from "./svc_auth.js";
import { collectMyTasks, collectComplianceAlerts, collectAllocationAlerts } from "./util_responsibility.js";
import { enrichProjectList } from "./svc_projectDetails.js";
import { mountPortfolio } from "./cmp_projectPortfolio.js";
import { renderAllocationPanel } from "./cmp_teamAllocation.js";
import { listRoleUsers } from "./svc_governance.js";

const PORTFOLIO_STATUSES = new Set(["planning", "ongoing", "on_hold"]);

const ICONS = {
  receivable: "??",
  sales: "??",
  due: "?",
  workers: "??",
  stock: "??",
  returns: "??",
  assets: "??",
};

const QUICK_ACTIONS = [
  { label: "New Client", hash: "#/clients", cls: "qa-blue" },
  { label: "New Project", hash: "#/projects/new", cls: "qa-purple" },
  { label: "New Bill", hash: "#/billing", cls: "qa-green" },
  { label: "Workers", hash: "#/workers", cls: "qa-teal" },
  { label: "Inventory", hash: "#/inventory", cls: "qa-orange" },
  { label: "Assets", hash: "#/assets", cls: "qa-purple" },
  { label: "New Expense", hash: "#/purchases", cls: "qa-red" },
];

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
      document.querySelector(".quick-actions-card")?.scrollIntoView({ behavior: "smooth", block: "start" });
    },
  });

  const root = document.createElement("div");
  root.className = "dashboard-page";

  import("./svc_alertEngine.js").then(({ scanAndEmitAlerts }) => {
    scanAndEmitAlerts().catch(() => {});
  });

  const metricsRow = document.createElement("div");
  metricsRow.className = "metrics-row";
  metricsRow.id = "dash-metrics";
  root.appendChild(metricsRow);

  const constructionRow = document.createElement("div");
  constructionRow.className = "metrics-row dash-construction-row";
  constructionRow.id = "dash-construction";
  root.appendChild(constructionRow);

  const phase1Row = document.createElement("div");
  phase1Row.className = "dashboard-phase1 content-grid-2";
  const activeCard = sectionCard("Projects Portfolio", "Planning, ongoing, and on-hold work");
  activeCard.id = "dash-active-projects";
  const tasksCard = sectionCard("My Responsibilities", "Milestones and approvals assigned to you");
  tasksCard.id = "dash-my-tasks";
  const alertsCard = sectionCard("Compliance Alerts", "Gov IPC, bank guarantees, and private billing");
  alertsCard.id = "dash-compliance";
  alertsCard.classList.add("dashboard-span-2");
  const allocCard = sectionCard("Resource Allocation", "Team capacity across active projects");
  allocCard.id = "dash-allocation";
  allocCard.classList.add("dashboard-span-2");
  phase1Row.append(activeCard, tasksCard, alertsCard, allocCard);
  root.appendChild(phase1Row);

  const midRow = document.createElement("div");
  midRow.className = "dashboard-mid";
  const cashCard = sectionCard("Cash Flow Overview", "Receipts vs Payments");
  const txCard = sectionCard("Recent Transactions");
  const qaCard = document.createElement("div");
  qaCard.className = "card section-card quick-actions-card";
  qaCard.innerHTML = `<h3 class="section-title">Quick Actions</h3><div class="quick-actions-grid" id="dash-quick-actions"></div>`;
  midRow.append(cashCard, txCard, qaCard);
  root.appendChild(midRow);

  const bottomRow = document.createElement("div");
  bottomRow.className = "dashboard-bottom";
  const projCard = sectionCard("Projects Overview");
  const summaryCard = sectionCard("Monthly Summary");
  bottomRow.append(projCard, summaryCard);
  root.appendChild(bottomRow);

  container.appendChild(root);

  const qaGrid = qaCard.querySelector("#dash-quick-actions");
  QUICK_ACTIONS.forEach((a) => {
    const b = document.createElement("a");
    b.href = a.hash;
    b.className = `quick-action-btn ${a.cls}`;
    b.textContent = a.label;
    qaGrid.appendChild(b);
  });

  const unsubs = [];
  const constructionState = {
    workers: [],
    attendance: [],
    materials: [],
    stockOut: [],
    assets: [],
    maintenance: [],
    projects: [],
    clientInvoices: [],
    milestonesByProject: {},
    paymentMilestonesByProject: {},
    ipcBillsByProject: {},
    teamAssignments: [],
    responsibilityTasksByProject: {},
    qualityByProject: {},
    documentsByProject: {},
    approvalQueue: [],
    siteDiariesByProject: {},
  };

  function visibleProjects() {
    const assigned = getAssignedProjectIds(getCurrentUserId(), getCurrentRole());
    if (assigned === null) return constructionState.projects;
    return constructionState.projects.filter((p) => assigned.includes(p.id));
  }

  function renderActiveProjects() {
    const body = activeCard.querySelector(".section-card-body");
    const portfolio = visibleProjects().filter((p) =>
      PORTFOLIO_STATUSES.has(String(p.status || "ongoing").toLowerCase())
    );
    mountPortfolio(body, portfolio, constructionState.milestonesByProject, {
      emptyMessage: "No active portfolio projects",
    });
  }

  function renderMyTasks() {
    const body = tasksCard.querySelector(".section-card-body");
    const tasks = collectMyTasks({
      userId: getCurrentUserId(),
      role: getCurrentRole(),
      projects: visibleProjects(),
      milestonesByProject: constructionState.milestonesByProject,
      approvalQueue: constructionState.approvalQueue,
      qualityByProject: constructionState.qualityByProject,
      responsibilityTasksByProject: constructionState.responsibilityTasksByProject,
    });
    body.innerHTML = tasks.length ? `
      <ul class="dash-task-list">
        ${tasks.slice(0, 10).map((t) => `
          <li class="dash-task-item${t.severity === "high" ? " is-urgent" : ""}">
            <a href="${t.link}">
              <strong>${t.title}</strong>
              <span>${t.projectName} · ${t.type} · deadline ${t.deadline}</span>
            </a>
            ${statusChip(t.status)}
          </li>
        `).join("")}
      </ul>
    ` : `<p class="proj-empty">No open responsibilities</p>`;
  }

  function renderCompliance() {
    const body = alertsCard.querySelector(".section-card-body");
    const alerts = [
      ...collectComplianceAlerts({
        projects: visibleProjects(),
        ipcBillsByProject: constructionState.ipcBillsByProject,
        clientInvoices: constructionState.clientInvoices,
        milestonesByProject: constructionState.milestonesByProject,
        paymentMilestonesByProject: constructionState.paymentMilestonesByProject,
        documentsByProject: constructionState.documentsByProject,
      }),
      ...collectAllocationAlerts(constructionState.teamAssignments, listRoleUsers()),
    ];
    body.innerHTML = alerts.length ? `
      <ul class="dash-alert-list">
        ${alerts.slice(0, 12).map((a) => `
          <li class="dash-alert dash-alert--${a.level}">
            <strong>${a.projectName}</strong> — ${a.message}
          </li>
        `).join("")}
      </ul>
    ` : `<p class="proj-empty">No compliance alerts</p>`;
  }

  function renderAllocation() {
    const body = allocCard.querySelector(".section-card-body");
    renderAllocationPanel(body, {
      assignments: constructionState.teamAssignments,
      users: listRoleUsers(),
      projects: visibleProjects(),
    });
  }

  function renderPhase1() {
    renderActiveProjects();
    renderMyTasks();
    renderCompliance();
    renderAllocation();
  }

  function parseNestedByProject(root) {
    const out = {};
    if (!root || typeof root !== "object") return out;
    for (const [pid, bucket] of Object.entries(root)) {
      if (!bucket || typeof bucket !== "object") continue;
      out[pid] = Object.entries(bucket).map(([id, row]) => ({ id, ...row }));
    }
    return out;
  }

  function renderTopMetrics() {
    const activeProjects = constructionState.projects.filter(
      (p) => (p.status || "ongoing") === "ongoing"
    ).length;
    const openBills = constructionState.clientInvoices.filter(
      (b) => b.status !== "cancelled" && b.status !== "paid"
    );
    const receivable = openBills.reduce(
      (sum, b) => sum + Math.max(0, Number(b.amount || 0) - Number(b.paidAmount || 0)),
      0
    );
    const monthPrefix = new Date().toISOString().slice(0, 7);
    const billedMonth = constructionState.clientInvoices
      .filter((b) => b.billDate?.startsWith(monthPrefix) && b.status !== "cancelled")
      .reduce((sum, b) => sum + Number(b.amount || 0), 0);

    metricsRow.innerHTML = "";
    metricsRow.append(
      metricCard({ icon: ICONS.workers, label: "Active Projects", value: String(activeProjects), trend: 0 }),
      metricCard({ icon: ICONS.receivable, label: "Client Receivable", value: formatMetricBDT(receivable), trend: 0 }),
      metricCard({ icon: ICONS.sales, label: "Billed This Month", value: formatMetricBDT(billedMonth), trend: 0 })
    );
  }

  function renderConstructionMetrics() {
    const today = todayISO();
    const activeToday = constructionState.attendance.filter(
      (a) => a.date === today && (a.status === "present" || a.status === "half_day")
    ).length;
    const activeProjectIds = new Set(
      visibleProjects()
        .filter((p) => (p.status || "ongoing") === "ongoing")
        .map((p) => p.id)
    );
    let diariesToday = 0;
    for (const [pid, rows] of Object.entries(constructionState.siteDiariesByProject)) {
      if (!activeProjectIds.has(pid)) continue;
      diariesToday += (rows || []).filter(
        (d) => d.logDate === today && (d.status === "submitted" || d.status === "approved")
      ).length;
    }
    const lowStock = listLowStock(constructionState.materials).length;
    const pendingReturns = listPendingReturns(constructionState.stockOut, today).length;
    const maintMap = latestMaintenanceByAsset(constructionState.maintenance);
    const underMaint =
      constructionState.assets.filter((a) => a.status === "under_repair").length +
      constructionState.assets.filter((a) => {
        const m = maintMap.get(a.id);
        return m && isMaintenanceOverdue(m, today);
      }).length;

    constructionRow.innerHTML = "";
    constructionRow.append(
      metricCard({ icon: ICONS.workers, label: "Workers Active Today", value: String(activeToday), trend: 0 }),
      metricCard({ icon: ICONS.stock, label: "Diaries Today", value: String(diariesToday), trend: 0 }),
      metricCard({ icon: ICONS.stock, label: "Low Stock Items", value: String(lowStock), trend: 0 }),
      metricCard({ icon: ICONS.returns, label: "Pending Returns", value: String(pendingReturns), trend: 0 }),
      metricCard({ icon: ICONS.assets, label: "Assets Under Maintenance", value: String(underMaint), trend: 0 })
    );
  }

  unsubs.push(listenList("workers", (rows) => { constructionState.workers = rows; renderConstructionMetrics(); }));
  unsubs.push(listenList("workerAttendance", (rows) => { constructionState.attendance = rows; renderConstructionMetrics(); }));
  unsubs.push(listenList("inventoryMaterials", (rows) => { constructionState.materials = rows; renderConstructionMetrics(); }));
  unsubs.push(listenList("inventoryStockOut", (rows) => { constructionState.stockOut = rows; renderConstructionMetrics(); }));
  unsubs.push(listenList("assets", (rows) => { constructionState.assets = rows; renderConstructionMetrics(); }));
  unsubs.push(listenList("assetMaintenance", (rows) => { constructionState.maintenance = rows; renderConstructionMetrics(); }));
  unsubs.push(listenList("projects", (rows) => {
    constructionState.projects = enrichProjectList(rows);
    renderTopMetrics();
    renderPhase1();
  }));
  unsubs.push(listenList("clientInvoices", (rows) => { constructionState.clientInvoices = rows; renderTopMetrics(); renderPhase1(); }));
  unsubs.push(listenList("approvalQueue", (rows) => { constructionState.approvalQueue = rows; renderPhase1(); }));
  unsubs.push(listenValue("projectMilestones", (root) => {
    constructionState.milestonesByProject = parseNestedByProject(root);
    renderPhase1();
  }));
  unsubs.push(listenValue("paymentMilestones", (root) => {
    constructionState.paymentMilestonesByProject = parseNestedByProject(root);
    renderPhase1();
  }));
  unsubs.push(listenValue("ipcBills", (root) => {
    constructionState.ipcBillsByProject = parseNestedByProject(root);
    renderPhase1();
  }));
  unsubs.push(listenList("projectTeamAssignments", (rows) => {
    constructionState.teamAssignments = rows;
    renderPhase1();
  }));
  unsubs.push(listenValue("responsibilityTasks", (root) => {
    constructionState.responsibilityTasksByProject = parseNestedByProject(root);
    renderPhase1();
  }));
  unsubs.push(listenValue("qualityChecks", (root) => {
    constructionState.qualityByProject = parseNestedByProject(root);
    renderPhase1();
  }));
  unsubs.push(listenValue("projectDocuments", (root) => {
    constructionState.documentsByProject = parseNestedByProject(root);
    renderCompliance();
  }));
  unsubs.push(listenValue("siteDiaries", (root) => {
    constructionState.siteDiariesByProject = parseNestedByProject(root);
    renderConstructionMetrics();
  }));

  renderTopMetrics();
  renderPhase1();

  unsubs.push(
    listenValue("reportsCache/cashFlow", (cf) => {
      renderCashFlowChart(cashCard.querySelector(".section-card-body"), cf);
    })
  );

  unsubs.push(
    listenValue("reportsCache/recentTransactions", (rows) => {
      const body = txCard.querySelector(".section-card-body");
      body.innerHTML = `
        <div class="table-wrap">
          <table class="dash-table">
            <thead><tr>
              <th>Type</th><th>Reference</th><th>Party / Project</th>
              <th class="text-right">Amount</th><th>Date</th><th>Status</th>
            </tr></thead>
            <tbody>
              ${(rows || []).map((r) => `
                <tr>
                  <td>${r.type}</td>
                  <td>${r.ref}</td>
                  <td>${r.party}<br><small>${r.project}</small></td>
                  <td class="text-right">${formatMetricBDT(r.amount)}</td>
                  <td>${r.date}</td>
                  <td>${statusChip(r.status)}</td>
                </tr>
              `).join("")}
            </tbody>
          </table>
        </div>
      `;
    })
  );

  unsubs.push(
    listenValue("reportsCache/projectsOverview", (rows) => {
      const body = projCard.querySelector(".section-card-body");
      const list = rows?.length ? rows : constructionState.projects.map((p) => ({
        name: p.name,
        type: p.projectType || "private_civil",
        client: p.clientName || "—",
        progress: p.progressPercent || 0,
        status: p.status || "ongoing",
      }));
      body.innerHTML = `
        <div class="table-wrap">
          <table class="dash-table">
            <thead><tr>
              <th>Project Name</th><th>Type</th><th>Client</th><th>Progress</th><th>Status</th>
            </tr></thead>
            <tbody>
              ${list.map((p) => `
                <tr>
                  <td><strong>${p.name}</strong></td>
                  <td>${p.type || "—"}</td>
                  <td>${p.client || "—"}</td>
                  <td class="progress-cell">${progressBar(p.progress || 0)}<small>${p.progress || 0}%</small></td>
                  <td>${statusChip(p.status)}</td>
                </tr>
              `).join("")}
            </tbody>
          </table>
        </div>
      `;
    })
  );

  unsubs.push(
    listenValue("reportsCache/monthlySummary", (m) => {
      if (!m) return;
      const body = summaryCard.querySelector(".section-card-body");
      body.innerHTML = `
        <div class="summary-metrics">
          <div class="summary-ring"><span class="summary-label">Total Billed</span><strong>${formatMetricBDT(m.totalBilled ?? m.totalSales ?? 0)}</strong></div>
          <div class="summary-ring"><span class="summary-label">Total Collected</span><strong>${formatMetricBDT(m.totalCollected ?? m.totalCollections ?? 0)}</strong></div>
          <div class="summary-ring"><span class="summary-label">Total Expenses</span><strong>${formatMetricBDT(m.totalExpenses)}</strong></div>
        </div>
        <div class="net-profit-block">
          <div class="net-profit-head">
            <span>Net Profit</span>
            <strong>${formatMetricBDT(m.netProfit)}</strong>
          </div>
          ${progressBar(m.profitPercent, "profit-fill")}
          <small class="profit-pct">${m.profitPercent}% margin</small>
        </div>
      `;
    })
  );

  return { unmount: () => unsubs.forEach((u) => u()) };
}
