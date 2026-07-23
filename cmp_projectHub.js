/** Projects hub UI — toolbar, Reports-style KPIs/tabs, profile fields */

import { icon } from "./cmp_icons.js";
import { statusChip } from "./cmp_ui.js";
import { formatBDT } from "./util_format.js";
import { getProjectTabs, isGovProject, projectTypeLabel, defaultProjectType } from "./util_govProject.js";
import { resolveManagerLabel } from "./cmp_projectTab.js";
import { readRef } from "./svc_data.js";
import {
  computeProjectHealth,
  resolveProjectProgress,
  resolveBudgetTotal,
  healthLabel,
} from "./util_projectCore.js";
import { computePrivateKpis } from "./util_privateProject.js";
import {
  renderDashKpiRow,
  buildDashSparkline,
  buildDashSparkFromAmount,
  buildDashSparkFromCount,
  reportsWidgetShell,
} from "./cmp_reports.js";

export const PROJECT_TAB_GROUPS = [
  { id: "overview", label: "Overview" },
  { id: "planning", label: "Planning" },
  { id: "operations", label: "Operations" },
  { id: "commercial", label: "Commercial" },
  { id: "activity", label: "Activity" },
];

const TAB_GROUP_BY_ID = {
  home: "overview",
  boq: "planning",
  phases: "planning",
  milestones: "planning",
  timeline: "planning",
  progress: "planning",
  documents: "operations",
  resources: "operations",
  team: "operations",
  messages: "operations",
  quality: "operations",
  safety: "operations",
  measurement: "commercial",
  retention: "commercial",
  contract: "commercial",
  compliance: "commercial",
  billing: "commercial",
  contracts: "commercial",
  activity: "activity",
};

const TAB_LABEL_SHORT = {
  "Measurement Book (MB)": "Measurement",
  "Retention & Final": "Retention",
  "BOQ & CSR": "BOQ & CSR",
  "BOQ & Budget": "BOQ & Budget",
  "VO, Claims & EOT": "VO & EOT",
  "Contracts & Claims": "Variations & claims",
  "Client Contract": "Client contract",
};

const TYPE_ICON = {
  government_civil: "landmark",
  private_civil: "hardHat",
};

/** Widget shell meta for each hub tab */
export const HUB_TAB_PANEL_META = {
  home: {
    title: "Overview",
    sub: "At-a-glance summary, stats, and recent activity",
    headerIcon: "projectCost",
  },
  boq: {
    title: "BOQ & Budget",
    sub: "Bill of quantities and budget lines",
    headerIcon: "projectCost",
  },
  phases: {
    title: "Phases",
    sub: "Project phase schedule and status",
    headerIcon: "analytics",
  },
  milestones: {
    title: "Milestones",
    sub: "Delivery milestones and completion",
    headerIcon: "analytics",
  },
  timeline: {
    title: "Timeline",
    sub: "Gantt-style project schedule",
    headerIcon: "analytics",
  },
  progress: {
    title: "Progress",
    sub: "Physical progress and site updates",
    headerIcon: "analytics",
  },
  documents: {
    title: "Documents",
    sub: "Project files, revisions, and expiry",
    headerIcon: "hse",
  },
  resources: {
    title: "Resources",
    sub: "Labour and equipment allocation",
    headerIcon: "purchases",
  },
  team: {
    title: "Team",
    sub: "Project team members and roles",
    headerIcon: "users",
  },
  messages: {
    title: "Messages",
    sub: "Project discussion and notes",
    headerIcon: "audit",
  },
  quality: {
    title: "Quality",
    sub: "Quality checks and NCRs",
    headerIcon: "hse",
  },
  safety: {
    title: "Safety",
    sub: "Incidents and safety compliance",
    headerIcon: "hse",
  },
  measurement: {
    title: "Measurement & IPC",
    sub: "Measurement book and IPC bills",
    headerIcon: "billing",
  },
  retention: {
    title: "Retention & Final",
    sub: "Retention release and final accounts",
    headerIcon: "financial",
  },
  contract: {
    title: "Contract",
    sub: "Contract summary and commercial terms",
    headerIcon: "billing",
  },
  compliance: {
    title: "Compliance",
    sub: "Statutory and contractual compliance",
    headerIcon: "governance",
  },
  billing: {
    title: "Billing",
    sub: "Client invoices and collections",
    headerIcon: "billing",
  },
  contracts: {
    title: "Contracts & Claims",
    sub: "Variations, claims, and EOT",
    headerIcon: "governance",
  },
  activity: {
    title: "Activity",
    sub: "Full audit trail for this project",
    headerIcon: "audit",
  },
};

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function groupForTabId(tabId) {
  return TAB_GROUP_BY_ID[tabId] || "overview";
}

export function tabsWithGroups(project) {
  return getProjectTabs(project).map((t) => ({
    ...t,
    group: TAB_GROUP_BY_ID[t.id] || "overview",
  }));
}

/**
 * @param {object} p - project
 * @param {object} hubState - { phases, ipcBills, selectedProjectId }
 */
export function buildProjectKpiStats(p, hubState) {
  if (!p) return [];
  const pid = p.id;

  if (isGovProject(p)) {
    const openIpc = (hubState.ipcBills || []).filter(
      (b) =>
        (!b.projectId || b.projectId === pid) &&
        (b.status === "draft" || b.status === "submitted")
    ).length;
    const milestones = hubState.milestones || [];
    const progress = resolveProjectProgress(p, milestones);
    const health = healthLabel(computeProjectHealth(p, milestones));
    const budget = resolveBudgetTotal(p);
    return [
      {
        label: "Budget",
        value: budget ? formatBDT(budget) : "—",
        tab: "contract",
        icon: "budget",
        footLeft: budget ? "Approved contract budget" : "No budget set",
        spark: buildDashSparkline(buildDashSparkFromAmount(budget), "blue"),
        extraClass: "",
      },
      {
        label: "Progress",
        value: `${progress}%`,
        tab: "milestones",
        icon: "progress",
        progress,
        footLeft: "Milestone completion",
        spark: buildDashSparkline(buildDashSparkFromCount(Math.round(progress / 12)), "green"),
        extraClass: "",
      },
      {
        label: "Health",
        value: health,
        tab: "timeline",
        icon: "health",
        footLeft: "Schedule health signal",
        spark: buildDashSparkline(buildDashSparkFromCount(3), "teal"),
        extraClass: "",
      },
      {
        label: "Open IPC bills",
        value: String(openIpc),
        tab: "measurement",
        icon: "ipc",
        footLeft: openIpc ? "Draft or submitted IPC" : "No open IPC bills",
        spark: buildDashSparkline(buildDashSparkFromCount(openIpc), "orange"),
        extraClass: openIpc > 0 ? "dash-kpi-card--attention" : "",
      },
    ];
  }

  const milestones = hubState.milestones || [];
  const progress = resolveProjectProgress(p, milestones);
  const kpis = computePrivateKpis(p, {
    paymentMilestones: hubState.paymentMilestones,
    clientInvoices: hubState.clientInvoices,
    changeOrders: hubState.changeOrders,
  });
  return [
    {
      label: "Contract",
      value: kpis.contractValue ? formatBDT(kpis.contractValue) : "—",
      tab: "contract",
      icon: "contract",
      footLeft: kpis.contractValue ? "Client contract value" : "No contract value",
      spark: buildDashSparkline(buildDashSparkFromAmount(kpis.contractValue), "blue"),
      extraClass: "",
    },
    {
      label: "Billed",
      value: kpis.billed ? formatBDT(kpis.billed) : "—",
      tab: "billing",
      icon: "billed",
      footLeft: kpis.billed ? "Invoices issued" : "No billing yet",
      spark: buildDashSparkline(buildDashSparkFromAmount(kpis.billed), "green"),
      extraClass: "",
    },
    {
      label: "Outstanding",
      value: kpis.outstanding ? formatBDT(kpis.outstanding) : "—",
      tab: "billing",
      icon: "outstanding",
      footLeft: kpis.outstanding ? "Open client balances" : "Fully collected",
      spark: buildDashSparkline(buildDashSparkFromAmount(kpis.outstanding), "orange"),
      extraClass: kpis.outstanding > 0 ? "dash-kpi-card--attention" : "",
    },
    {
      label: "Progress",
      value: `${progress}%`,
      tab: "milestones",
      icon: "progress",
      progress,
      footLeft: "Milestone completion",
      spark: buildDashSparkline(buildDashSparkFromCount(Math.round(progress / 12)), "yellow"),
      extraClass: "cust-kpi-card--yellow",
    },
  ];
}

/**
 * Reports-style KPI row for project hub.
 * @param {object} p
 * @param {object} hubState
 * @param {{ onNavigate?: (tabId: string) => void }} [opts]
 */
export function renderProjectHubKpiRow(p, hubState, opts = {}) {
  const { onNavigate } = opts;
  const row = document.createElement("div");
  row.className = "dash-kpi-row";
  row.id = "proj-hub-kpis";
  const stats = buildProjectKpiStats(p, hubState);
  row.innerHTML = renderDashKpiRow(stats);
  if (onNavigate) {
    row.querySelectorAll("[data-kpi-tab]").forEach((el) => {
      el.addEventListener("click", () => onNavigate(el.dataset.kpiTab));
    });
  }
  return row;
}

export function renderSidebarProjectItem(p, selected, opts = {}) {
  const { milestones = [] } = opts;
  const btn = document.createElement("button");
  btn.type = "button";
  const pt = p.projectType || defaultProjectType();
  btn.className = `proj-list-item proj-list-item--${pt}${selected ? " is-selected" : ""}`;
  const ic = TYPE_ICON[pt] || "building";
  const metaParts = [p.code || "No code"];
  if (p.location) metaParts.push(p.location);
  const progress = resolveProjectProgress(p, milestones);
  const health = computeProjectHealth(p, milestones);
  btn.innerHTML = `
    <span class="proj-list-accent" aria-hidden="true"></span>
    <span class="proj-list-icon proj-list-icon--${pt}">${icon(ic, { size: 20, className: "icon" })}</span>
    <span class="proj-list-body">
      <strong class="proj-list-name">${escapeHtml(p.name)}</strong>
      <span class="proj-list-meta">${escapeHtml(metaParts.join(" · "))}</span>
      <span class="proj-list-foot">
        <span class="proj-list-chip">${statusChip(p.status || "ongoing")}</span>
        <span class="proj-list-progress">${progress}%</span>
        <span class="proj-list-health proj-list-health--${health}" title="${escapeHtml(healthLabel(health))}"></span>
      </span>
    </span>
  `;
  return btn;
}

/**
 * Hub hero — project identity left, actions + meta right (KPIs in separate dash-kpi-row).
 * @param {object} p
 * @param {{ onEdit?: () => void, onBack?: () => void, onArchive?: () => void, showArchive?: boolean }} [opts]
 */
export function renderProjectHubToolbar(p, opts = {}) {
  const { onEdit, onBack, onArchive, showArchive } = opts;
  const hero = document.createElement("div");
  const pt = p.projectType || defaultProjectType();
  const ic = TYPE_ICON[pt] || "building";
  hero.className = `proj-hub-hero proj-header card proj-header--${pt}`;
  const client = p.clientName?.trim() || "—";
  const pm = resolveManagerLabel(p.projectManagerId);
  const sicRow = p.siteInChargeId ? readRef(`siteInCharges/${p.siteInChargeId}`) : null;
  const siteInChargeLabel = p.siteInChargeId ? sicRow?.name || "—" : "Unassigned";
  const siteInChargeHtml = p.siteInChargeId
    ? `<a href="/site-incharge?id=${encodeURIComponent(p.siteInChargeId)}&projectId=${encodeURIComponent(p.id)}" class="proj-header-link">${escapeHtml(siteInChargeLabel)}</a>`
    : escapeHtml(siteInChargeLabel);

  hero.innerHTML = `
    <div class="proj-hub-hero-top">
      ${
        onBack
          ? `<button type="button" class="btn btn-ghost btn-sm proj-header-back proj-hub-hero-back proj-hub-hero-back--compact" id="proj-hub-back">${icon("chevronLeft", { size: 14, className: "icon" })} Back to projects</button>`
          : `<span class="proj-hub-hero-top-spacer" aria-hidden="true"></span>`
      }
      <div class="proj-hub-hero-top-actions">
        <span class="proj-header-type-badge">${escapeHtml(projectTypeLabel(pt))}</span>
        ${
          showArchive && (p.status || "") !== "archived"
            ? `<button type="button" class="btn btn-ghost btn-sm" id="proj-hub-archive">Archive</button>`
            : ""
        }
        <button type="button" class="btn btn-primary btn-sm" id="proj-hub-edit">Edit profile</button>
      </div>
    </div>
    <div class="proj-hub-hero-body">
      <div class="proj-header-main">
        <span class="proj-header-icon proj-header-icon--${pt}">${icon(ic, { size: 24, className: "icon" })}</span>
        <div class="proj-header-title-block">
          <div class="proj-header-title-row">
            <h2 class="proj-header-title">${escapeHtml(p.name)}</h2>
            <span class="proj-header-sep" aria-hidden="true">·</span>
            <span class="proj-header-code">${escapeHtml(p.code || "—")}</span>
            ${
              p.location
                ? `<span class="proj-header-sep" aria-hidden="true">·</span><span class="proj-header-loc">${icon("mapPin", { size: 13, className: "icon" })} ${escapeHtml(p.location)}</span>`
                : ""
            }
            <span class="proj-hub-hero-status">${statusChip(p.status || "ongoing")}</span>
          </div>
        </div>
      </div>
      <div class="proj-hub-hero-row proj-hub-hero-row--meta">
        <span class="proj-header-meta-item">Client: ${escapeHtml(client)}</span>
        <span class="proj-header-meta-item">PM: ${escapeHtml(pm)}</span>
        <span class="proj-header-meta-item">Site In-charge: ${siteInChargeHtml}</span>
      </div>
    </div>
  `;

  hero.querySelector("#proj-hub-edit")?.addEventListener("click", () => onEdit?.());
  hero.querySelector("#proj-hub-archive")?.addEventListener("click", () => onArchive?.());
  hero.querySelector("#proj-hub-back")?.addEventListener("click", () => onBack?.());
  return hero;
}

/** @deprecated Prefer renderProjectHubToolbar + renderProjectHubKpiRow */
export function renderProjectHeader(p, hubState, opts = {}) {
  const wrap = document.createElement("div");
  wrap.className = "proj-header-legacy-wrap";
  wrap.appendChild(renderProjectHubToolbar(p, opts));
  wrap.appendChild(renderProjectHubKpiRow(p, hubState, { onNavigate: opts.onKpiNavigate }));
  return wrap;
}

/** @deprecated Use renderProjectHubToolbar */
export function renderProjectHero(p, onEdit) {
  return renderProjectHubToolbar(p, { onEdit });
}

/** @deprecated Use renderProjectHubKpiRow */
export function renderProjectKpiRow(stats) {
  const row = document.createElement("div");
  row.className = "dash-kpi-row";
  row.innerHTML = renderDashKpiRow(
    (stats || []).map((s) => ({
      label: s.label,
      value: s.value,
      icon: "progress",
      footLeft: "",
      spark: buildDashSparkline([2, 3, 3, 4, 4, 5, 5], "blue"),
    }))
  );
  return row;
}

/**
 * Reports-style group + module pill navigation.
 * @param {Array<{id:string,label:string,group:string}>} tabs
 * @param {string} activeTab
 * @param {string} activeGroup
 * @param {(payload: { tab: string, group: string }) => void} onSelect
 */
export function renderProjectHubTabNav(tabs, activeTab, activeGroup, onSelect) {
  const wrap = document.createElement("div");
  wrap.className = "rep-tab-host proj-hub-tab-host";

  const groupsRow = document.createElement("div");
  groupsRow.className = "rep-pill-tabs rep-pill-tabs--reports-main rep-pill-tabs--proj-hub-groups";
  groupsRow.setAttribute("role", "tablist");
  groupsRow.setAttribute("aria-label", "Module groups");

  const visibleGroups = PROJECT_TAB_GROUPS.filter((g) => tabs.some((t) => t.group === g.id));

  for (const g of visibleGroups) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.role = "tab";
    btn.dataset.group = g.id;
    btn.setAttribute("aria-selected", activeGroup === g.id ? "true" : "false");
    btn.className = `proj-tab rep-tab-pill rep-tab-pill--proj_${g.id}${activeGroup === g.id ? " is-active" : ""}`;
    btn.textContent = g.label;
    btn.onclick = () => {
      const first = tabs.find((t) => t.group === g.id);
      if (first) onSelect?.({ tab: first.id, group: g.id });
    };
    groupsRow.appendChild(btn);
  }
  wrap.appendChild(groupsRow);

  const subTabs = tabs.filter((tab) => tab.group === activeGroup);
  if (subTabs.length > 1) {
    const sub = document.createElement("div");
    sub.className = "rep-pill-tabs rep-pill-tabs--reports-main rep-pill-tabs--proj-hub-modules";
    sub.setAttribute("role", "tablist");
    sub.setAttribute("aria-label", "Project modules");

    for (const t of subTabs) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.role = "tab";
      btn.dataset.tab = t.id;
      btn.setAttribute("aria-selected", activeTab === t.id ? "true" : "false");
      btn.className = `proj-tab rep-tab-pill rep-tab-pill--proj_mod_${t.id}${activeTab === t.id ? " is-active" : ""}`;
      btn.textContent = TAB_LABEL_SHORT[t.label] || t.label;
      btn.onclick = () => onSelect?.({ tab: t.id, group: t.group });
      sub.appendChild(btn);
    }
    wrap.appendChild(sub);
  }

  return wrap;
}

/** @deprecated Use renderProjectHubTabNav */
export function renderGroupedTabNav(tabs, activeTab, activeGroup, onSelect) {
  return renderProjectHubTabNav(tabs, activeTab, activeGroup, onSelect);
}

/**
 * Wrap tab content in Reports-style dash-widget shell.
 * @param {string} tabId
 * @param {object} project
 * @param {HTMLElement} contentNode
 */
export function wrapProjectHubTabPanel(tabId, project, contentNode) {
  const gov = isGovProject(project);
  const meta = { ...(HUB_TAB_PANEL_META[tabId] || { title: tabId, sub: "", headerIcon: "projectCost" }) };
  if (tabId === "boq") {
    meta.title = gov ? "BOQ & CSR" : "BOQ & Budget";
  }
  if (tabId === "contract") {
    meta.title = gov ? "Contract" : "Client Contract";
  }
  if (tabId === "contracts") {
    meta.title = gov ? "VO, Claims & EOT" : "Contracts & Claims";
  }

  const bodyId = `proj-hub-body-${tabId}`;
  const shell = document.createElement("div");
  shell.innerHTML = reportsWidgetShell({
    title: meta.title,
    sub: meta.sub,
    bodyId,
    headerIcon: meta.headerIcon,
    extraClass: "proj-hub-panel",
  });
  const panel = shell.firstElementChild;
  const body = panel.querySelector(`#${bodyId}`);
  if (body && contentNode) {
    // Avoid duplicate titles when tab builders return sectionCard
    if (contentNode.classList?.contains("section-card")) {
      const inner = contentNode.querySelector(".section-card-body");
      if (inner) {
        while (inner.firstChild) body.appendChild(inner.firstChild);
      } else {
        body.appendChild(contentNode);
      }
    } else {
      // Strip empty toolbars that only duplicate the widget title
      const toolbar = contentNode.querySelector?.(":scope > .proj-tab-toolbar");
      if (toolbar && !toolbar.querySelector(".proj-tab-toolbar-actions")?.children?.length) {
        const titleEl = toolbar.querySelector(".proj-tab-toolbar-title");
        if (titleEl && titleEl.textContent.trim().toLowerCase() === meta.title.toLowerCase()) {
          toolbar.remove();
        }
      }
      body.appendChild(contentNode);
    }
  }
  return panel;
}

/**
 * Icon rows for project hub Overview “At a glance”.
 * @param {Array<{label:string,value?:string,valueHtml?:string,icon?:string,isTimeline?:boolean}>} items
 */
export function renderProfileGlanceRows(items) {
  const wrap = document.createElement("div");
  wrap.className = "proj-glance-rows";
  for (const item of items) {
    const row = document.createElement("div");
    row.className = "proj-glance-row";
    const ic = item.icon || "layers";
    const valueEl =
      item.isTimeline && item.value
        ? `<span class="proj-home-timeline-pill">${icon("calendar", { size: 14, className: "icon" })} ${escapeHtml(item.value)}</span>`
        : item.valueHtml != null
          ? item.valueHtml
          : escapeHtml(String(item.value ?? "—"));
    row.innerHTML = `
      <span class="proj-glance-row-icon" aria-hidden="true">${icon(ic, { size: 16, className: "icon" })}</span>
      <span class="proj-glance-row-body">
        <span class="proj-glance-row-label">${escapeHtml(item.label)}</span>
        <span class="proj-glance-row-value">${valueEl}</span>
      </span>
    `;
    wrap.appendChild(row);
  }
  return wrap;
}

/**
 * @param {Array<{label:string,value?:string,valueHtml?:string}>} items
 */
export function renderProfileDefinitionList(items) {
  const dl = document.createElement("dl");
  dl.className = "proj-def-list";
  for (const item of items) {
    const dt = document.createElement("dt");
    dt.textContent = item.label;
    const dd = document.createElement("dd");
    if (item.valueHtml != null) dd.innerHTML = item.valueHtml;
    else dd.textContent = String(item.value ?? "—");
    dl.appendChild(dt);
    dl.appendChild(dd);
  }
  return dl;
}

/**
 * @param {object} p - project
 * @param {Array<{label:string,value?:string,valueHtml?:string}>} [extras]
 */
export function renderProfileStatGrid(p, extras = []) {
  const items = [
    { label: "Client", value: p.clientName || "—" },
    { label: "Project manager", value: resolveManagerLabel(p.projectManagerId) },
    ...extras,
  ];
  return renderProfileDefinitionList(items);
}

export function renderProfileDescription(description, { clamp = false } = {}) {
  if (!description?.trim()) return null;
  const el = document.createElement("div");
  el.className = `proj-desc-panel${clamp ? " proj-desc-panel--clamp" : ""}`;
  el.innerHTML = `
    <span class="proj-desc-panel-label">${icon("fileText", { size: 16, className: "icon" })} Description</span>
    <p class="proj-desc-panel-text">${escapeHtml(description)}</p>
    ${clamp ? '<button type="button" class="proj-desc-expand btn btn-ghost btn-sm">Show more</button>' : ""}
  `;
  if (clamp) {
    el.querySelector(".proj-desc-expand")?.addEventListener("click", () => {
      el.classList.remove("proj-desc-panel--clamp");
      el.querySelector(".proj-desc-expand")?.remove();
    });
  }
  return el;
}
