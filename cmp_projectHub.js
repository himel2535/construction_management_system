/** Projects hub UI — sidebar, header, grouped tabs, profile fields */

import { icon } from "./cmp_icons.js";
import { statusChip } from "./cmp_ui.js";
import { formatBDT, formatDateRange } from "./util_format.js";
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
  "Measurement & IPC": "Measurement & IPC",
  "Retention & Final": "Retention",
  "BOQ & CSR": "BOQ & CSR",
  "BOQ & Budget": "BOQ & Budget",
  "VO, Claims & EOT": "VO & EOT",
  "Contracts & Claims": "Contracts",
};

const TYPE_ICON = {
  government_civil: "landmark",
  private_civil: "hardHat",
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
    return [
      {
        label: "Budget",
        value: resolveBudgetTotal(p) ? formatBDT(resolveBudgetTotal(p)) : "—",
        tab: "contract",
      },
      { label: "Progress", value: `${progress}%`, tab: "milestones" },
      { label: "Health", value: health, tab: "timeline" },
      {
        label: "Open IPC bills",
        value: String(openIpc),
        tab: "measurement",
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
    },
    {
      label: "Billed",
      value: kpis.billed ? formatBDT(kpis.billed) : "—",
      tab: "billing",
    },
    {
      label: "Outstanding",
      value: kpis.outstanding ? formatBDT(kpis.outstanding) : "—",
      tab: "billing",
    },
    { label: "Progress", value: `${progress}%`, tab: "milestones" },
  ];
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
 * Unified project header — hero + inline KPIs in one strip.
 * @param {object} p
 * @param {object} hubState
 * @param {{ onEdit?: () => void, onKpiNavigate?: (tabId: string) => void }} [opts]
 */
export function renderProjectHeader(p, hubState, opts = {}) {
  const { onEdit, onKpiNavigate } = opts;
  const header = document.createElement("div");
  const pt = p.projectType || defaultProjectType();
  header.className = `proj-header card proj-header--${pt}`;
  const ic = TYPE_ICON[pt] || "building";
  const kpis = buildProjectKpiStats(p, hubState);
  const client = p.clientName?.trim() || "—";
  const pm = resolveManagerLabel(p.projectManagerId);
  const sicRow = p.siteInChargeId ? readRef(`siteInCharges/${p.siteInChargeId}`) : null;
  const siteInChargeLabel = p.siteInChargeId ? sicRow?.name || "—" : "Unassigned";
  const siteInChargeHtml = p.siteInChargeId
    ? `<a href="#/site-incharge?id=${encodeURIComponent(p.siteInChargeId)}&projectId=${encodeURIComponent(p.id)}" class="proj-header-link">${escapeHtml(siteInChargeLabel)}</a>`
    : escapeHtml(siteInChargeLabel);

  const kpiHtml = kpis
    .map((k) => {
      const clickable = k.tab && onKpiNavigate;
      const tag = clickable ? "button" : "span";
      return `<${tag}${clickable ? ' type="button"' : ""} class="proj-header-kpi${clickable ? " proj-header-kpi--link" : ""}"${clickable ? ` data-kpi-tab="${k.tab}"` : ""} role="listitem">
        <span class="proj-header-kpi-label">${escapeHtml(k.label)}</span>
        <span class="proj-header-kpi-value">${escapeHtml(k.value)}</span>
      </${tag}>`;
    })
    .join("");

  header.innerHTML = `
    <div class="proj-header-top">
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
          </div>
        </div>
      </div>
      <div class="proj-header-actions">
        ${statusChip(p.status || "ongoing")}
        <button type="button" class="btn btn-primary btn-sm" id="proj-header-edit">Edit profile</button>
      </div>
    </div>
    <p class="proj-header-meta">
      <span class="proj-header-type-badge">${escapeHtml(projectTypeLabel(pt))}</span>
      <span class="proj-header-meta-item">Client: ${escapeHtml(client)}</span>
      <span class="proj-header-meta-item">PM: ${escapeHtml(pm)}</span>
      <span class="proj-header-meta-item">Site In-charge: ${siteInChargeHtml}</span>
    </p>
    <div class="proj-header-kpis" role="list">${kpiHtml}</div>
  `;

  header.querySelector("#proj-header-edit")?.addEventListener("click", () => onEdit?.());
  header.querySelectorAll("[data-kpi-tab]").forEach((el) => {
    el.addEventListener("click", () => onKpiNavigate?.(el.dataset.kpiTab));
  });
  return header;
}

/** @deprecated Use renderProjectHeader */
export function renderProjectHero(p, onEdit) {
  return renderProjectHeader(p, {}, { onEdit });
}

/** @deprecated Use renderProjectHeader */
export function renderProjectKpiRow(stats) {
  const row = document.createElement("div");
  row.className = "proj-header-kpis";
  row.innerHTML = stats
    .map(
      (s) => `<span class="proj-header-kpi" role="listitem">
      <span class="proj-header-kpi-label">${escapeHtml(s.label)}</span>
      <span class="proj-header-kpi-value">${escapeHtml(s.value)}</span>
    </span>`
    )
    .join("");
  return row;
}

/**
 * @param {Array<{id:string,label:string,group:string}>} tabs
 * @param {string} activeTab
 * @param {string} activeGroup
 * @param {(payload: { tab: string, group: string }) => void} onSelect
 */
export function renderGroupedTabNav(tabs, activeTab, activeGroup, onSelect) {
  const wrap = document.createElement("div");
  wrap.className = "proj-tab-groups";

  const groupsRow = document.createElement("div");
  groupsRow.className = "proj-tab-group-row";
  groupsRow.setAttribute("role", "tablist");
  groupsRow.setAttribute("aria-label", "Module groups");

  const visibleGroups = PROJECT_TAB_GROUPS.filter((g) => tabs.some((t) => t.group === g.id));

  for (const g of visibleGroups) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = `proj-tab-group${activeGroup === g.id ? " is-active" : ""}`;
    btn.dataset.group = g.id;
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
    sub.className = "proj-tab-subnav";
    sub.setAttribute("role", "tablist");
    sub.setAttribute("aria-label", "Project modules");

    for (const t of subTabs) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = `proj-tab${activeTab === t.id ? " is-active" : ""}`;
      btn.dataset.tab = t.id;
      btn.textContent = TAB_LABEL_SHORT[t.label] || t.label;
      btn.onclick = () => onSelect?.({ tab: t.id, group: t.group });
      sub.appendChild(btn);
    }
    wrap.appendChild(sub);
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
