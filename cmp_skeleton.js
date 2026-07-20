function skelLine(size = "md", width = "100") {
  return `<div class="skeleton skeleton-line skeleton-line--${size} skeleton-w-${width}"></div>`;
}

function skelBlock(extraClass = "") {
  return `<div class="skeleton skeleton-block ${extraClass}"></div>`;
}

function skelKpiCard() {
  return `
    <div class="skel-kpi-card">
      <div class="skel-kpi-head">
        ${skelBlock("skel-kpi-icon")}
        <div class="skel-kpi-text">
          ${skelLine("sm", "70")}
          ${skelLine("lg", "45")}
        </div>
      </div>
      <div class="skel-kpi-foot">
        ${skelLine("sm", "55")}
        ${skelBlock("skel-sparkline")}
      </div>
    </div>
  `;
}

function widgetHeadSplit(titleW = "40", actionW = "22") {
  return `
    <div class="dash-widget-head dash-widget-head--split skel-widget-head-split">
      ${skelLine("md", titleW)}
      ${skelLine("sm", actionW)}
    </div>
  `;
}

function skelListRow() {
  return `
    <div class="skel-list-row">
      ${skelBlock("skel-list-icon")}
      ${skelLine("md", "75")}
      ${skelLine("sm", "18")}
    </div>
  `;
}

function bootSidebarNav(count = 12) {
  return Array.from({ length: count }, () =>
    `<div class="skel-nav-item">${skelBlock("skel-nav-icon")}${skelLine("sm", "70")}</div>`
  ).join("");
}

export function kpiRowSkeletonHtml() {
  return `${skelKpiCard()}${skelKpiCard()}${skelKpiCard()}${skelKpiCard()}${skelKpiCard()}`;
}

export function perfTableSkeletonHtml() {
  const row = `
    <div class="skel-perf-row">
      <div class="skel-perf-cell skel-perf-cell--project">
        ${skelLine("sm", "80")}
        ${skelLine("sm", "45")}
      </div>
      <div class="skel-perf-cell skel-perf-cell--progress">
        ${skelLine("sm", "30")}
        ${skelBlock("skel-progress-bar")}
      </div>
      <div class="skel-perf-cell">${skelLine("sm", "55")}</div>
      <div class="skel-perf-cell">${skelLine("sm", "45")}</div>
      <div class="skel-perf-cell">${skelLine("sm", "55")}</div>
      <div class="skel-perf-cell">${skelLine("sm", "50")}</div>
      <div class="skel-perf-cell">${skelBlock("skel-pill")}</div>
    </div>
  `;
  return `
    <section class="dash-widget dash-widget--wide dash-widget--perf card dash-host-skeleton">
      ${widgetHeadSplit("38", "20")}
      <div class="dash-widget-body">
        <div class="skel-perf-table-head">
          ${skelLine("sm", "55")}${skelLine("sm", "45")}${skelLine("sm", "40")}
          ${skelLine("sm", "35")}${skelLine("sm", "45")}${skelLine("sm", "40")}${skelLine("sm", "35")}
        </div>
        ${row}${row}${row}
      </div>
    </section>
  `;
}

export function attentionSkeletonHtml() {
  return `
    <section class="dash-widget dash-widget--attention card dash-host-skeleton">
      ${widgetHeadSplit("42", "18")}
      <div class="dash-widget-body">
        ${skelListRow()}${skelListRow()}
      </div>
    </section>
  `;
}

export function cashFlowSkeletonHtml() {
  return `
    <section class="dash-widget dash-widget--cashflow card dash-host-skeleton">
      <div class="dash-widget-head dash-widget-head--split skel-widget-head-split">
        ${skelLine("md", "38")}
        ${skelBlock("skel-period-select")}
      </div>
      <div class="dash-widget-body">
        <div class="skel-legend-row">
          ${skelLine("sm", "60")}${skelLine("sm", "55")}${skelLine("sm", "58")}
          ${skelLine("sm", "52")}${skelLine("sm", "48")}
        </div>
        ${skelBlock("skel-chart-block")}
      </div>
    </section>
  `;
}

export function budgetDonutSkeletonHtml() {
  return `
    <section class="dash-widget dash-widget--budget card dash-host-skeleton">
      <div class="dash-widget-head">${skelLine("md", "45")}</div>
      <div class="dash-widget-body">
        <div class="skel-budget-layout">
          ${skelBlock("skel-donut-block")}
          <div class="skel-budget-legend">
            ${skelLine("sm", "85")}${skelLine("sm", "80")}
            ${skelLine("sm", "82")}${skelLine("sm", "75")}
          </div>
        </div>
      </div>
    </section>
  `;
}

export function approvalsSkeletonHtml() {
  return `
    <section class="dash-widget dash-widget--approvals card dash-host-skeleton">
      ${widgetHeadSplit("40", "18")}
      <div class="dash-widget-body">
        ${skelListRow()}${skelListRow()}
      </div>
    </section>
  `;
}

export function siteActivitySkeletonHtml() {
  return `
    <section class="dash-widget dash-widget--site card dash-host-skeleton">
      ${widgetHeadSplit("35", "18")}
      <div class="dash-widget-body">
        <div class="skel-site-kpi-strip">
          ${skelBlock("skel-site-stat")}${skelBlock("skel-site-stat")}${skelBlock("skel-site-stat")}
        </div>
        <div class="skeleton skeleton-table-head"></div>
        <div class="skeleton skeleton-table-row"></div>
        <div class="skeleton skeleton-table-row"></div>
        <div class="skeleton skeleton-table-row"></div>
      </div>
    </section>
  `;
}

export function procurementSkeletonHtml() {
  return `
    <section class="dash-widget dash-widget--proc card dash-host-skeleton">
      ${widgetHeadSplit("38", "18")}
      <div class="dash-widget-body">
        ${skelListRow()}${skelListRow()}
      </div>
    </section>
  `;
}

export function billingSkeletonHtml() {
  return `
    <section class="dash-widget dash-widget--billing card dash-host-skeleton">
      ${widgetHeadSplit("32", "18")}
      <div class="dash-widget-body">
        <div class="skel-billing-layout">
          ${skelBlock("skel-donut-block skel-donut-block--sm")}
          <div class="skel-billing-lines">
            ${skelLine("sm", "90")}${skelLine("sm", "75")}${skelLine("sm", "80")}
          </div>
        </div>
      </div>
    </section>
  `;
}

export function dashMilestonesSkeletonHtml() {
  return `
    <section class="dash-widget dash-widget--milestones card dash-host-skeleton skel-milestones">
      <div class="dash-widget-head">${skelLine("md", "30")}</div>
      <div class="dash-widget-body skel-milestones-body">
        ${skelBlock("skel-milestone-chip")}
        ${skelBlock("skel-milestone-chip")}
        ${skelBlock("skel-milestone-chip")}
        ${skelBlock("skel-milestone-chip")}
      </div>
    </section>
  `;
}

export function dashboardGridSkeletonHtml() {
  return `
    <div class="dashboard-page dashboard-mockup">
      <div class="dash-kpi-row">${kpiRowSkeletonHtml()}</div>
      <div class="dash-row-2">
        <div>${perfTableSkeletonHtml()}</div>
        <div>${attentionSkeletonHtml()}</div>
      </div>
      <div class="dash-row-3">
        <div>${cashFlowSkeletonHtml()}</div>
        <div>${budgetDonutSkeletonHtml()}</div>
        <div>${approvalsSkeletonHtml()}</div>
      </div>
      <div class="dash-row-4">
        <div>${siteActivitySkeletonHtml()}</div>
        <div>${procurementSkeletonHtml()}</div>
        <div>${billingSkeletonHtml()}</div>
      </div>
      <div>${dashMilestonesSkeletonHtml()}</div>
    </div>
  `;
}

export function fillDashboardSkeletons(hosts) {
  if (!hosts) return;
  if (hosts.kpi) hosts.kpi.innerHTML = kpiRowSkeletonHtml();
  if (hosts.performance) hosts.performance.innerHTML = perfTableSkeletonHtml();
  if (hosts.attention) hosts.attention.innerHTML = attentionSkeletonHtml();
  if (hosts.cashflow) hosts.cashflow.innerHTML = cashFlowSkeletonHtml();
  if (hosts.budget) hosts.budget.innerHTML = budgetDonutSkeletonHtml();
  if (hosts.approvals) hosts.approvals.innerHTML = approvalsSkeletonHtml();
  if (hosts.site) hosts.site.innerHTML = siteActivitySkeletonHtml();
  if (hosts.procurement) hosts.procurement.innerHTML = procurementSkeletonHtml();
  if (hosts.billing) hosts.billing.innerHTML = billingSkeletonHtml();
  if (hosts.milestones) hosts.milestones.innerHTML = dashMilestonesSkeletonHtml();
}

function skelToolbarRow(filterCount = 3, actionCount = 2) {
  const filters = Array.from({ length: filterCount }, () => skelBlock("skel-toolbar-input")).join("");
  const actions = Array.from({ length: actionCount }, () => skelBlock("skel-toolbar-btn")).join("");
  return `
    <div class="skel-toolbar-row">
      <div class="skel-toolbar-filters">${filters}</div>
      <div class="skel-toolbar-actions">${actions}</div>
    </div>
  `;
}

function skelTableRows(count = 5) {
  return Array.from({ length: count }, () => `<div class="skeleton skeleton-table-row"></div>`).join("");
}

function skelClientKpiCard() {
  return `
    <div class="dash-kpi-card card dash-host-skeleton">
      <div class="dash-kpi-head">
        <div class="dash-kpi-icon">${skelBlock("skel-clients-kpi-icon")}</div>
        <div class="dash-kpi-main">
          ${skelLine("sm", "55")}
          ${skelLine("lg", "35")}
        </div>
      </div>
      <div class="dash-kpi-foot">
        ${skelLine("sm", "60")}
        ${skelBlock("skel-sparkline")}
      </div>
    </div>
  `;
}

function skelClientsToolbar() {
  return `
    <div class="toolbar-row customers-toolbar">
      <div class="toolbar-filters">
        ${skelBlock("skel-clients-filter")}
        ${skelBlock("skel-clients-filter")}
        ${skelBlock("skel-clients-filter")}
        ${skelBlock("skel-clients-select")}
        ${skelBlock("skel-clients-select")}
      </div>
      <div class="toolbar-actions">
        ${skelBlock("skel-clients-search")}
        <div class="cust-toolbar-btn-group">
          ${skelBlock("skel-clients-btn")}
          ${skelBlock("skel-clients-btn")}
          ${skelBlock("skel-clients-btn")}
        </div>
      </div>
    </div>
  `;
}

function skelClientsTableHead() {
  return `
    <div class="skel-clients-table-head skel-clients-table-head--wide">
      ${skelLine("sm", "40")}
      ${skelLine("sm", "45")}
      ${skelLine("sm", "35")}
      ${skelLine("sm", "40")}
      ${skelLine("sm", "35")}
      ${skelLine("sm", "45")}
      ${skelLine("sm", "40")}
      ${skelLine("sm", "35")}
      ${skelLine("sm", "40")}
      ${skelLine("sm", "50")}
    </div>
  `;
}

function skelClientsTableRow() {
  return `
    <div class="skel-clients-table-row skel-clients-table-row--wide">
      ${skelBlock("skel-clients-num")}
      <div class="skel-clients-user cell-user">
        ${skelBlock("skel-user-avatar")}
        ${skelLine("md", "70")}
      </div>
      ${skelBlock("skel-pill")}
      ${skelLine("sm", "75")}
      ${skelLine("sm", "85")}
      ${skelBlock("skel-pill")}
      ${skelLine("sm", "55")}
      ${skelBlock("skel-pill")}
      ${skelLine("sm", "55")}
      <div class="skel-clients-actions">
        ${skelBlock("skel-clients-icon-btn")}
        ${skelBlock("skel-clients-icon-btn")}
      </div>
    </div>
  `;
}

function skelFormField(full = false) {
  return `
    <div class="skel-form-field${full ? " skel-form-field--full" : ""}">
      ${skelLine("sm", "40")}
      ${skelBlock("skel-form-input")}
    </div>
  `;
}

function skelProjListItem() {
  return `
    <div class="skel-proj-list-item">
      ${skelLine("md", "85")}
      ${skelLine("sm", "55")}
    </div>
  `;
}

function skelPillTab(active = false) {
  return `<div class="skeleton skel-pill${active ? " skel-pill--active" : ""}"></div>`;
}

export function clientsSkeletonHtml() {
  return `
    <div class="customers-page dashboard-page dashboard-mockup page-skeleton-clients">
      <div class="dash-kpi-row">
        ${skelClientKpiCard()}${skelClientKpiCard()}${skelClientKpiCard()}${skelClientKpiCard()}${skelClientKpiCard()}
      </div>
      <section class="dash-widget dash-widget--clients card dash-host-skeleton">
        <div class="dash-widget-head dash-widget-head--split">
          <div class="skel-clients-head-text">
            ${skelLine("md", "40")}
            ${skelLine("sm", "65")}
          </div>
          ${skelLine("sm", "30")}
        </div>
        <div class="dash-widget-body">
          ${skelClientsToolbar()}
          <div class="table-wrap customers-table-wrap">
            ${skelClientsTableHead()}
            ${Array.from({ length: 6 }, () => skelClientsTableRow()).join("")}
          </div>
        </div>
      </section>
    </div>
  `;
}

export function formSkeletonHtml() {
  return `
    <div class="page-skeleton-form">
      <section class="card dash-host-skeleton skel-form-card">
        <div class="card-pad">
          <div class="skel-form-grid">
            ${skelFormField()}${skelFormField()}${skelFormField()}
            ${skelFormField()}${skelFormField()}${skelFormField()}
            ${skelFormField(true)}
          </div>
          <div class="skel-form-actions">
            ${skelBlock("skel-toolbar-btn skel-toolbar-btn--wide")}
            ${skelBlock("skel-toolbar-btn")}
          </div>
        </div>
      </section>
    </div>
  `;
}

export function projectsHubSkeletonHtml() {
  return `
    <div class="skel-projects-hub">
      <aside class="skel-proj-sidebar card dash-host-skeleton">
        <div class="card-pad">
          ${skelLine("md", "50")}
          ${skelBlock("skel-toolbar-input")}
          ${Array.from({ length: 5 }, () => skelProjListItem()).join("")}
        </div>
      </aside>
      <div class="skel-proj-main">
        <div class="skel-module-tabs">
          ${skelPillTab(true)}${skelPillTab()}${skelPillTab()}${skelPillTab()}${skelPillTab()}
        </div>
        <section class="card dash-host-skeleton skel-proj-content">
          <div class="card-pad">
            ${skelLine("lg", "30")}
            ${skelLine("sm", "60")}
            ${skelBlock("skel-chart-block")}
            ${skelTableRows(4)}
          </div>
        </section>
      </div>
    </div>
  `;
}

export function projectFormSkeletonHtml() {
  return `
    <div class="page-skeleton-project-form">
      <div class="skel-form-stepper">
        ${skelBlock("skel-step")}${skelBlock("skel-step")}${skelBlock("skel-step")}${skelBlock("skel-step")}
      </div>
      <section class="card dash-host-skeleton skel-form-card">
        <div class="card-pad">
          ${skelLine("lg", "40")}
          ${skelLine("sm", "65")}
          <div class="skel-form-grid">
            ${skelFormField()}${skelFormField()}
            ${skelFormField()}${skelFormField()}
            ${skelFormField()}${skelFormField()}
            ${skelFormField(true)}
            ${skelFormField(true)}
          </div>
          <div class="skel-form-actions">
            ${skelBlock("skel-toolbar-btn")}
            ${skelBlock("skel-toolbar-btn skel-toolbar-btn--wide")}
          </div>
        </div>
      </section>
    </div>
  `;
}

export function moduleHubSkeletonHtml() {
  return `
    <div class="page-skeleton-module-hub">
      <div class="skel-module-tabs">
        ${skelPillTab(true)}${skelPillTab()}${skelPillTab()}${skelPillTab()}
      </div>
      <div class="skel-stat-row skel-stat-row--4">
        ${skelBlock("skel-stat-card")}${skelBlock("skel-stat-card")}
        ${skelBlock("skel-stat-card")}${skelBlock("skel-stat-card")}
      </div>
      <section class="dash-widget card dash-host-skeleton">
        <div class="dash-widget-body">
          ${skelToolbarRow(1, 3)}
          <div class="skeleton skeleton-table-head"></div>
          ${skelTableRows(6)}
        </div>
      </section>
    </div>
  `;
}

export function reportsSkeletonHtml() {
  return `
    <div class="page-skeleton-reports">
      <div class="skel-stat-row skel-stat-row--4">
        ${skelBlock("skel-stat-card")}${skelBlock("skel-stat-card")}
        ${skelBlock("skel-stat-card")}${skelBlock("skel-stat-card")}
      </div>
      <section class="dash-widget card dash-host-skeleton">
        <div class="dash-widget-head">${skelLine("md", "35")}</div>
        <div class="dash-widget-body">${skelBlock("skel-chart-block")}</div>
      </section>
      <section class="dash-widget card dash-host-skeleton">
        <div class="dash-widget-head">${skelLine("md", "40")}</div>
        <div class="dash-widget-body">
          <div class="skeleton skeleton-table-head"></div>
          ${skelTableRows(5)}
        </div>
      </section>
    </div>
  `;
}

export function approvalsPageSkeletonHtml() {
  return `
    <div class="page-skeleton-approvals">
      <section class="dash-widget card dash-host-skeleton">
        <div class="dash-widget-head">
          ${skelLine("md", "35")}
          ${skelLine("sm", "55")}
        </div>
        <div class="dash-widget-body">
          <div class="skel-approvals-table-head">
            ${skelLine("sm", "50")}${skelLine("sm", "40")}${skelLine("sm", "35")}${skelLine("sm", "30")}
          </div>
          ${Array.from({ length: 5 }, () => `
            <div class="skel-approvals-row">
              ${skelLine("sm", "55")}${skelLine("sm", "45")}${skelLine("sm", "40")}${skelBlock("skel-toolbar-btn")}
            </div>
          `).join("")}
        </div>
      </section>
    </div>
  `;
}

export function settingsSkeletonHtml() {
  return `
    <div class="page-skeleton-settings">
      <section class="dash-widget card dash-host-skeleton">
        <div class="dash-widget-head">${skelLine("md", "30")}</div>
        <div class="dash-widget-body">
          <div class="skel-form-grid">
            ${skelFormField()}${skelFormField()}
            ${skelFormField(true)}
          </div>
        </div>
      </section>
      <section class="dash-widget card dash-host-skeleton">
        <div class="dash-widget-head">${skelLine("md", "45")}</div>
        <div class="dash-widget-body">
          <div class="skeleton skeleton-table-head"></div>
          ${skelTableRows(8)}
        </div>
      </section>
    </div>
  `;
}

export function portalSkeletonHtml() {
  const card = `
    <section class="card dash-host-skeleton skel-portal-card">
      <div class="card-pad">
        ${skelLine("lg", "50")}
        ${skelLine("sm", "40")}
        ${skelBlock("skel-progress-bar")}
        ${skelLine("sm", "70")}
        ${skelLine("sm", "60")}
      </div>
    </section>
  `;
  return `<div class="page-skeleton-portal skel-portal-grid">${card}${card}</div>`;
}

export function listTableSkeletonHtml() {
  return `
    <div class="page-skeleton-list">
      <section class="dash-widget card dash-host-skeleton">
        <div class="dash-widget-body">
          ${skelToolbarRow(1, 3)}
          <div class="skeleton skeleton-table-head"></div>
          ${skelTableRows(6)}
        </div>
      </section>
    </div>
  `;
}

function bootSidebarHtml() {
  return `
    <aside class="sidebar skel-sidebar">
      <div class="sidebar-head skel-sidebar-head">
        ${skelBlock("skel-sidebar-logo")}
        <div class="skel-sidebar-brand">
          ${skelLine("md", "85")}
          ${skelLine("sm", "60")}
        </div>
      </div>
      <nav class="skel-nav-list">${bootSidebarNav(12)}</nav>
      <div class="sidebar-foot">
        <div class="skel-sidebar-user">
          ${skelBlock("skel-user-avatar")}
          <div class="skel-sidebar-user-text">
            ${skelLine("sm", "70")}
            ${skelLine("sm", "55")}
          </div>
        </div>
      </div>
    </aside>
  `;
}

function bootHeaderHtml() {
  return `
    <header class="app-header skel-app-header">
      <div class="header-left">${skelBlock("skel-header-icon")}</div>
      <div class="page-chrome page-toolbar card skel-page-chrome">
        <div class="page-chrome-titles">
          ${skelLine("lg", "35")}
          ${skelLine("sm", "55")}
        </div>
        <div class="header-center">${skelBlock("skel-header-search")}</div>
        <div class="page-chrome-actions">
          ${skelBlock("skel-header-btn")}
          ${skelBlock("skel-header-btn skel-header-btn--wide")}
          ${skelBlock("skel-header-btn skel-header-btn--action")}
          ${skelBlock("skel-user-avatar")}
        </div>
      </div>
    </header>
  `;
}

export function bootSkeletonHtml(statusText = "Connecting to Firebase...", path = "/dashboard") {
  const pageSkel = pageSkeletonHtml(resolvePageSkeletonVariant(path));
  return `
    <div class="app-root erp-boot-skeleton">
      <div class="app-shell">
        ${bootSidebarHtml()}
        <main class="main">
          ${bootHeaderHtml()}
          <div class="main-inner">${pageSkel}</div>
        </main>
      </div>
      <p class="erp-boot-status">${statusText}</p>
    </div>
  `;
}

const ROUTE_SKELETON_MAP = {
  "/dashboard": "dashboard",
  "/clients": "clients",
  "/customers": "clients",
  "/clients/new": "form",
  "/customers/new": "form",
  "/projects": "projectsHub",
  "/projects/new": "projectForm",
  "/billing": "listTable",
  "/sales": "listTable",
  "/accounting": "listTable",
  "/purchases": "listTable",
  "/suppliers": "listTable",
  "/inventory": "moduleHub",
  "/assets": "moduleHub",
  "/workers": "moduleHub",
  "/site-incharge": "moduleHub",
  "/reports": "reports",
  "/approvals": "approvals",
  "/arbitration": "listTable",
  "/settings": "settings",
  "/client-portal": "portal",
};

const SKELETON_BUILDERS = {
  dashboard: dashboardGridSkeletonHtml,
  clients: clientsSkeletonHtml,
  form: formSkeletonHtml,
  projectsHub: projectsHubSkeletonHtml,
  projectForm: projectFormSkeletonHtml,
  moduleHub: moduleHubSkeletonHtml,
  reports: reportsSkeletonHtml,
  approvals: approvalsPageSkeletonHtml,
  settings: settingsSkeletonHtml,
  portal: portalSkeletonHtml,
  listTable: listTableSkeletonHtml,
};

export function resolvePageSkeletonVariant(path) {
  const pathname = (path || "").split("?")[0];
  if (ROUTE_SKELETON_MAP[pathname]) return ROUTE_SKELETON_MAP[pathname];
  if (pathname.startsWith("/projects")) return "projectsHub";
  return "listTable";
}

export function pageSkeletonHtml(variant = "listTable") {
  const build = SKELETON_BUILDERS[variant] || listTableSkeletonHtml;
  const inner = build();
  return `<div class="page-skeleton page-skeleton--full" aria-hidden="true">${inner}</div>`;
}
