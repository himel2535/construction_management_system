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
    blue: "#8a2e2e",
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
  section.className = "dash-widget dash-widget--projects card sic-detail-header sic-detail-header--hero";
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
  const activeContext =
    assignments.find((a) => a.projectId === meta.contextProjectId) || assignments[0] || null;
  const contextBar =
    assignments.length > 0
      ? `<div class="sic-context-bar">
          <span class="sic-context-bar-label">Work context</span>
          ${
            assignments.length > 1
              ? `<select class="cust-form-input sic-context-select" id="sic-context-project">${contextOpts}</select>`
              : `<span class="sic-context-bar-value">${escapeHtml(activeContext?.projectName || activeContext?.projectId || "—")}</span>`
          }
        </div>`
      : "";

  section.innerHTML = `
    <div class="dash-widget-head dash-widget-head--split sic-detail-header-inner sic-detail-header-hero">
      <div class="sic-detail-header-main">
        <span class="sup-avatar sup-avatar--lg sic-avatar sic-avatar--hero" aria-hidden="true">${escapeHtml(initials(s.name))}</span>
        <div class="sic-detail-header-copy">
          <div class="sic-detail-title-row">
            <h2 class="dash-widget-title sic-detail-title">${escapeHtml(s.name)}</h2>
            ${statusChip(s.status || "active")}
          </div>
          <p class="dash-widget-sub sic-detail-sub">Field PM · ${escapeHtml(s.phone || "—")}</p>
          <p class="sic-detail-projects text-muted">Projects: ${escapeHtml(projects)}</p>
          ${contextBar}
        </div>
      </div>
      <div class="cust-toolbar-btn-group sic-detail-header-actions">
        <button type="button" class="btn btn-edit btn-sm" id="sic-header-edit">Edit</button>
        <button type="button" class="btn btn-primary btn-sm" id="sic-header-assign">Assign project</button>
      </div>
    </div>
    <div class="dash-widget-body sic-header-stats sic-header-stat-grid">
      <div class="sic-header-stat-tile">
        <span class="sic-header-stat-value">${meta.rosterCount ?? 0}</span>
        <span class="sic-header-stat-label">Workers</span>
      </div>
      <div class="sic-header-stat-tile">
        <span class="sic-header-stat-value">${meta.materialLogsMonth ?? 0}</span>
        <span class="sic-header-stat-label">Logs (${escapeHtml(meta.monthLabel || "month")})</span>
      </div>
      <div class="sic-header-stat-tile">
        <span class="sic-header-stat-value">${formatBDT(meta.laborMonth ?? 0)}</span>
        <span class="sic-header-stat-label">Labor</span>
      </div>
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

export function renderOverviewEmptyPanel(message, hint = "") {
  return `<div class="sic-overview-empty-panel">
    <p class="sic-overview-empty-msg">${escapeHtml(message)}</p>
    ${hint ? `<p class="sic-overview-empty-hint">${escapeHtml(hint)}</p>` : ""}
  </div>`;
}

export function renderMaterialVarianceTable(rows = [], { emptyHint = "" } = {}) {
  if (!rows.length) {
    return renderOverviewEmptyPanel(
      "No variance data",
      emptyHint || "Variance appears when issued and used quantities are recorded."
    );
  }
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

function activityTypeLabel(type) {
  if (type === "payroll") return "Payroll";
  if (type === "material") return "Material";
  return "Activity";
}

export function renderActivityFeed(items = [], { variant = "default" } = {}) {
  if (!items.length) {
    return variant === "hub"
      ? renderOverviewEmptyPanel(
          "No recent activity",
          "Material logs and payroll entries will appear here."
        )
      : `<p class="proj-empty">No recent activity</p>`;
  }
  if (variant === "hub") {
    return `<ul class="sic-overview-activity-list sic-activity-list--hub">${items
      .map(
        (a) => `<li class="sic-activity-item--hub sic-activity-item--${escapeHtml(a.type || "other")}">
          <div class="sic-activity-item-head">
            <span class="sic-activity-type">${escapeHtml(activityTypeLabel(a.type))}</span>
            <span class="sic-activity-date">${escapeHtml(a.date || "—")}</span>
            ${statusChip(a.status || "submitted")}
          </div>
          <span class="sic-activity-label">${escapeHtml(a.label)}</span>
          ${a.amount != null ? `<span class="sic-activity-amt">${formatBDT(a.amount)}</span>` : ""}
        </li>`
      )
      .join("")}</ul>`;
  }
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

export function renderSettlementStatGrid({
  statusChipHtml,
  labor,
  net,
  materialCount,
  netAttention = false,
  statusAttention = false,
}) {
  const grid = document.createElement("div");
  grid.className = "sic-settlement-stat-grid";
  grid.innerHTML = `
    <div class="sic-settlement-stat-tile sic-settlement-stat-tile--rose${statusAttention ? " sic-settlement-stat-tile--attention" : ""}">
      <span class="sic-settlement-stat-value sic-settlement-stat-value--chip">${statusChipHtml}</span>
      <span class="sic-settlement-stat-label">Status</span>
    </div>
    <div class="sic-settlement-stat-tile sic-settlement-stat-tile--mint">
      <span class="sic-settlement-stat-value">${escapeHtml(String(labor ?? "—"))}</span>
      <span class="sic-settlement-stat-label">Labor (month)</span>
    </div>
    <div class="sic-settlement-stat-tile sic-settlement-stat-tile--blue${netAttention ? " sic-settlement-stat-tile--attention" : ""}">
      <span class="sic-settlement-stat-value" id="sic-settlement-metrics-net">${escapeHtml(String(net ?? "—"))}</span>
      <span class="sic-settlement-stat-label">Net payable</span>
    </div>
    <div class="sic-settlement-stat-tile sic-settlement-stat-tile--lavender">
      <span class="sic-settlement-stat-value">${escapeHtml(String(materialCount ?? 0))}</span>
      <span class="sic-settlement-stat-label">Material items</span>
    </div>
  `;
  return grid;
}

export function renderSettlementForm(draft, { readOnly = false } = {}) {
  const ro = readOnly ? "readonly disabled" : "";
  const form = document.createElement("div");
  form.className = `sic-settlement-form${readOnly ? " sic-settlement-form--readonly" : ""}`;
  form.innerHTML = `
    <div class="sic-settlement-formula-board">
      <div class="sic-settlement-formula-card sic-settlement-formula-card--rose">
        <span class="sic-settlement-formula-card-label">Monthly rate (BDT)</span>
        <input name="monthlyRate" type="number" class="sic-settlement-formula-input" min="0" step="0.01" value="${draft.monthlyRate ?? ""}" placeholder="0" ${ro} />
      </div>
      <span class="sic-settlement-formula-op" aria-hidden="true">+</span>
      <div class="sic-settlement-formula-card sic-settlement-formula-card--mint">
        <span class="sic-settlement-formula-card-label">Labor (month)</span>
        <strong class="sic-settlement-formula-readonly">${formatBDT(draft.laborTotal || 0)}</strong>
      </div>
      <span class="sic-settlement-formula-op" aria-hidden="true">−</span>
      <div class="sic-settlement-formula-card sic-settlement-formula-card--lavender">
        <span class="sic-settlement-formula-card-label">Advance paid</span>
        <input name="advancePaid" type="number" class="sic-settlement-formula-input" min="0" step="0.01" value="${draft.advancePaid ?? ""}" placeholder="0" ${ro} />
      </div>
      <span class="sic-settlement-formula-op" aria-hidden="true">−</span>
      <div class="sic-settlement-formula-card sic-settlement-formula-card--peach">
        <span class="sic-settlement-formula-card-label">Deductions</span>
        <input name="deductions" type="number" class="sic-settlement-formula-input" min="0" step="0.01" value="${draft.deductions ?? ""}" placeholder="0" ${ro} />
      </div>
      <span class="sic-settlement-formula-op sic-settlement-formula-op--equals" aria-hidden="true">=</span>
      <div class="sic-settlement-net-hero">
        <span class="sic-settlement-net-label">Net payable</span>
        <strong class="sic-net-value">${formatBDT(draft.netPayable || 0)}</strong>
      </div>
    </div>
  `;
  return form;
}
