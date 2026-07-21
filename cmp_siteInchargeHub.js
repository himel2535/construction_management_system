/** Site Management hub — list, header, tabs */

import { icon } from "./cmp_icons.js";
import { statusChip } from "./cmp_ui.js";
import { escapeHtml } from "./cmp_projectTab.js";
import { kpiIcon } from "./cmp_dashboardIcons.js";
import { formatBDT } from "./util_format.js";
import { SITE_INCHARGE_TABS } from "./util_siteIncharge.js";

function initials(name) {
  return String(name || "?")
    .split(/\s+/)
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

function sicSparklineSvg(values = [], tone = "green") {
  const pts = values.length ? values : [3, 4, 4, 5, 5, 6, 6];
  const max = Math.max(...pts, 1);
  const w = 56;
  const h = 22;
  const coords = pts
    .map((v, i) => {
      const x = (i / (pts.length - 1 || 1)) * w;
      const y = h - (v / max) * (h - 4) - 2;
      return `${x},${y}`;
    })
    .join(" ");
  const strokes = {
    blue: "#2563eb",
    green: "#047857",
    orange: "#d97706",
    teal: "#0d9488",
    red: "#B91C1C",
    yellow: "#CA8A04",
  };
  const stroke = strokes[tone] || strokes.green;
  return `<svg class="dash-sparkline dash-sparkline--${tone}" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none"><polyline points="${coords}" fill="none" stroke="${stroke}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
}

/** @returns {HTMLElement} innerHTML-ready KPI host content */
export function renderSiteInchargeKpiStripHtml(stats) {
  const cards = [
    {
      label: "Site in-charges",
      value: String(stats.total),
      iconKey: "projects",
      tone: "blue",
      footLeft: `${stats.active} active`,
      spark: sicSparklineSvg([2, stats.total || 1, stats.active || 1, stats.total || 2, 2, 2, 2], "blue"),
    },
    {
      label: "Assigned projects",
      value: String(stats.assignedProjects),
      iconKey: "collection",
      tone: "green",
      footLeft: "Active assignments",
      spark: sicSparklineSvg([2, stats.assignedProjects || 1, 2, 3, 2, 2, 2], "green"),
    },
    {
      label: "Material logs",
      value: String(stats.materialLogsMonth),
      iconKey: "expense",
      tone: "orange",
      footLeft: stats.contextLabel || "This month",
      spark: sicSparklineSvg([stats.materialLogsMonth || 1, 2, 2, 1, 1, 1, 1], "orange"),
    },
    {
      label: "Workers on roster",
      value: String(stats.rosterCount),
      iconKey: "receivable",
      tone: "teal",
      footLeft: "Under selected context",
      spark: sicSparklineSvg([stats.rosterCount || 1, 2, 2, 1, 1, 1, 1], "teal"),
    },
  ];
  return cards
    .map(
      (c) => `<div class="dash-kpi-card card cust-kpi-card">
      <div class="cust-kpi-spark">${c.spark}</div>
      <div class="dash-kpi-head">
        <div class="dash-kpi-icon dash-kpi-icon--flat">${kpiIcon(c.iconKey).replace('class="dash-color-icon"', 'class="dash-color-icon cust-kpi-flat-icon"')}</div>
        <div class="dash-kpi-main">
          <span class="dash-kpi-label">${escapeHtml(c.label)}</span>
          <div class="dash-kpi-value">${escapeHtml(c.value)}</div>
        </div>
      </div>
      <div class="dash-kpi-foot">
        <div class="dash-kpi-foot-left">${escapeHtml(c.footLeft)}</div>
      </div>
    </div>`
    )
    .join("");
}

/** @deprecated use renderSiteInchargeKpiStripHtml */
export function renderSiteInchargeKpiRow(stats, handlers = {}) {
  const row = document.createElement("div");
  row.className = "dash-kpi-row sic-kpi-host";
  row.innerHTML = renderSiteInchargeKpiStripHtml(stats);
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
    <span class="sic-list-chip">${statusChip(s.status || "active")}</span>
  `;
  return btn;
}

export function renderSiteInchargeHeader(s, meta = {}, handlers = {}) {
  const section = document.createElement("section");
  section.className = "dash-widget dash-widget--projects card sic-detail-header";
  const assignments = meta.contextAssignments || [];
  const contextOpts =
    assignments.length > 0
      ? assignments
          .map(
            (a) =>
              `<option value="${escapeHtml(a.projectId)}" ${meta.contextProjectId === a.projectId ? "selected" : ""}>${escapeHtml(a.projectName || a.projectId)}</option>`
          )
          .join("")
      : "";
  const projects = meta.projectNames?.length ? meta.projectNames.join(", ") : "No active project";

  section.innerHTML = `
    <div class="dash-widget-head dash-widget-head--split sic-detail-header-inner">
      <div class="sic-detail-header-main">
        <span class="sup-avatar sup-avatar--lg sic-avatar" aria-hidden="true">${escapeHtml(initials(s.name))}</span>
        <div>
          <div class="sic-detail-title-row">
            <h2 class="dash-widget-title sic-detail-title">${escapeHtml(s.name)}</h2>
            ${statusChip(s.status || "active")}
          </div>
          <p class="dash-widget-sub">Field PM · ${escapeHtml(s.phone || "—")}</p>
          <p class="sic-detail-projects text-muted">Projects: ${escapeHtml(projects)}</p>
          ${
            assignments.length > 1
              ? `<label class="sic-context-select-label">Work context
            <select class="cust-form-input sic-context-select" id="sic-context-project">
              ${contextOpts}
            </select></label>`
              : ""
          }
        </div>
      </div>
      <div class="cust-toolbar-btn-group">
        <button type="button" class="btn btn-ghost btn-sm" id="sic-header-edit">Edit</button>
        <button type="button" class="btn btn-primary btn-sm" id="sic-header-assign">Assign project</button>
      </div>
    </div>
    <div class="dash-widget-body sic-header-stats">
      <span class="sic-stat"><strong>${meta.rosterCount ?? 0}</strong> workers</span>
      <span class="sic-stat"><strong>${meta.materialLogsMonth ?? 0}</strong> logs (${escapeHtml(meta.monthLabel || "month")})</span>
      <span class="sic-stat"><strong>${formatBDT(meta.laborMonth ?? 0)}</strong> labor</span>
    </div>
  `;
  section.querySelector("#sic-header-edit")?.addEventListener("click", () => handlers.onEdit?.());
  section.querySelector("#sic-header-assign")?.addEventListener("click", () => handlers.onAssign?.());
  section.querySelector("#sic-context-project")?.addEventListener("change", (e) => {
    handlers.onContextChange?.(e.target.value);
  });
  return section;
}

export function renderSiteInchargeTabBar(activeTab, onSelect) {
  const bar = document.createElement("div");
  bar.className = "proj-tab-subnav sic-pill-tabs sic-pill-tabs--sic-main";
  for (const t of SITE_INCHARGE_TABS) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = `proj-tab sic-tab-pill sic-tab-pill--${t.id}${activeTab === t.id ? " is-active" : ""}`;
    btn.textContent = t.label;
    btn.onclick = () => onSelect(t.id);
    bar.appendChild(btn);
  }
  return bar;
}

export function sectionCard(title, bodyEl) {
  const section = document.createElement("section");
  section.className = "dash-widget dash-widget--projects card sic-report-block";
  const head = document.createElement("div");
  head.className = "dash-widget-head";
  head.innerHTML = `<h3 class="dash-widget-title">${escapeHtml(title)}</h3>`;
  section.appendChild(head);
  const body = document.createElement("div");
  body.className = "dash-widget-body sic-section-body";
  if (typeof bodyEl === "string") {
    body.innerHTML = bodyEl;
  } else {
    body.appendChild(bodyEl);
  }
  section.appendChild(body);
  return section;
}

export function renderMaterialVarianceTable(rows = []) {
  if (!rows.length) return `<p class="proj-empty">No variance data</p>`;
  return `<div class="table-wrap projects-table-wrap"><table class="dash-table projects-table sic-table"><thead><tr><th>Material</th><th class="cust-col-center">Issued / Logged</th><th class="cust-col-center">Used / Received</th><th class="cust-col-center">Variance</th></tr></thead><tbody>${rows
    .map((r) => {
      const issued = r.issued ?? r.logged ?? 0;
      const used = r.used ?? r.received ?? 0;
      const variance = r.variance ?? issued - used;
      const warn = Math.abs(variance) > 0.01 ? " variance-warn-row" : "";
      return `<tr class="${warn}">
        <td>${escapeHtml(r.label || r.materialName)}</td>
        <td class="cust-col-center">${issued}</td>
        <td class="cust-col-center">${used}</td>
        <td class="cust-col-center ${Math.abs(variance) > 0.01 ? "sic-variance-warn" : ""}">${variance}</td>
      </tr>`;
    })
    .join("")}</tbody></table></div>`;
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
  form.className = "sic-settlement-form-inner cust-form-grid cust-form-grid--2";
  form.innerHTML = `
    <label class="cust-form-field">
      <span class="cust-form-label">Monthly rate (BDT)</span>
      <input name="monthlyRate" type="number" class="cust-form-input" min="0" step="0.01" value="${draft.monthlyRate ?? ""}" ${readOnly ? "readonly" : ""} />
    </label>
    <label class="cust-form-field">
      <span class="cust-form-label">Advance paid</span>
      <input name="advancePaid" type="number" class="cust-form-input" min="0" step="0.01" value="${draft.advancePaid ?? ""}" ${readOnly ? "readonly" : ""} />
    </label>
    <label class="cust-form-field">
      <span class="cust-form-label">Deductions</span>
      <input name="deductions" type="number" class="cust-form-input" min="0" step="0.01" value="${draft.deductions ?? ""}" ${readOnly ? "readonly" : ""} />
    </label>
    <div class="cust-form-field">
      <span class="cust-form-label">Net payable</span>
      <div class="sic-net-value">${formatBDT(draft.netPayable || 0)}</div>
    </div>
    <p class="cust-form-field cust-form-field--full text-muted">Labor total: <strong>${formatBDT(draft.laborTotal || 0)}</strong></p>
  `;
  return form;
}
