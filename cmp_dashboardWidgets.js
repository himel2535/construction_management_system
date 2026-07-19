import { progressBar } from "./cmp_ui.js";
import { formatCompactBDT, formatDashboardDeadline } from "./util_dashboard.js";

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function sparklineSvg(values = [], tone = "green") {
  const pts = values.length ? values : [4, 6, 5, 8, 7, 9, 8];
  const max = Math.max(...pts, 1);
  const w = 80;
  const h = 28;
  const coords = pts
    .map((v, i) => {
      const x = (i / (pts.length - 1 || 1)) * w;
      const y = h - (v / max) * (h - 4) - 2;
      return `${x},${y}`;
    })
    .join(" ");
  const stroke = tone === "red" ? "#ef4444" : tone === "blue" ? "#3b82f6" : "#10b981";
  return `<svg class="dash-sparkline dash-sparkline--${tone}" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none"><polyline points="${coords}" fill="none" stroke="${stroke}" stroke-width="2" stroke-linecap="round"/></svg>`;
}

function kpiIconSvg(type) {
  const icons = {
    projects: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M3 21h18"/><path d="M5 21V7l8-4v18"/><path d="M19 21V11l-6-3"/><path d="M9 9v.01"/><path d="M9 12v.01"/><path d="M9 15v.01"/><path d="M9 18v.01"/></svg>`,
    contract: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v10"/><path d="M9.5 9.5c0-1.1 1.12-2 2.5-2s2.5.9 2.5 2-1.12 2-2.5 2-1.38 0-2.5.9-2.5 2s1.12 2 2.5 2 2.5-.9 2.5-2"/></svg>`,
    receivable: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M19 7V6a2 2 0 0 0-2-2H7a2 2 0 0 0-2 2v1"/><path d="M3 7h18v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7z"/><path d="M16 11a4 4 0 0 1-8 0"/></svg>`,
    collection: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3v18h18"/><path d="M7 14l3-3 3 2 5-6"/></svg>`,
    expense: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/><path d="M3 6h18"/><path d="M16 10a4 4 0 0 1-8 0"/></svg>`,
  };
  return icons[type] || icons.projects;
}

function kpiProgressInline(pct) {
  return `<div class="dash-kpi-progress-inline">${progressBar(pct, "dash-kpi-bar")}<span class="dash-kpi-pct">${pct}%</span></div>`;
}

function dashCard(title, subtitle, bodyHtml, extraClass = "") {
  return `<section class="dash-widget card ${extraClass}">
    <div class="dash-widget-head">
      <div><h3 class="dash-widget-title">${escapeHtml(title)}</h3>${subtitle ? `<p class="dash-widget-sub">${escapeHtml(subtitle)}</p>` : ""}</div>
    </div>
    <div class="dash-widget-body">${bodyHtml}</div>
  </section>`;
}

export function renderKpiRow(host, kpis) {
  if (!host) return;
  const expenseTrendUp = kpis.expenseTrend >= 0;
  const expenseTrendClass = kpis.expenseTrend > 0 ? "is-danger" : "is-success";
  const cards = [
    {
      label: "Active Projects",
      value: String(kpis.activeCount),
      icon: "projects",
      iconTone: "blue",
      footLeft: `On Track: ${kpis.onTrack} · Delayed: ${kpis.delayed}`,
      footRight: sparklineSvg([3, 5, 4, 6, 7, kpis.onTrack, kpis.activeCount], "green"),
    },
    {
      label: "Total Contract Value",
      value: formatCompactBDT(kpis.contractValue),
      icon: "contract",
      iconTone: "green",
      footLeft: "All Active Projects",
      footRight: sparklineSvg([5, 6, 7, 7, 8, 8, 9], "green"),
    },
    {
      label: "Total Receivable",
      value: formatCompactBDT(kpis.receivable),
      icon: "receivable",
      iconTone: "purple",
      footLeftHtml:
        kpis.overdue > 0
          ? `Overdue: <span class="is-danger">${escapeHtml(formatCompactBDT(kpis.overdue))}</span>`
          : "No overdue bills",
      footRight: sparklineSvg([8, 7, 6, 7, 6, 5, 4], kpis.overdue > 0 ? "red" : "green"),
    },
    {
      label: "This Month Collection",
      value: formatCompactBDT(kpis.monthCollected),
      icon: "collection",
      iconTone: "blue",
      footLeft: `Target: ${formatCompactBDT(kpis.monthTarget)}`,
      footRight: kpiProgressInline(kpis.collectionPct),
    },
    {
      label: "This Month Expense",
      value: formatCompactBDT(kpis.monthExpense),
      icon: "expense",
      iconTone: "orange",
      footLeft: "vs Last Month",
      footRight: `<span class="dash-kpi-trend ${expenseTrendClass}">${expenseTrendUp ? "↑" : "↓"} ${Math.abs(kpis.expenseTrend)}%</span>`,
    },
  ];

  host.innerHTML = cards
    .map(
      (c) => `
    <div class="dash-kpi-card card">
      <div class="dash-kpi-head">
        <div class="dash-kpi-icon dash-kpi-icon--${c.iconTone}">${kpiIconSvg(c.icon)}</div>
        <div class="dash-kpi-main">
          <span class="dash-kpi-label">${escapeHtml(c.label)}</span>
          <div class="dash-kpi-value">${escapeHtml(c.value)}</div>
        </div>
      </div>
      <div class="dash-kpi-foot">
        <div class="dash-kpi-foot-left">${c.footLeftHtml || escapeHtml(c.footLeft)}</div>
        <div class="dash-kpi-foot-right">${c.footRight}</div>
      </div>
    </div>`
    )
    .join("");
}

function dashHealthPill(healthKey) {
  const labels = {
    on_track: "On Track",
    delayed: "Delayed",
    at_risk: "At Risk",
  };
  const key = String(healthKey || "on_track").toLowerCase();
  const label = labels[key] || key;
  return `<span class="dash-health-pill dash-health-pill--${key}"><i class="dash-health-dot" aria-hidden="true"></i>${escapeHtml(label)}</span>`;
}

function perfProgressClass(health) {
  if (health === "delayed") return "progress-delayed";
  if (health === "at_risk") return "progress-at-risk";
  return "progress-on-track";
}

export function renderProjectPerformanceTable(host, rows = []) {
  if (!host) return;
  const body = rows.length
    ? `<div class="table-wrap"><table class="dash-table dash-perf-table">
      <thead><tr>
        <th>Project</th><th>Progress</th><th class="text-right">Budget</th><th class="text-right">Spent</th>
        <th class="text-right">Remaining</th><th>Deadline</th><th>Health</th>
      </tr></thead>
      <tbody>${rows
        .map(
          (r) => `<tr>
          <td class="dash-perf-project">
            <span class="dash-perf-chevron" aria-hidden="true">›</span>
            <div>
              <strong>${escapeHtml(r.name)}</strong>
              <small>${escapeHtml(r.category || "Commercial")}</small>
            </div>
          </td>
          <td class="dash-perf-progress"><strong class="dash-perf-pct">${r.progress}%</strong>${progressBar(r.progress, perfProgressClass(r.health))}</td>
          <td class="text-right">${escapeHtml(formatCompactBDT(r.budget))}</td>
          <td class="text-right">${escapeHtml(formatCompactBDT(r.spent))}</td>
          <td class="text-right">${escapeHtml(formatCompactBDT(r.remaining))}</td>
          <td>${escapeHtml(r.deadlineLabel || r.deadline)}</td>
          <td>${dashHealthPill(r.health)}</td>
        </tr>`
        )
        .join("")}</tbody></table></div>`
    : `<p class="proj-empty">No active projects</p>`;
  host.innerHTML = `<section class="dash-widget dash-widget--wide dash-widget--perf card">
    <div class="dash-widget-head dash-widget-head--split">
      <h3 class="dash-widget-title">Project Performance Overview</h3>
      <a href="#/projects" class="dash-link dash-perf-view-all">View All Projects →</a>
    </div>
    <div class="dash-widget-body">${body}</div>
  </section>`;
}

function attentionIconSvg(type) {
  const icons = {
    warning: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 9v4"/><path d="M12 17h.01"/><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/></svg>`,
    payment: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v10"/><path d="M9.5 9.5c0-1.1 1.12-2 2.5-2s2.5.9 2.5 2-1.12 2-2.5 2-1.38 0-2.5.9-2.5 2s1.12 2 2.5 2 2.5-.9 2.5-2"/></svg>`,
    approval: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3 4 7v6c0 5 3.5 8.5 8 9 4.5-.5 8-4 8-9V7l-8-4z"/><path d="m9 12 2 2 4-4"/></svg>`,
    materials: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><path d="M3.3 7 12 12l8.7-5"/><path d="M12 22V12"/></svg>`,
    maintenance: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></svg>`,
    delivery: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M14 18V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v11a1 1 0 0 0 1 1h2"/><path d="M15 18H9"/><path d="M19 18h2a1 1 0 0 0 1-1v-3.65a1 1 0 0 0-.22-.624l-3.48-4.35A1 1 0 0 0 17.52 8H14"/><circle cx="17" cy="18" r="2"/><circle cx="7" cy="18" r="2"/></svg>`,
  };
  return icons[type] || icons.warning;
}

export function renderAttentionPanel(host, items = []) {
  if (!host) return;
  const body = items.length
    ? `<ul class="dash-attention-list">${items
        .map(
          (it) => `<li class="dash-attention-item">
          <div class="dash-attention-icon dash-attention-icon--${escapeHtml(it.icon || "warning")}">${attentionIconSvg(it.icon)}</div>
          <span class="dash-attention-title">${escapeHtml(it.title)}</span>
          <a href="${escapeHtml(it.link || "#/dashboard")}" class="dash-link dash-attention-action">${escapeHtml(it.action || "View")}</a>
        </li>`
        )
        .join("")}</ul>`
    : `<p class="proj-empty">All clear — no urgent items</p>`;
  host.innerHTML = `<section class="dash-widget dash-widget--attention card">
    <div class="dash-widget-head dash-widget-head--split">
      <h3 class="dash-widget-title">Attention Required</h3>
      <a href="#/approvals" class="dash-link dash-attention-view-all">View All →</a>
    </div>
    <div class="dash-widget-body">${body}</div>
  </section>`;
}

function cashFlowChartSvg(data) {
  const {
    labels = [],
    clientCollection = [],
    projectExpense = [],
    purchaseExpense = [],
    salaryWages = [],
    net = [],
    yMaxLac = 5,
  } = data;
  const n = Math.max(labels.length, 1);
  const plotL = 14;
  const plotR = 100;
  const plotT = 8;
  const plotB = 78;
  const plotW = plotR - plotL;
  const plotH = plotB - plotT;
  const yMax = yMaxLac * 100000;
  const yPos = (v) => plotB - (v / yMax) * plotH;
  const tickStep = yMaxLac <= 5 ? yMaxLac : 5;
  const ticks = [];
  for (let t = 0; t <= yMaxLac; t += tickStep) ticks.push(t);

  const gridH = ticks
    .map((t) => {
      const y = yPos(t * 100000);
      return `<line x1="${plotL}" y1="${y}" x2="${plotR}" y2="${y}" class="dash-cf-grid"/>`;
    })
    .join("");

  const yLabels = ticks
    .map((t) => {
      const y = yPos(t * 100000);
      const label = t === 0 ? "0" : `${t}L`;
      return `<text x="${plotL - 1}" y="${y + 0.8}" class="dash-cf-axis-label" text-anchor="end">${label}</text>`;
    })
    .join("");

  const gridV = labels
    .map((_, i) => {
      const x = plotL + ((i + 0.5) / n) * plotW;
      return `<line x1="${x}" y1="${plotT}" x2="${x}" y2="${plotB}" class="dash-cf-grid"/>`;
    })
    .join("");

  const series = [
    { values: clientCollection, cls: "dash-bar-collection" },
    { values: projectExpense, cls: "dash-bar-project" },
    { values: purchaseExpense, cls: "dash-bar-purchase" },
    { values: salaryWages, cls: "dash-bar-salary" },
  ];
  const groupW = plotW / n;
  const barW = (groupW * 0.72) / 4;
  const bars = labels
    .map((_, i) => {
      const groupX = plotL + i * groupW;
      return series
        .map((s, j) => {
          const v = s.values[i] || 0;
          const h = Math.max(0, plotB - yPos(v));
          const x = groupX + groupW * 0.14 + j * (barW + 0.15);
          const y = yPos(v);
          return `<rect x="${x}" y="${y}" width="${barW}" height="${h}" class="${s.cls}"/>`;
        })
        .join("");
    })
    .join("");

  const netLine = net
    .map((v, i) => {
      const x = plotL + ((i + 0.5) / n) * plotW;
      const y = yPos(v);
      return `${x},${y}`;
    })
    .join(" ");

  const netDiamonds = net
    .map((v, i) => {
      const x = plotL + ((i + 0.5) / n) * plotW;
      const y = yPos(v);
      const s = 0.9;
      return `<polygon points="${x},${y - s} ${x + s},${y} ${x},${y + s} ${x - s},${y}" class="dash-cf-net-marker"/>`;
    })
    .join("");

  const xLabels = labels
    .map((label, i) => {
      const x = plotL + ((i + 0.5) / n) * plotW;
      return `<text x="${x}" y="${plotB + 4}" class="dash-cf-axis-label" text-anchor="middle">${escapeHtml(label)}</text>`;
    })
    .join("");

  return `<svg class="dash-cashflow-chart" viewBox="0 0 100 88" preserveAspectRatio="none">${gridH}${gridV}${yLabels}${bars}<polyline class="dash-cf-net-line" points="${netLine}" fill="none"/>${netDiamonds}${xLabels}</svg>`;
}

function cashFlowWidgetShell(bodyHtml) {
  return `<section class="dash-widget dash-widget--cashflow card">
    <div class="dash-widget-head dash-widget-head--split">
      <h3 class="dash-widget-title">Cash Flow Overview</h3>
      <select class="dash-cashflow-period" aria-label="Cash flow period">
        <option value="month">This Month</option>
        <option value="week">This Week</option>
      </select>
    </div>
    <div class="dash-widget-body">${bodyHtml}</div>
  </section>`;
}

export function renderCashFlowComboChart(host, cashFlow, opts = {}) {
  if (!host) return;
  const period = opts.period || "month";
  const emptyBody = `<p class="proj-empty">No cash flow data yet</p>`;
  if (!cashFlow?.labels?.length) {
    host.innerHTML = cashFlowWidgetShell(emptyBody);
    return;
  }

  const legend = `<div class="dash-cashflow-legend">
    <span><i class="dash-legend-swatch dash-legend-swatch--green"></i> Client Collection</span>
    <span><i class="dash-legend-swatch dash-legend-swatch--red"></i> Project Expense</span>
    <span><i class="dash-legend-swatch dash-legend-swatch--orange"></i> Purchase Expense</span>
    <span><i class="dash-legend-swatch dash-legend-swatch--purple"></i> Salary / Wages</span>
    <span><i class="dash-legend-diamond"></i> Net Cash Flow</span>
  </div>`;

  host.innerHTML = cashFlowWidgetShell(`${legend}${cashFlowChartSvg(cashFlow)}`);

  const select = host.querySelector(".dash-cashflow-period");
  if (select) {
    select.value = period;
    select.onchange = () => {
      if (typeof opts.onPeriodChange === "function") opts.onPeriodChange(select.value);
    };
  }
}

export function renderBudgetDonut(host, summary) {
  if (!host) return;
  const total = Math.max(summary.budget, 1);
  const spentPct = (summary.spent / total) * 100;
  const committedPct = (summary.committed / total) * 100;
  const remainingPct = Math.max(0, 100 - spentPct - committedPct);
  const usedPct = summary.budget > 0 ? Math.round((summary.spent / summary.budget) * 100) : 0;
  const r = 16;
  const c = 2 * Math.PI * r;
  const s1 = (spentPct / 100) * c;
  const s2 = (committedPct / 100) * c;
  const s3 = (remainingPct / 100) * c;
  const legendRows = [
    { dot: "dot-blue", label: "Total Budget", value: formatCompactBDT(summary.budget) },
    { dot: "dot-green", label: "Total Spent", value: formatCompactBDT(summary.spent) },
    { dot: "dot-orange", label: "Committed Cost", value: formatCompactBDT(summary.committed) },
    { dot: "dot-grey", label: "Remaining", value: formatCompactBDT(summary.remaining) },
  ];
  host.innerHTML = `<section class="dash-widget dash-widget--budget card">
    <div class="dash-widget-head">
      <h3 class="dash-widget-title">Budget vs Actual Cost</h3>
    </div>
    <div class="dash-widget-body">
      <div class="dash-budget-layout">
        <div class="dash-donut-wrap dash-donut-wrap--budget">
          <svg viewBox="0 0 40 40" class="dash-donut dash-donut--budget">
            <circle cx="20" cy="20" r="${r}" fill="none" stroke="#e5e7eb" stroke-width="6"/>
            <circle cx="20" cy="20" r="${r}" fill="none" stroke="#10b981" stroke-width="6" stroke-dasharray="${s1} ${c}" stroke-dashoffset="0" transform="rotate(-90 20 20)"/>
            <circle cx="20" cy="20" r="${r}" fill="none" stroke="#f59e0b" stroke-width="6" stroke-dasharray="${s2} ${c}" stroke-dashoffset="${-s1}" transform="rotate(-90 20 20)"/>
            <circle cx="20" cy="20" r="${r}" fill="none" stroke="#d1d5db" stroke-width="6" stroke-dasharray="${s3} ${c}" stroke-dashoffset="${-(s1 + s2)}" transform="rotate(-90 20 20)"/>
          </svg>
          <div class="dash-donut-center dash-donut-center--budget">
            <strong>${usedPct}%</strong>
            <small>Used</small>
          </div>
        </div>
        <ul class="dash-budget-legend">${legendRows
          .map(
            (row) => `<li>
            <span class="dash-budget-legend-label"><i class="dot ${row.dot}"></i> ${escapeHtml(row.label)}</span>
            <span class="dash-budget-legend-value">${escapeHtml(row.value)}</span>
          </li>`
          )
          .join("")}</ul>
      </div>
    </div>
  </section>`;
}

function approvalIconSvg(type) {
  const icons = {
    requisition: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3 4 7v6c0 5 3.5 8.5 8 9 4.5-.5 8-4 8-9V7l-8-4z"/></svg>`,
    order: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><path d="M9 13h6"/><path d="M9 17h4"/></svg>`,
    material: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/></svg>`,
    expense: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><rect x="8" y="2" width="8" height="4" rx="1"/><path d="M9 14h6"/><path d="M9 18h4"/></svg>`,
    billing: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>`,
  };
  return icons[type] || icons.requisition;
}

const APPROVAL_ICON_TONES = {
  requisition: "green",
  order: "blue",
  material: "orange",
  expense: "red",
  billing: "purple",
};

export function renderPendingApprovals(host, groups = []) {
  if (!host) return;
  const body = groups.length
    ? `<ul class="dash-approval-list">${groups
        .map((g) => {
          const tone = APPROVAL_ICON_TONES[g.icon] || "blue";
          return `<li class="dash-approval-item">
          <div class="dash-approval-icon dash-approval-icon--${tone}">${approvalIconSvg(g.icon)}</div>
          <span class="dash-approval-label">${escapeHtml(g.label)}</span>
          <span class="dash-approval-count">${g.count}</span>
          <a href="#/approvals" class="dash-approval-btn">Review</a>
        </li>`;
        })
        .join("")}</ul>`
    : `<p class="proj-empty">No pending approvals</p>`;
  host.innerHTML = `<section class="dash-widget dash-widget--approvals card">
    <div class="dash-widget-head dash-widget-head--split">
      <h3 class="dash-widget-title">Pending Approvals</h3>
      <a href="#/approvals" class="dash-link dash-approval-view-all">View All →</a>
    </div>
    <div class="dash-widget-body">${body}</div>
  </section>`;
}

function siteKpiItem(label, value) {
  return `<div class="dash-site-kpi"><span>${escapeHtml(label)}</span><strong>${escapeHtml(String(value))}</strong></div>`;
}

export function renderSiteActivity(host, data) {
  if (!host) return;
  const { stats, rows } = data;
  const tableBody = rows.length
    ? rows
        .map(
          (r) => `<tr>
        <td class="dash-site-name">${escapeHtml(r.site)}</td>
        <td class="text-center">${r.totalWorkers}</td>
        <td class="text-center">${r.present}</td>
        <td class="text-center">${r.absent}</td>
        <td class="text-center">${dashHealthPill(r.health)}</td>
      </tr>`
        )
        .join("")
    : `<tr class="empty-row"><td colspan="5">No active sites</td></tr>`;

  host.innerHTML = `<section class="dash-widget dash-widget--site card">
    <div class="dash-widget-head">
      <h3 class="dash-widget-title">Today's Site Activity</h3>
    </div>
    <div class="dash-widget-body">
      <div class="dash-site-kpi-strip">
        ${siteKpiItem("Workers Present", stats.workersPresent)}
        ${siteKpiItem("Active Sites", `${stats.activeSites} / ${stats.totalSites}`)}
        ${siteKpiItem("Site Diaries", `${stats.siteDiaries} / ${stats.totalSites}`)}
        ${siteKpiItem("Site In-Charge", stats.siteInCharge)}
        ${siteKpiItem("Safety Issues", stats.safetyIssues)}
        ${siteKpiItem("Work Delays", stats.workDelays)}
      </div>
      <h4 class="dash-site-subtitle">Site-wise Attendance</h4>
      <div class="table-wrap"><table class="dash-table dash-site-att-table">
        <thead><tr>
          <th>Site</th>
          <th class="text-center">Total Workers</th>
          <th class="text-center">Present</th>
          <th class="text-center">Absent</th>
          <th class="text-center">Status</th>
        </tr></thead>
        <tbody>${tableBody}</tbody>
      </table></div>
    </div>
  </section>`;
}

function procIconSvg(type) {
  const icons = {
    cement: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M6 2h12v4H6z"/><path d="M6 6v16l6-3 6 3V6"/></svg>`,
    rod: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M4 18h16"/><path d="M6 14h12"/><path d="M8 10h8"/><path d="M10 6h4"/></svg>`,
    sand: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20c2-4 4-6 8-6s6 2 8 6"/><path d="M8 14c1-2 2.5-3 4-3s3 1 4 3"/></svg>`,
    material: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/></svg>`,
    po: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><circle cx="12" cy="14" r="3"/><path d="M12 12v1"/></svg>`,
    delivery: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M14 18V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v11a1 1 0 0 0 1 1h2"/><path d="M15 18H9"/><path d="M19 18h2a1 1 0 0 0 1-1v-3.65a1 1 0 0 0-.22-.624l-3.48-4.35A1 1 0 0 0 17.52 8H14"/><circle cx="17" cy="18" r="2"/><circle cx="7" cy="18" r="2"/></svg>`,
    request: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><path d="M9 13h6"/><path d="M9 17h4"/></svg>`,
  };
  return icons[type] || icons.material;
}

export function renderProcurementAlerts(host, alerts = []) {
  if (!host) return;
  const body = alerts.length
    ? `<ul class="dash-proc-list">${alerts
        .map(
          (a) => `<li class="dash-proc-item">
          <div class="dash-proc-icon dash-proc-icon--${escapeHtml(a.iconTone || "green")}">${procIconSvg(a.icon)}</div>
          <span class="dash-proc-title">${escapeHtml(a.title)}</span>
          <span class="dash-proc-pill dash-proc-pill--${escapeHtml(a.tagTone || "low-stock")}">${escapeHtml(a.tag)}</span>
        </li>`
        )
        .join("")}</ul>`
    : `<p class="proj-empty">No procurement alerts</p>`;
  host.innerHTML = `<section class="dash-widget dash-widget--procurement card">
    <div class="dash-widget-head dash-widget-head--split">
      <h3 class="dash-widget-title">Procurement &amp; Material Alerts</h3>
      <a href="#/purchases" class="dash-link dash-proc-view-all">View All →</a>
    </div>
    <div class="dash-widget-body">${body}</div>
  </section>`;
}

export function renderBillingPanel(host, data) {
  if (!host) return;
  const total = Math.max(data.receivable, 1);
  const currentPct = (data.current / total) * 100;
  const duePct = (data.due / total) * 100;
  const overduePct = (data.overdue / total) * 100;
  const r = 16;
  const c = 2 * Math.PI * r;
  const s1 = (currentPct / 100) * c;
  const s2 = (duePct / 100) * c;
  const s3 = (overduePct / 100) * c;
  const legendRows = [
    { dot: "dot-green", label: "Current", value: formatCompactBDT(data.current) },
    { dot: "dot-orange", label: "Due", value: formatCompactBDT(data.due) },
    { dot: "dot-red", label: "Overdue", value: formatCompactBDT(data.overdue) },
  ];
  const tableBody = data.upcoming.length
    ? data.upcoming
        .map(
          (u) => `<tr>
        <td>${escapeHtml(u.client)}</td>
        <td>${escapeHtml(u.project)}</td>
        <td class="text-right">${escapeHtml(formatCompactBDT(u.amount))}</td>
        <td class="text-right">${escapeHtml(u.dueDateLabel || formatDashboardDeadline(u.dueDate))}</td>
      </tr>`
        )
        .join("")
    : `<tr class="empty-row"><td colspan="4">No upcoming collections</td></tr>`;

  host.innerHTML = `<section class="dash-widget dash-widget--billing card">
    <div class="dash-widget-head dash-widget-head--split">
      <h3 class="dash-widget-title">Billing &amp; Receivables</h3>
      <a href="#/billing" class="dash-link dash-billing-view-all">View All →</a>
    </div>
    <div class="dash-widget-body">
      <div class="dash-billing-layout">
        <div class="dash-donut-wrap dash-donut-wrap--billing">
          <svg viewBox="0 0 40 40" class="dash-donut dash-donut--billing">
            <circle cx="20" cy="20" r="${r}" fill="none" stroke="#e5e7eb" stroke-width="6"/>
            <circle cx="20" cy="20" r="${r}" fill="none" stroke="#10b981" stroke-width="6" stroke-dasharray="${s1} ${c}" stroke-dashoffset="0" transform="rotate(-90 20 20)"/>
            <circle cx="20" cy="20" r="${r}" fill="none" stroke="#f59e0b" stroke-width="6" stroke-dasharray="${s2} ${c}" stroke-dashoffset="${-s1}" transform="rotate(-90 20 20)"/>
            <circle cx="20" cy="20" r="${r}" fill="none" stroke="#ef4444" stroke-width="6" stroke-dasharray="${s3} ${c}" stroke-dashoffset="${-(s1 + s2)}" transform="rotate(-90 20 20)"/>
          </svg>
          <div class="dash-donut-center dash-donut-center--billing">
            <small>Total Receivable</small>
            <strong>${escapeHtml(formatCompactBDT(data.receivable))}</strong>
          </div>
        </div>
        <ul class="dash-billing-legend">${legendRows
          .map(
            (row) => `<li>
            <span class="dash-billing-legend-label"><i class="dot ${row.dot}"></i> ${escapeHtml(row.label)}</span>
            <span class="dash-billing-legend-value">${escapeHtml(row.value)}</span>
          </li>`
          )
          .join("")}</ul>
      </div>
      <h4 class="dash-billing-subtitle">Upcoming Collections</h4>
      <div class="table-wrap"><table class="dash-table dash-billing-table">
        <thead><tr>
          <th>Client</th>
          <th>Project</th>
          <th class="text-right">Amount</th>
          <th class="text-right">Due Date</th>
        </tr></thead>
        <tbody>${tableBody}</tbody>
      </table></div>
    </div>
  </section>`;
}

function milestoneIconSvg(type) {
  const icons = {
    home: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9.5 12 3l9 6.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1V9.5z"/></svg>`,
    building: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M6 22V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18"/><path d="M6 12H4a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h2"/><path d="M18 9h2a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-2"/><path d="M10 6h.01"/><path d="M10 10h.01"/><path d="M10 14h.01"/><path d="M10 18h.01"/></svg>`,
    tower: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3 8 7v14h8V7l-4-4z"/><path d="M8 11h8"/><path d="M8 15h8"/><path d="M8 19h8"/></svg>`,
    gear: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/></svg>`,
    bag: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/><path d="M3 6h18"/><path d="M16 10a4 4 0 0 1-8 0"/></svg>`,
  };
  return icons[type] || icons.building;
}

const MILESTONE_STATUS_LABELS = { on_track: "On Track", at_risk: "At Risk" };

export function renderMilestonesStrip(host, items = []) {
  if (!host) return;
  const cards = items.length
    ? items
        .map(
          (m) => `<article class="dash-milestone-card">
        <div class="dash-milestone-icon dash-milestone-icon--${escapeHtml(m.iconTone || "green")}">${milestoneIconSvg(m.icon)}</div>
        <div class="dash-milestone-body">
          <div class="dash-milestone-top">
            <strong class="dash-milestone-project">${escapeHtml(m.projectName)}</strong>
            <time>${escapeHtml(m.dateLabel || m.date)}</time>
          </div>
          <p class="dash-milestone-title">${escapeHtml(m.title)}</p>
          <span class="dash-milestone-status dash-milestone-status--${escapeHtml(m.health || "on_track")}">${escapeHtml(MILESTONE_STATUS_LABELS[m.health] || "On Track")}</span>
        </div>
      </article>`
        )
        .join("")
    : `<p class="proj-empty dash-milestones-empty">No milestones in the next 7 days</p>`;
  host.innerHTML = `<section class="dash-widget dash-widget--milestones card">
    <div class="dash-widget-head dash-widget-head--split">
      <h3 class="dash-widget-title">Upcoming Project Milestones (Next 7 Days)</h3>
      <a href="#/projects" class="dash-link dash-milestones-view-all">View All →</a>
    </div>
    <div class="dash-milestones-scroll">${cards}</div>
  </section>`;
}
