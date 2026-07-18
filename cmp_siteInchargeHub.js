/** Site in-charge hub — list, header, tabs */

import { icon } from "./cmp_icons.js";
import { statusChip } from "./cmp_ui.js";
import { formatBDT } from "./util_format.js";
import { SITE_INCHARGE_TABS } from "./util_siteIncharge.js";

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function initials(name) {
  return String(name || "?")
    .split(/\s+/)
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

export function renderSiteInchargeKpiRow(stats, handlers = {}) {
  const row = document.createElement("div");
  row.className = "sup-kpi-row sic-kpi-row";
  row.innerHTML = `
    <div class="sup-kpi-cards">
      <div class="sup-kpi-card">
        <span class="sup-kpi-card-icon">${icon("hardhat", { size: 18, className: "icon" })}</span>
        <div class="sup-kpi-card-body">
          <span class="sup-kpi-card-label">Site In-charges</span>
          <strong class="sup-kpi-card-value">${stats.total}</strong>
          <span class="sup-kpi-card-sub">${stats.active} active</span>
        </div>
      </div>
      <div class="sup-kpi-card">
        <span class="sup-kpi-card-icon sup-kpi-card-icon--ok">${icon("folder", { size: 18, className: "icon" })}</span>
        <div class="sup-kpi-card-body">
          <span class="sup-kpi-card-label">Assigned projects</span>
          <strong class="sup-kpi-card-value">${stats.assignedProjects}</strong>
          <span class="sup-kpi-card-sub">Active assignments</span>
        </div>
      </div>
      <div class="sup-kpi-card">
        <span class="sup-kpi-card-icon">${icon("package", { size: 18, className: "icon" })}</span>
        <div class="sup-kpi-card-body">
          <span class="sup-kpi-card-label">Material logs (month)</span>
          <strong class="sup-kpi-card-value">${stats.materialLogsMonth}</strong>
          <span class="sup-kpi-card-sub">This month</span>
        </div>
      </div>
      <div class="sup-kpi-card">
        <span class="sup-kpi-card-icon sup-kpi-card-icon--warn">${icon("users", { size: 18, className: "icon" })}</span>
        <div class="sup-kpi-card-body">
          <span class="sup-kpi-card-label">Workers on roster</span>
          <strong class="sup-kpi-card-value">${stats.rosterCount}</strong>
          <span class="sup-kpi-card-sub">Under in-charges</span>
        </div>
      </div>
    </div>
    <div class="sup-kpi-actions">
      <button type="button" class="btn btn-primary btn-sm" id="sic-kpi-new-btn">+ New Site In-charge</button>
    </div>
  `;
  row.querySelector("#sic-kpi-new-btn")?.addEventListener("click", () => handlers.onNew?.());
  return row;
}

export function renderSiteInchargeListItem(s, { selected = false, projectName = "" } = {}) {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = `sup-list-item sic-list-item${selected ? " is-selected" : ""}`;
  btn.dataset.id = s.id;
  const meta = [s.phone, projectName].filter(Boolean).join(" · ");
  btn.innerHTML = `
    <span class="sup-avatar sup-avatar--sm sic-avatar" aria-hidden="true">${escapeHtml(initials(s.name))}</span>
    <span class="sup-list-body">
      <strong class="sup-list-name">${escapeHtml(s.name)}</strong>
      <span class="sup-list-meta">${escapeHtml(meta || "No project")}</span>
    </span>
    ${statusChip(s.status || "active")}
  `;
  return btn;
}

export function renderSiteInchargeHeader(s, meta = {}, handlers = {}) {
  const header = document.createElement("div");
  header.className = "sup-detail-header card sic-detail-header";
  const projects = meta.projectNames?.length ? meta.projectNames.join(", ") : "No active project";
  header.innerHTML = `
    <div class="sup-detail-header-inner">
      <span class="sup-avatar sup-avatar--lg sic-avatar" aria-hidden="true">${escapeHtml(initials(s.name))}</span>
      <div class="sup-detail-header-main">
        <div class="sup-detail-title-row">
          <h2 class="sup-detail-title">${escapeHtml(s.name)}</h2>
          ${statusChip(s.status || "active")}
        </div>
        <p class="sup-detail-sub">Field PM · ${escapeHtml(s.phone || "—")}</p>
        <p class="sup-detail-since">Project: ${escapeHtml(projects)}</p>
      </div>
      <div class="sup-detail-header-actions">
        <button type="button" class="btn btn-ghost btn-sm" id="sic-header-edit">Edit</button>
        <button type="button" class="btn btn-primary btn-sm" id="sic-header-assign">Assign project</button>
      </div>
    </div>
    <div class="sic-header-stats">
      <span class="sic-stat"><strong>${meta.rosterCount ?? 0}</strong> workers</span>
      <span class="sic-stat"><strong>${meta.materialLogsMonth ?? 0}</strong> logs this month</span>
      <span class="sic-stat"><strong>${formatBDT(meta.laborMonth ?? 0)}</strong> labor (month)</span>
    </div>
  `;
  header.querySelector("#sic-header-edit")?.addEventListener("click", () => handlers.onEdit?.());
  header.querySelector("#sic-header-assign")?.addEventListener("click", () => handlers.onAssign?.());
  return header;
}

export function renderSiteInchargeTabBar(activeTab, onSelect) {
  const bar = document.createElement("div");
  bar.className = "sup-tab-bar sic-tab-bar";
  for (const t of SITE_INCHARGE_TABS) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = `sup-tab${activeTab === t.id ? " is-active" : ""}`;
    btn.textContent = t.label;
    btn.onclick = () => onSelect(t.id);
    bar.appendChild(btn);
  }
  return bar;
}

export function sectionCard(title, bodyEl) {
  const card = document.createElement("div");
  card.className = "card sic-section-card";
  const h = document.createElement("h3");
  h.className = "sic-section-title";
  h.textContent = title;
  card.appendChild(h);
  if (typeof bodyEl === "string") {
    const div = document.createElement("div");
    div.className = "sic-section-body";
    div.innerHTML = bodyEl;
    card.appendChild(div);
  } else {
    card.appendChild(bodyEl);
  }
  return card;
}

/** Variance table for GRN vs logged or issued vs used rows. */
export function renderMaterialVarianceTable(rows = []) {
  if (!rows.length) return `<p class="proj-empty">No variance data</p>`;
  return `<table class="data-table"><thead><tr><th>Material</th><th>Issued / Logged</th><th>Used / Received</th><th>Variance</th></tr></thead><tbody>${rows
    .map((r) => {
      const issued = r.issued ?? r.logged ?? 0;
      const used = r.used ?? r.received ?? 0;
      const variance = r.variance ?? issued - used;
      const warn = Math.abs(variance) > 0.01 ? " variance-warn-row" : "";
      return `<tr class="${warn}">
        <td>${escapeHtml(r.label || r.materialName)}</td>
        <td>${issued}</td>
        <td>${used}</td>
        <td class="${Math.abs(variance) > 0.01 ? "sic-variance-warn" : ""}">${variance}</td>
      </tr>`;
    })
    .join("")}</tbody></table>`;
}

export function renderActivityFeed(items = []) {
  if (!items.length) return `<p class="proj-empty">No recent activity</p>`;
  return `<ul class="sic-activity-list">${items
    .map(
      (a) => `<li>
        <span class="sic-activity-date">${escapeHtml(a.date || "—")}</span>
        <span>${escapeHtml(a.label)}</span>
        ${a.amount != null ? `<span class="sic-activity-amt">${formatBDT(a.amount)}</span>` : ""}
        ${statusChip(a.status || "submitted")}
      </li>`
    )
    .join("")}</ul>`;
}

export function renderSettlementForm(draft, { readOnly = false } = {}) {
  const form = document.createElement("div");
  form.className = "sic-settlement-card";
  form.innerHTML = `
    <h3>Settlement — ${escapeHtml(draft.month || "")}</h3>
    <p class="sic-settle-calc">Labor total: <strong>${formatBDT(draft.laborTotal || 0)}</strong> · Net payable: <strong>${formatBDT(draft.netPayable || 0)}</strong></p>
    ${readOnly ? "" : `<p class="text-muted">Save or approve from settlement tab actions.</p>`}
  `;
  return form;
}
