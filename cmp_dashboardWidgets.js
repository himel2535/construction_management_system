import { progressBar } from "./cmp_ui.js";
import { formatCompactBDT, formatCompactBDTSign, formatDashboardDeadline } from "./util_dashboard.js";
import { kpiIcon, attentionIcon, approvalIcon, procIcon, milestoneIcon } from "./cmp_dashboardIcons.js";

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
  const strokes = {
    yellow: "#CA8A04",
    green: "#047857",
    red: "#B91C1C",
    blue: "#2563eb",
    purple: "#7c3aed",
    orange: "#d97706",
  };
  const stroke = strokes[tone] || strokes.green;
  return `<svg class="dash-sparkline dash-sparkline--${tone}" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none"><polyline points="${coords}" fill="none" stroke="${stroke}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
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
      footRight: sparklineSvg([3, 5, 4, 6, 7, kpis.onTrack, kpis.activeCount], "yellow"),
    },
    {
      label: "Total Contract Value",
      value: formatCompactBDT(kpis.contractValue),
      icon: "contract",
      iconTone: "green",
      footLeft: "All Active Projects",
      footRight: sparklineSvg([5, 6, 7, 7, 8, 8, 9], "red"),
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
      footRight: sparklineSvg([8, 7, 6, 7, 6, 5, 4], "green"),
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
        <div class="dash-kpi-icon dash-kpi-icon--${c.iconTone}">${kpiIcon(c.icon)}</div>
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
        <th>Project</th><th>Progress</th><th>Budget</th><th>Spent</th>
        <th>Remaining</th><th>Deadline</th><th>Health</th>
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
          <td>${escapeHtml(formatCompactBDT(r.budget))}</td>
          <td>${escapeHtml(formatCompactBDT(r.spent))}</td>
          <td>${escapeHtml(formatCompactBDT(r.remaining))}</td>
          <td>${escapeHtml(r.deadlineLabel || r.deadline)}</td>
          <td>${dashHealthPill(r.health)}</td>
        </tr>`
        )
        .join("")}</tbody></table></div>`
    : `<p class="proj-empty">No active projects</p>`;
  host.innerHTML = `<section class="dash-widget dash-widget--wide dash-widget--perf card">
    <div class="dash-widget-head dash-widget-head--split">
      <h3 class="dash-widget-title">Project Performance Overview</h3>
      <a href="/projects" class="dash-link dash-perf-view-all">View All Projects →</a>
    </div>
    <div class="dash-widget-body">${body}</div>
  </section>`;
}

export function renderAttentionPanel(host, items = []) {
  if (!host) return;
  const body = items.length
    ? `<ul class="dash-attention-list">${items
        .map(
          (it) => `<li class="dash-attention-item">
          <div class="dash-attention-icon dash-attention-icon--${escapeHtml(it.icon || "warning")}">${attentionIcon(it.icon)}</div>
          <span class="dash-attention-title">${escapeHtml(it.title)}</span>
          <a href="${escapeHtml(it.link || "/dashboard")}" class="dash-link dash-attention-action">${escapeHtml(it.action || "View")}</a>
        </li>`
        )
        .join("")}</ul>`
    : `<p class="proj-empty">All clear — no urgent items</p>`;
  host.innerHTML = `<section class="dash-widget dash-widget--attention card">
    <div class="dash-widget-head dash-widget-head--split">
      <h3 class="dash-widget-title">Attention Required</h3>
      <a href="/approvals" class="dash-link dash-attention-view-all">View All →</a>
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
            <circle cx="20" cy="20" r="${r}" fill="none" stroke="#d1d5db" stroke-width="6"/>
            <circle cx="20" cy="20" r="${r}" fill="none" stroke="#059669" stroke-width="6" stroke-dasharray="${s1} ${c}" stroke-dashoffset="0" transform="rotate(-90 20 20)"/>
            <circle cx="20" cy="20" r="${r}" fill="none" stroke="#d97706" stroke-width="6" stroke-dasharray="${s2} ${c}" stroke-dashoffset="${-s1}" transform="rotate(-90 20 20)"/>
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
          <div class="dash-approval-icon dash-approval-icon--${tone}">${approvalIcon(g.icon)}</div>
          <span class="dash-approval-label">${escapeHtml(g.label)}</span>
          <span class="dash-approval-count">${g.count}</span>
          <a href="/approvals" class="dash-approval-btn">Review</a>
        </li>`;
        })
        .join("")}</ul>`
    : `<p class="proj-empty">No pending approvals</p>`;
  host.innerHTML = `<section class="dash-widget dash-widget--approvals card">
    <div class="dash-widget-head dash-widget-head--split">
      <h3 class="dash-widget-title">Pending Approvals</h3>
      <a href="/approvals" class="dash-link dash-approval-view-all">View All →</a>
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
        <td>${r.totalWorkers}</td>
        <td>${r.present}</td>
        <td>${r.absent}</td>
        <td>${dashHealthPill(r.health)}</td>
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
      <div class="dash-site-att-head">
        <h4 class="dash-site-subtitle">Site-wise Attendance</h4>
        <a href="/site-incharge" class="dash-link dash-site-view-all">View All →</a>
      </div>
      <div class="table-wrap"><table class="dash-table dash-site-att-table">
        <thead><tr>
          <th>Site</th>
          <th>Total Workers</th>
          <th>Present</th>
          <th>Absent</th>
          <th>Status</th>
        </tr></thead>
        <tbody>${tableBody}</tbody>
      </table></div>
    </div>
  </section>`;
}

export function renderProcurementAlerts(host, alerts = []) {
  if (!host) return;
  const body = alerts.length
    ? `<ul class="dash-proc-list">${alerts
        .map(
          (a) => `<li class="dash-proc-item">
          <div class="dash-proc-icon dash-proc-icon--${escapeHtml(a.iconTone || "green")}">${procIcon(a.icon)}</div>
          <span class="dash-proc-title">${escapeHtml(a.title)}</span>
          <span class="dash-proc-pill dash-proc-pill--${escapeHtml(a.tagTone || "low-stock")}">${escapeHtml(a.tag)}</span>
        </li>`
        )
        .join("")}</ul>`
    : `<p class="proj-empty">No procurement alerts</p>`;
  host.innerHTML = `<section class="dash-widget dash-widget--procurement card">
    <div class="dash-widget-head dash-widget-head--split">
      <h3 class="dash-widget-title">Procurement &amp; Material Alerts</h3>
      <a href="/purchases" class="dash-link dash-proc-view-all">View All →</a>
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
        <td>${escapeHtml(formatCompactBDT(u.amount))}</td>
        <td>${escapeHtml(u.dueDateLabel || formatDashboardDeadline(u.dueDate))}</td>
      </tr>`
        )
        .join("")
    : `<tr class="empty-row"><td colspan="4">No upcoming collections</td></tr>`;

  host.innerHTML = `<section class="dash-widget dash-widget--billing card">
    <div class="dash-widget-head dash-widget-head--split">
      <h3 class="dash-widget-title">Billing &amp; Receivables</h3>
      <a href="/billing" class="dash-link dash-billing-view-all">View All →</a>
    </div>
    <div class="dash-widget-body">
      <div class="dash-billing-layout">
        <div class="dash-donut-wrap dash-donut-wrap--billing">
          <svg viewBox="0 0 40 40" class="dash-donut dash-donut--billing">
            <circle cx="20" cy="20" r="${r}" fill="none" stroke="#d1d5db" stroke-width="6"/>
            <circle cx="20" cy="20" r="${r}" fill="none" stroke="#059669" stroke-width="6" stroke-dasharray="${s1} ${c}" stroke-dashoffset="0" transform="rotate(-90 20 20)"/>
            <circle cx="20" cy="20" r="${r}" fill="none" stroke="#d97706" stroke-width="6" stroke-dasharray="${s2} ${c}" stroke-dashoffset="${-s1}" transform="rotate(-90 20 20)"/>
            <circle cx="20" cy="20" r="${r}" fill="none" stroke="#dc2626" stroke-width="6" stroke-dasharray="${s3} ${c}" stroke-dashoffset="${-(s1 + s2)}" transform="rotate(-90 20 20)"/>
          </svg>
          <div class="dash-donut-center dash-donut-center--billing">
            <strong>${escapeHtml(formatCompactBDTSign(data.receivable))}</strong>
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
          <th>Amount</th>
          <th>Due Date</th>
        </tr></thead>
        <tbody>${tableBody}</tbody>
      </table></div>
    </div>
  </section>`;
}

const MILESTONE_STATUS_LABELS = { on_track: "On Track", at_risk: "At Risk" };

export function renderMilestonesStrip(host, items = []) {
  if (!host) return;
  const cards = items.length
    ? items
        .map(
          (m) => `<article class="dash-milestone-card">
        <div class="dash-milestone-icon dash-milestone-icon--${escapeHtml(m.iconTone || "green")}">${milestoneIcon(m.icon)}</div>
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
      <a href="/projects" class="dash-link dash-milestones-view-all">View All →</a>
    </div>
    <div class="dash-milestones-scroll">${cards}</div>
  </section>`;
}
