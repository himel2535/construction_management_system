/** Shared Reports hub + detail table renderers */

import { formatBDT, formatBDTNumber } from "./util_format.js";
import { statusChip } from "./cmp_ui.js";
import { paymentModeLabel } from "./util_payroll.js";
import { formatCompactBDTPlain } from "./util_dashboard.js";
import { reportKpiIcon, reportWidgetIcon } from "./cmp_dashboardIcons.js";

export const REPORT_TABLE_PREVIEW = 5;

export const REPORT_VIEW_ALL = {
  projectCost: "/reports/project-cost",
  analytics: "/reports/analytics",
  workerPayroll: "/reports/worker-payroll",
};

function escapeHtml(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function sliceRows(rows, limit) {
  const list = rows || [];
  if (limit == null || limit <= 0) return { shown: list, total: list.length };
  return { shown: list.slice(0, limit), total: list.length };
}

export function renderReportWidgetFoot({ shown, total, href, label = "View all →", showViewAllLink = true }) {
  if (!total || total <= shown) return "";
  return `
    <div class="reports-widget-foot">
      <span class="reports-widget-foot-meta">Showing ${shown} of ${total}</span>
      ${showViewAllLink && href ? `<a class="reports-view-all" href="${escapeHtml(href)}">${escapeHtml(label)}</a>` : ""}
    </div>`;
}

function reportSparklineSvg(values = [], tone = "green") {
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

function scaleSparkFromAmount(amount, fallback = 4) {
  const n = Number(amount) || 0;
  if (n <= 0) return [2, 2, 3, 3, 2, 3, 2];
  const base = Math.min(8, Math.max(2, Math.round(Math.log10(n + 1) * 2)));
  return [base - 1, base, base, base + 1, base, base + 1, base].map((v) => Math.max(1, v));
}

function renderReportMoneyCell(amount) {
  return `<span class="rep-money-num">${escapeHtml(formatBDTNumber(amount))}</span>`;
}

function renderReportMoneyValue(amount, { compact = false } = {}) {
  return compact ? formatCompactBDTPlain(amount) : formatBDTNumber(amount);
}

/**
 * Shared dash KPI card (Reports + Project hub).
 * @param {{ label: string, value?: string, icon?: string, footLeft?: string, extraClass?: string, spark?: string, tab?: string }} c
 */
export function renderDashKpiCard(c) {
  const clickable = Boolean(c.tab);
  const tag = clickable ? "button" : "div";
  const attrs = clickable
    ? ` type="button" data-kpi-tab="${escapeHtml(c.tab)}" class="dash-kpi-card card cust-kpi-card dash-kpi-card--link ${c.extraClass || ""}"`
    : ` class="dash-kpi-card card cust-kpi-card ${c.extraClass || ""}"`;
  return `<${tag}${attrs}>
      <div class="cust-kpi-spark">${c.spark || ""}</div>
      <div class="dash-kpi-head">
        <div class="dash-kpi-icon dash-kpi-icon--flat">${reportKpiIcon(c.icon)}</div>
        <div class="dash-kpi-main">
          <span class="dash-kpi-label">${escapeHtml(c.label)}</span>
          <div class="dash-kpi-value">${escapeHtml(c.value ?? "")}</div>
        </div>
      </div>
      <div class="dash-kpi-foot">
        <div class="dash-kpi-foot-left">${escapeHtml(c.footLeft || "")}</div>
      </div>
    </${tag}>`;
}

/** @param {Array<object>} cards */
export function renderDashKpiRow(cards) {
  return (cards || []).map(renderDashKpiCard).join("");
}

export function buildDashSparkline(values, tone = "green") {
  return reportSparklineSvg(values, tone);
}

export function buildDashSparkFromAmount(amount) {
  return scaleSparkFromAmount(amount);
}

export function buildDashSparkFromCount(n) {
  return countSpark(n);
}

/** @param {{ totalBilled: number, clientReceivable: number, subcontractOutstanding: number, monthExpense: number }} stats */
export function renderReportsKpiRow(stats) {
  const { totalBilled = 0, clientReceivable = 0, subcontractOutstanding = 0, monthExpense = 0 } = stats || {};
  const cards = [
    {
      label: "Total billed",
      value: renderReportMoneyValue(totalBilled, { compact: true }),
      icon: "billed",
      tone: "blue",
      extraClass: "",
      footLeft: totalBilled ? "All non-cancelled invoices" : "No billing yet",
      spark: reportSparklineSvg(scaleSparkFromAmount(totalBilled), "blue"),
    },
    {
      label: "Client receivable",
      value: renderReportMoneyValue(clientReceivable, { compact: true }),
      icon: "receivable",
      tone: "green",
      footLeft: clientReceivable ? "Open client balances" : "Fully collected",
      spark: reportSparklineSvg(scaleSparkFromAmount(clientReceivable), "green"),
    },
    {
      label: "Subcontract outstanding",
      value: renderReportMoneyValue(subcontractOutstanding, { compact: true }),
      icon: "subcontract",
      tone: "orange",
      extraClass: subcontractOutstanding > 0 ? "dash-kpi-card--attention" : "",
      footLeft: subcontractOutstanding ? "Active subcontract exposure" : "No open subcontract due",
      spark: reportSparklineSvg(scaleSparkFromAmount(subcontractOutstanding), "orange"),
    },
    {
      label: "Monthly expense",
      value: renderReportMoneyValue(monthExpense, { compact: true }),
      icon: "expense",
      tone: "yellow",
      extraClass: "cust-kpi-card--yellow",
      footLeft: "Purchases this calendar month",
      spark: reportSparklineSvg(scaleSparkFromAmount(monthExpense), "yellow"),
    },
  ];
  return renderDashKpiRow(cards);
}

/** @deprecated Use renderDashKpiCard */
function renderReportKpiCard(c) {
  return renderDashKpiCard(c);
}

function countSpark(n) {
  const v = Math.max(0, Number(n) || 0);
  if (v <= 0) return [2, 2, 3, 3, 2, 3, 2];
  const peak = Math.min(8, 2 + v);
  return [peak - 1, peak, peak, peak + 1, peak, peak, peak].map((x) => Math.max(1, x));
}

function renderRepAnalyticsSection(title, innerHtml) {
  return `<section class="rep-analytics-block card">
      <h4 class="sup-section-title">${escapeHtml(title)}</h4>
      ${innerHtml}
    </section>`;
}

function renderRepAnalyticsStack(parts) {
  return `<div class="rep-analytics-stack">${parts.join("")}</div>`;
}

function renderRepAnalyticsLowerGrid(sectionHtmlList) {
  return `<div class="rep-analytics-lower-grid">${sectionHtmlList.join("")}</div>`;
}

function renderSectorStatRow(label, value, { attention = false } = {}) {
  return `<div class="rep-sector-stat${attention ? " rep-sector-stat--attention" : ""}"><span class="rep-sector-stat-label">${escapeHtml(label)}</span><strong class="rep-sector-stat-value">${escapeHtml(String(value))}</strong></div>`;
}

function renderDualSectorCompareSection(title, leftLabel, leftRows, rightLabel, rightRows, { leftMod = "private", rightMod = "gov" } = {}) {
  const card = (label, rows, modifier) => {
    const stats = rows.map((r) => renderSectorStatRow(r.label, r.value, { attention: r.attention })).join("");
    return `<div class="sector-compare-card sector-compare-card--${modifier}">
        <h5 class="sector-compare-card-title">${escapeHtml(label)}</h5>
        <div class="rep-sector-stats">${stats}</div>
      </div>`;
  };
  const inner = `<div class="sector-compare-grid rep-sector-compare-inner">${card(leftLabel, leftRows, leftMod)}${card(rightLabel, rightRows, rightMod)}</div>`;
  return renderRepAnalyticsSection(title, inner);
}

/** Financial §2.7 tab — same layout shell as Enterprise governance */
export function renderFinancialMgmtPanel({
  expensePending = 0,
  totalPending = 0,
  clientReceivable = 0,
  govIpcOutstanding = 0,
  subcontractOutstanding = 0,
  pendingApprovals = [],
} = {}) {
  const exposureInner = `<div class="rep-analytics-util-grid rep-analytics-util-grid--triple">
      ${renderRepMetricUtilCard({
        title: "Expense approvals pending",
        value: String(expensePending),
        foot: expensePending ? "Project expense queue" : "No expense approvals waiting",
        tone: "warn",
      })}
      ${renderRepMetricUtilCard({
        title: "Total pending items",
        value: String(totalPending),
        foot: totalPending ? "All entity types in inbox" : "Approval inbox clear",
        tone: "teal",
      })}
      ${renderRepMetricUtilCard({
        title: "Subcontract outstanding",
        value: renderReportMoneyValue(subcontractOutstanding),
        foot: subcontractOutstanding ? "Active subcontract exposure" : "No open subcontract due",
        tone: subcontractOutstanding > 0 ? undefined : "purple",
        variant: subcontractOutstanding > 0 ? "danger" : "ok",
      })}
    </div>`;

  const billingHtml = renderGovPlaceholder("No billing register data");

  const pending = pendingApprovals || [];
  const approvalsHtml = pending.length
    ? `<div class="reports-table-wrap">
        <table class="dash-table projects-table">
          <thead><tr><th>Entity</th><th>Title</th><th>Age (days)</th></tr></thead>
          <tbody>${pending
            .map(
              (r) =>
                `<tr><td>${escapeHtml(r.entityType)}</td><td>${escapeHtml(r.title || "—")}</td><td>${escapeHtml(String(r.ageDays ?? "—"))}</td></tr>`
            )
            .join("")}</tbody>
        </table>
      </div>`
    : renderGovPlaceholder("No pending approvals");

  return renderRepAnalyticsStack([
    renderDualSectorCompareSection(
      "Receivables snapshot",
      "Client",
      [
        {
          label: "Open bills (BDT)",
          value: renderReportMoneyValue(clientReceivable),
          attention: clientReceivable > 0,
        },
      ],
      "Government IPC",
      [
        {
          label: "Outstanding (BDT)",
          value: renderReportMoneyValue(govIpcOutstanding),
          attention: govIpcOutstanding > 0,
        },
      ],
      { leftMod: "private", rightMod: "gov" }
    ),
    renderRepAnalyticsLowerGrid([
      renderRepAnalyticsSection("Approvals & subcontract exposure", exposureInner),
      renderRepAnalyticsSection("Client billing snapshot", billingHtml),
    ]),
    renderRepAnalyticsSection("Pending approvals aging", approvalsHtml),
  ]);
}


function utilCardVariantClass(variant = "warn", tone) {
  if (variant === "danger") return "rep-analytics-util-card--danger";
  if (tone === "teal") return "rep-analytics-util-card--teal";
  if (tone === "purple") return "rep-analytics-util-card--purple";
  if (tone === "blue") return "rep-analytics-util-card--blue";
  if (tone === "neutral") return "rep-analytics-util-card--neutral";
  if (tone === "warn") return "rep-analytics-util-card--warn";
  if (variant === "ok") return "rep-analytics-util-card--ok";
  if (variant === "warn") return "rep-analytics-util-card--warn";
  return "rep-analytics-util-card--warn";
}

function renderRepMetricUtilCard({ title, value, foot, variant = "warn", tone } = {}) {
  return `
    <div class="rep-analytics-util-card ${utilCardVariantClass(variant, tone)}">
      <span class="rep-analytics-util-card-title">${escapeHtml(title)}</span>
      <div class="rep-metric-util-value">${escapeHtml(String(value))}</div>
      <p class="rep-analytics-empty">${escapeHtml(foot)}</p>
    </div>`;
}

function renderGovPlaceholder(message) {
  return `<div class="rep-gov-placeholder-panel"><p class="proj-empty rep-analytics-empty">${message}</p></div>`;
}

function renderUtilStatPanel({ title, rows, variant = "ok" }) {
  const stats = rows.map((r) => renderSectorStatRow(r.label, r.value, { attention: r.attention })).join("");
  return `
    <div class="rep-analytics-util-card ${utilCardVariantClass(variant)}">
      <span class="rep-analytics-util-card-title">${escapeHtml(title)}</span>
      <div class="rep-sector-stats rep-util-stat-stack">${stats}</div>
    </div>`;
}

/** Doc & HSE tab — same layout shell as Enterprise governance */
export function renderHseDocPanel({
  qualityOpen = 0,
  qualityApproved = 0,
  safetyOpen = 0,
  safetyCritical = 0,
  ncrOpen = 0,
  expiringWarn = 0,
  expired = 0,
} = {}) {
  const totalAtRisk = expiringWarn + expired;

  const expiryInner = `<div class="rep-analytics-util-grid rep-analytics-util-grid--triple">
      ${renderRepMetricUtilCard({
        title: "Expiring within 30 days",
        value: String(expiringWarn),
        foot: expiringWarn ? "Permits & licenses due soon" : "None due soon",
        tone: "warn",
      })}
      ${renderRepMetricUtilCard({
        title: "Expired",
        value: String(expired),
        foot: expired ? "Requires renewal" : "None expired",
        tone: expired > 0 ? undefined : "purple",
        variant: expired > 0 ? "danger" : "ok",
      })}
      ${renderRepMetricUtilCard({
        title: "Total at risk",
        value: String(totalAtRisk),
        foot: totalAtRisk ? "Expiring or expired permits & licenses" : "No permits at risk",
        tone: "teal",
      })}
    </div>`;

  const permitRegisterHtml = renderGovPlaceholder("No permit register data");

  const documentsLogHtml = renderGovPlaceholder("No documents or inspections listed");

  return renderRepAnalyticsStack([
    renderDualSectorCompareSection(
      "Quality & safety compliance",
      "Quality",
      [
        { label: "Quality open", value: qualityOpen, attention: qualityOpen > 0 },
        { label: "Quality approved", value: qualityApproved },
        { label: "Open NCRs", value: ncrOpen, attention: ncrOpen > 0 },
      ],
      "Safety",
      [
        { label: "Safety open", value: safetyOpen, attention: safetyOpen > 0 },
        { label: "Critical/high", value: safetyCritical, attention: safetyCritical > 0 },
      ],
      { leftMod: "private", rightMod: "gov" }
    ),
    renderRepAnalyticsLowerGrid([
      renderRepAnalyticsSection("Permit & license expiry", expiryInner),
      renderRepAnalyticsSection("Permit register snapshot", permitRegisterHtml),
    ]),
    renderRepAnalyticsSection("Documents & inspections log", documentsLogHtml),
  ]);
}

/** Governance tab — compliance, approvals, CO exposure, P&L */
export function renderGovernancePanel({
  compliance = null,
  pendingApprovals = [],
  changeOrders = null,
  claimExposure = null,
  pnlRows = [],
} = {}) {
  const g = compliance || {};
  const qualityOpen = g.qualityOpen ?? 0;
  const qualityApproved = g.qualityApproved ?? 0;
  const safetyOpen = g.safetyOpen ?? 0;
  const safetyCritical = g.safetyCritical ?? 0;
  const ncrOpen = g.ncrOpen ?? 0;

  const coApproved = changeOrders?.approvedValue ?? 0;
  const coPending = changeOrders?.pendingValue ?? 0;
  const claimTotal = claimExposure?.total ?? 0;

  const coInner = `<div class="rep-analytics-util-grid rep-analytics-util-grid--triple">
      ${renderRepMetricUtilCard({
        title: "CO approved value",
        value: renderReportMoneyValue(coApproved),
        foot: coApproved ? "Approved change orders" : "No approved CO value",
        tone: "teal",
      })}
      ${renderRepMetricUtilCard({
        title: "CO pending",
        value: renderReportMoneyValue(coPending),
        foot: coPending ? "Awaiting approval" : "No pending CO",
        tone: "warn",
      })}
      ${renderRepMetricUtilCard({
        title: "Claim exposure",
        value: renderReportMoneyValue(claimTotal),
        foot: claimTotal ? "Open claim exposure" : "No claim exposure",
        tone: claimTotal > 0 ? undefined : "purple",
        variant: claimTotal > 0 ? "danger" : "ok",
      })}
    </div>`;

  const pending = pendingApprovals || [];
  const approvalsHtml = pending.length
    ? `<div class="reports-table-wrap">
        <table class="dash-table projects-table">
          <thead><tr><th>Entity</th><th>Title</th><th>Age (days)</th></tr></thead>
          <tbody>${pending
            .map(
              (r) =>
                `<tr><td>${escapeHtml(r.entityType)}</td><td>${escapeHtml(r.title || "—")}</td><td>${escapeHtml(String(r.ageDays ?? "—"))}</td></tr>`
            )
            .join("")}</tbody>
        </table>
      </div>`
    : renderGovPlaceholder("No pending approvals");

  const pnl = pnlRows || [];
  const pnlHtml = pnl.length
    ? `<div class="reports-table-wrap">
        <table class="dash-table projects-table">
          <thead><tr><th>Project</th><th class="rep-col-money">Revenue (BDT)</th><th class="rep-col-money">Actual cost (BDT)</th><th class="rep-col-money">Margin (BDT)</th></tr></thead>
          <tbody>${pnl
            .map(
              (r) =>
                `<tr><td>${escapeHtml(r.name)}</td><td class="rep-col-money">${renderReportMoneyCell(r.revenue)}</td><td class="rep-col-money">${renderReportMoneyCell(r.actualCost)}</td><td class="rep-col-money">${renderReportMoneyCell(r.margin)}</td></tr>`
            )
            .join("")}</tbody>
        </table>
      </div>`
    : renderGovPlaceholder("No P&amp;L data");

  return renderRepAnalyticsStack([
    renderDualSectorCompareSection(
      "Quality & safety compliance",
      "Quality",
      [
        { label: "Quality open", value: qualityOpen, attention: qualityOpen > 0 },
        { label: "Quality approved", value: qualityApproved },
        { label: "Open NCRs", value: ncrOpen, attention: ncrOpen > 0 },
      ],
      "Safety",
      [
        { label: "Safety open", value: safetyOpen, attention: safetyOpen > 0 },
        { label: "Critical/high", value: safetyCritical, attention: safetyCritical > 0 },
      ],
      { leftMod: "private", rightMod: "gov" }
    ),
    renderRepAnalyticsLowerGrid([
      renderRepAnalyticsSection("Change orders & claim exposure", coInner),
      renderRepAnalyticsSection("Project P&L snapshot", pnlHtml),
    ]),
    renderRepAnalyticsSection("Pending approvals aging", approvalsHtml),
  ]);
}

export function renderProjectCostTable(rows, { limit, viewAllHref, showViewAllLink = true } = {}) {
  const { shown, total } = sliceRows(rows, limit);
  if (!total) return `<p class="proj-empty">No project cost data</p>`;
  return `
    <div class="reports-table-wrap">
      <table class="dash-table projects-table">
        <thead><tr><th>Project</th><th class="rep-col-money">Budget (BDT)</th><th class="rep-col-money">Committed (BDT)</th><th class="rep-col-money">Actual (BDT)</th><th class="rep-col-money">Remaining (BDT)</th><th class="rep-col-util">Util %</th></tr></thead>
        <tbody>
          ${shown
            .map(
              (r) => `<tr>
              <td>${escapeHtml(r.name)}</td>
              <td class="rep-col-money">${renderReportMoneyCell(r.budgetTotal)}</td>
              <td class="rep-col-money">${renderReportMoneyCell(r.committed)}</td>
              <td class="rep-col-money">${renderReportMoneyCell(r.actual)}</td>
              <td class="rep-col-money">${renderReportMoneyCell(r.remaining)}</td>
              <td class="rep-col-util">${r.overBudget ? statusChip("delayed") : statusChip("on_time")} ${escapeHtml(r.utilization)}%</td>
            </tr>`
            )
            .join("")}
        </tbody>
      </table>
    </div>
    ${viewAllHref || limit != null ? renderReportWidgetFoot({ shown: shown.length, total, href: viewAllHref, showViewAllLink }) : ""}`;
}

function renderProfitabilityBlock(rows, { limit, viewAllHref, showViewAllLink = true } = {}) {
  const { shown, total } = sliceRows(rows, limit);
  const inner = !total
    ? `<p class="proj-empty">No profitability data</p>`
    : `
    <div class="reports-table-wrap">
      <table class="dash-table projects-table">
        <thead><tr><th>Project</th><th>Sector</th><th class="text-right">Revenue</th><th class="text-right">Cost</th><th class="text-right">Margin</th><th>Margin %</th></tr></thead>
        <tbody>${shown
          .map(
            (r) =>
              `<tr><td>${escapeHtml(r.name)}</td><td>${escapeHtml(r.sector)}</td><td class="text-right">${formatBDT(r.revenue)}</td><td class="text-right">${formatBDT(r.cost)}</td><td class="text-right">${formatBDT(r.margin)}</td><td>${escapeHtml(r.marginPct)}%</td></tr>`
          )
          .join("")}</tbody>
      </table>
    </div>
    ${viewAllHref || limit != null ? renderReportWidgetFoot({ shown: shown.length, total, href: viewAllHref, showViewAllLink }) : ""}`;
  return `
    <section class="rep-analytics-block card">
      <h4 class="sup-section-title">Project profitability</h4>
      ${inner}
    </section>`;
}

function renderDelayBlock(delayAnalysis, { limit, viewAllHref, showViewAllLink = true } = {}) {
  if (!delayAnalysis) return "";
  const rows = delayAnalysis.delayedRows || [];
  const causes = delayAnalysis.causeSummary || [];
  const { shown, total } = sliceRows(rows, limit);
  const inner =
    causes.length ? `<div class="analytics-cause-row">${causes.map((c) => `<span class="chip delay-cause--${escapeHtml(c.cause)}">${escapeHtml(c.label)}: ${c.count}</span>`).join("")}</div>` : "";
  const tablePart = total
    ? `<div class="reports-table-wrap">
        <table class="dash-table projects-table">
          <thead><tr><th>Project</th><th>Milestone</th><th>Planned</th><th>Days late</th><th>Cause</th></tr></thead>
          <tbody>${shown
            .map(
              (r) =>
                `<tr><td>${escapeHtml(r.projectName)}</td><td>${escapeHtml(r.title)}</td><td>${escapeHtml(r.plannedDate)}</td><td>${escapeHtml(r.daysLate)}</td><td><span class="chip delay-cause--${escapeHtml(r.delayCause)}">${escapeHtml(r.delayCauseLabel)}</span></td></tr>`
            )
            .join("")}</tbody>
        </table>
      </div>
      ${viewAllHref && total > shown.length ? renderReportWidgetFoot({ shown: shown.length, total, href: viewAllHref, showViewAllLink }) : limit != null && total > shown.length ? renderReportWidgetFoot({ shown: shown.length, total, showViewAllLink: false }) : ""}`
    : `<p class="proj-empty">No delayed milestones</p>`;
  if (!causes.length && !total) return "";
  return `
    <section class="rep-analytics-block card">
      <h4 class="sup-section-title">Delay analysis</h4>
      ${inner}
      ${tablePart}
    </section>`;
}

function renderUtilizationBlock(a) {
  if (!a?.resourceUtilization) return "";
  const over = a.resourceUtilization.overAllocated || [];
  const under = a.resourceUtilization.underAllocated || [];
  const overHtml = over.length
    ? over
        .map(
          (u) =>
            `<li class="rep-analytics-util-item"><span class="rep-analytics-util-name">${escapeHtml(u.name)}</span><span class="rep-analytics-util-meta">${u.projects.length} project(s)</span><span class="rep-analytics-util-badge">${u.total}%</span></li>`
        )
        .join("")
    : "";
  const underHtml = under.length
    ? under
        .map(
          (u) =>
            `<li class="rep-analytics-util-item"><span class="rep-analytics-util-name">${escapeHtml(u.name)}</span><span class="rep-analytics-util-badge rep-analytics-util-badge--muted">${u.total}%</span></li>`
        )
        .join("")
    : "";
  return `
    <section class="rep-analytics-block card">
      <h4 class="sup-section-title">Resource utilization</h4>
      <div class="rep-analytics-util-grid">
        <div class="rep-analytics-util-card rep-analytics-util-card--warn">
          <span class="rep-analytics-util-card-title">Over-allocated</span>
          ${overHtml ? `<ul class="rep-analytics-util-list">${overHtml}</ul>` : `<p class="proj-empty rep-analytics-empty">None</p>`}
        </div>
        <div class="rep-analytics-util-card rep-analytics-util-card--ok">
          <span class="rep-analytics-util-card-title">Under-allocated (&lt;50%)</span>
          ${underHtml ? `<ul class="rep-analytics-util-list">${underHtml}</ul>` : `<p class="proj-empty rep-analytics-empty">None</p>`}
        </div>
      </div>
    </section>`;
}

function renderSectorBlock(a) {
  if (!a?.sectorComparison) return "";
  const gov = a.sectorComparison.Government || {};
  const priv = a.sectorComparison.Private || {};
  const card = (label, s, modifier, barClass) => {
    const delayed = s.delayedCount ?? 0;
    const margin = s.avgMarginPct ?? 0;
    return `
      <div class="sector-compare-card sector-compare-card--${modifier}">
        <h5 class="sector-compare-card-title">${escapeHtml(label)}</h5>
        <div class="rep-sector-stats">
          ${renderSectorStatRow("Projects", s.projectCount ?? 0)}
          ${renderSectorStatRow("Avg margin", `${margin}%`)}
          ${renderSectorStatRow("Delayed milestones", delayed, { attention: delayed > 0 })}
        </div>
        <div class="sector-bar sector-bar--${modifier}" aria-hidden="true"><span class="${barClass}" style="width:${Math.min(100, Math.max(0, margin))}%"></span></div>
      </div>`;
  };
  return `
    <section class="rep-analytics-block card">
      <h4 class="sup-section-title">Government vs Private performance</h4>
      <div class="sector-compare-grid rep-sector-compare-inner">
        ${card("Government", gov, "gov", "sector-bar-fill--gov")}
        ${card("Private", priv, "private", "sector-bar-fill--private")}
      </div>
    </section>`;
}

/**
 * @param {object} a analytics cache payload
 * @param {{ tableLimit?: number|null, viewAllHref?: string, blocks?: string[], showViewAllLink?: boolean }} opts
 */
export function renderAnalyticsBlocks(a, opts = {}) {
  if (!a) return "";
  const limit = opts.tableLimit;
  const href = opts.viewAllHref;
  const showViewAllLink = opts.showViewAllLink !== false;
  const blocks = opts.blocks || ["profitability", "delays", "utilization", "sector"];
  const parts = [];
  if (blocks.includes("profitability")) {
    parts.push(renderProfitabilityBlock(a.profitability || [], { limit, viewAllHref: href, showViewAllLink }));
  }
  if (blocks.includes("delays")) {
    const delayHtml = renderDelayBlock(a.delayAnalysis, { limit, viewAllHref: null, showViewAllLink: false });
    if (delayHtml) parts.push(delayHtml);
  }
  const lower = [];
  if (blocks.includes("utilization")) {
    const u = renderUtilizationBlock(a);
    if (u) lower.push(u);
  }
  if (blocks.includes("sector")) {
    const s = renderSectorBlock(a);
    if (s) lower.push(s);
  }
  if (lower.length) {
    parts.push(`<div class="rep-analytics-lower-grid">${lower.join("")}</div>`);
  }
  return `<div class="rep-analytics-stack">${parts.join("")}</div>`;
}

function renderSiteSummaryBlock(rows, { limit, viewAllHref, showViewAllLink = true } = {}) {
  const { shown, total } = sliceRows(rows, limit);
  const foot =
    viewAllHref || limit != null
      ? renderReportWidgetFoot({ shown: shown.length, total, href: viewAllHref, showViewAllLink })
      : "";
  const body = !total
    ? `<p class="proj-empty rep-payroll-empty">No payroll data</p>`
    : `
    <div class="reports-table-wrap">
      <table class="dash-table projects-table">
        <thead><tr><th>Project</th><th class="rep-col-money">Labor paid (BDT)</th><th class="rep-col-money">Calculated (BDT)</th></tr></thead>
        <tbody>${shown
          .map(
            (r) =>
              `<tr><td>${escapeHtml(r.projectName)}</td><td class="rep-col-money">${renderReportMoneyCell(r.laborPaid)}</td><td class="rep-col-money">${renderReportMoneyCell(r.laborCalculated)}</td></tr>`
          )
          .join("")}</tbody>
      </table>
    </div>
    ${foot}`;
  return `
    <section class="rep-payroll-block card" id="worker-payroll-site">
      <h4 class="sup-section-title">Site-wise payroll summary</h4>
      ${body}
    </section>`;
}

function renderAdvancesBlock(rows, { limit, viewAllHref, showViewAllLink = true } = {}) {
  const { shown, total } = sliceRows(rows, limit);
  const foot =
    viewAllHref || limit != null
      ? renderReportWidgetFoot({ shown: shown.length, total, href: viewAllHref, showViewAllLink })
      : "";
  const body = !total
    ? `<p class="proj-empty rep-payroll-empty">No outstanding advances</p>`
    : `
    <div class="reports-table-wrap">
      <table class="dash-table projects-table">
        <thead><tr><th>Worker</th><th class="rep-col-money">Outstanding (BDT)</th></tr></thead>
        <tbody>${shown
          .map(
            (r) =>
              `<tr><td>${escapeHtml(r.workerName)}</td><td class="rep-col-money">${renderReportMoneyCell(r.outstanding)}</td></tr>`
          )
          .join("")}</tbody>
      </table>
    </div>
    ${foot}`;
  return `
    <section class="rep-payroll-block card" id="worker-payroll-advances">
      <h4 class="sup-section-title">Outstanding advances</h4>
      ${body}
    </section>`;
}

function renderPaymentLogBlock(rows, { limit, viewAllHref, showViewAllLink = true } = {}) {
  const { shown, total } = sliceRows(rows, limit);
  const foot =
    viewAllHref || limit != null
      ? renderReportWidgetFoot({ shown: shown.length, total, href: viewAllHref, showViewAllLink })
      : "";
  const body = !total
    ? `<p class="proj-empty rep-payroll-empty">No payments logged</p>`
    : `
    <div class="reports-table-wrap">
      <table class="dash-table projects-table">
        <thead><tr><th>Date</th><th>Worker</th><th class="rep-col-money">Amount (BDT)</th><th>Mode</th><th>Site In-charge</th></tr></thead>
        <tbody>${shown
          .map(
            (r) =>
              `<tr><td>${escapeHtml(r.date || "—")}</td><td>${escapeHtml(r.workerName)}</td><td class="rep-col-money">${renderReportMoneyCell(r.amount)}</td><td>${escapeHtml(paymentModeLabel(r.paymentMode))}</td><td>${escapeHtml(r.siteInChargeName)}</td></tr>`
          )
          .join("")}</tbody>
      </table>
    </div>
    ${foot}`;
  return `
    <section class="rep-payroll-block card" id="worker-payroll-payments">
      <h4 class="sup-section-title">Payment confirmation log</h4>
      ${body}
    </section>`;
}

export function renderWorkerPayrollReconcileBlock(data) {
  const month = data?.monthKey || new Date().toISOString().slice(0, 7);
  return `
    <section class="rep-payroll-block card rep-payroll-reconcile-card" id="worker-payroll-reconcile">
      <h4 class="sup-section-title">Accountant reconciliation</h4>
      <p class="rep-payroll-reconcile-desc">Reconcile site payroll against project labor budget for ${escapeHtml(month)}.</p>
      <div class="rep-payroll-reconcile-actions">
        <button type="button" class="btn btn-primary btn-sm" id="reports-reconcile-payroll">Reconcile first project</button>
      </div>
    </section>`;
}

/**
 * @param {object} data worker payroll cache
 * @param {{ tableLimit?: number|null, viewAllHref?: string, includeReconcile?: boolean, showViewAllLink?: boolean }} opts
 */
export function renderWorkerPayrollBlocks(data, opts = {}) {
  if (!data) return "";
  const limit = opts.tableLimit;
  const href = opts.viewAllHref;
  const showViewAllLink = opts.showViewAllLink !== false;
  const footOpts = { limit, viewAllHref: href, showViewAllLink: href ? false : showViewAllLink };
  const parts = [
    renderSiteSummaryBlock(data.siteSummary || [], footOpts),
    `<div class="rep-payroll-lower-grid">${renderAdvancesBlock(data.outstandingAdvances || [], footOpts)}${renderPaymentLogBlock(data.paymentLog || [], footOpts)}</div>`,
  ];
  if (opts.includeReconcile) {
    parts.push(renderWorkerPayrollReconcileBlock(data));
  }
  return `<div class="rep-payroll-stack">${parts.join("")}</div>`;
}

function truncateDeviceLabel(deviceId) {
  const s = String(deviceId ?? "—");
  if (s.length <= 14) return s;
  return `${s.slice(0, 10)}…`;
}

function renderMultitenantTenantBlock(tenantOps = []) {
  const list = tenantOps || [];
  const body = !list.length
    ? `<p class="proj-empty rep-multitenant-empty">No tenants registered</p>`
    : `
    <div class="reports-table-wrap">
      <table class="dash-table projects-table">
        <thead><tr><th>Company</th><th>Code</th><th>Status</th></tr></thead>
        <tbody>${list
          .map(
            (t) =>
              `<tr><td>${escapeHtml(t.name)}</td><td>${escapeHtml(t.code)}</td><td>${t.active ? statusChip("on_time", "active") : statusChip("delayed", "inactive")}</td></tr>`
          )
          .join("")}</tbody>
      </table>
    </div>`;
  return `
    <section class="rep-multitenant-block card" id="multitenant-tenants">
      <h4 class="sup-section-title">Tenant operations</h4>
      ${body}
    </section>`;
}

function renderMultitenantSyncBlock(syncHealth) {
  if (!syncHealth) {
    return `
    <section class="rep-multitenant-block card rep-multitenant-sync-card" id="multitenant-sync">
      <h4 class="sup-section-title">Offline sync health</h4>
      <p class="proj-empty rep-multitenant-empty">No sync status available</p>
    </section>`;
  }
  const pendingOps = syncHealth.pendingOps ?? 0;
  const conflictCount = syncHealth.conflictCount ?? 0;
  const online = syncHealth.online !== false;
  const deviceId = syncHealth.deviceId ?? "—";
  const syncCards = [
    {
      label: "Pending ops",
      value: String(pendingOps),
      icon: "expense",
      extraClass: pendingOps > 0 ? "dash-kpi-card--attention" : "",
      footLeft: pendingOps ? "Queued offline operations" : "Queue clear",
      spark: reportSparklineSvg(countSpark(pendingOps), pendingOps ? "yellow" : "green"),
    },
    {
      label: "Conflicts",
      value: String(conflictCount),
      icon: "subcontract",
      extraClass: conflictCount > 0 ? "dash-kpi-card--attention" : "",
      footLeft: conflictCount ? "Open sync conflicts" : "No conflicts",
      spark: reportSparklineSvg(countSpark(conflictCount), conflictCount ? "orange" : "green"),
    },
    {
      label: "Online",
      value: online ? "Yes" : "Offline",
      icon: "receivable",
      extraClass: online ? "" : "dash-kpi-card--attention",
      footLeft: online ? "Device connected" : "Working offline",
      spark: reportSparklineSvg(online ? [3, 4, 4, 5, 4, 4, 5] : [5, 4, 3, 2, 3, 2, 2], online ? "green" : "red"),
    },
    {
      label: "Device",
      value: truncateDeviceLabel(deviceId),
      icon: "billed",
      extraClass: "",
      footLeft: String(deviceId),
      spark: reportSparklineSvg([2, 3, 3, 4, 3, 4, 3], "blue"),
    },
  ];
  return `
    <section class="rep-multitenant-block card rep-multitenant-sync-card" id="multitenant-sync">
      <h4 class="sup-section-title">Offline sync health</h4>
      <div class="dash-kpi-row rep-multitenant-kpi-row">${syncCards.map(renderReportKpiCard).join("")}</div>
    </section>`;
}

/** Multi-tenant tab — tenant directory + sync KPIs */
export function renderMultitenantBlocks({ tenantOps = [], syncHealth = null } = {}) {
  return `<div class="rep-multitenant-stack">${renderMultitenantTenantBlock(tenantOps)}${renderMultitenantSyncBlock(syncHealth)}</div>`;
}

export function reportsWidgetShell({ title, sub, bodyId, extraClass = "", viewAllHref = "", headerIcon = "" }) {
  const iconHtml = headerIcon ? reportWidgetIcon(headerIcon) : "";
  const viewAllHtml = viewAllHref
    ? `<a class="reports-view-all reports-view-all--head" href="${escapeHtml(viewAllHref)}">View all →</a>`
    : "";
  return `
    <section class="dash-widget dash-widget--reports card ${extraClass}">
      <div class="dash-widget-head dash-widget-head--split">
        <div class="reports-widget-head-left">
          ${iconHtml}
          <div>
            <h3 class="dash-widget-title">${escapeHtml(title)}</h3>
            ${sub ? `<p class="dash-widget-sub">${escapeHtml(sub)}</p>` : ""}
          </div>
        </div>
        ${viewAllHtml}
      </div>
      <div class="dash-widget-body" id="${escapeHtml(bodyId)}"></div>
    </section>`;
}

export const REPORT_SECTION_TABS = [
  { id: "billing", label: "Client billing" },
  { id: "purchases", label: "Purchases" },
  { id: "financial", label: "Financial" },
  { id: "project_cost", label: "Project cost" },
  { id: "procurement", label: "Procurement" },
  { id: "subcontract", label: "Subcontract" },
  { id: "hse", label: "Doc & HSE" },
  { id: "governance", label: "Governance" },
  { id: "analytics", label: "Analytics" },
  { id: "payroll", label: "Worker payroll" },
  { id: "multitenant", label: "Multi-tenant" },
];

export const REPORTS_TAB_STORAGE_KEY = "reportsActiveTab";

/** @param {{ id: string, label: string }[]} tabs */
export function renderReportsTabBar(tabs, activeId, onSelect) {
  const wrap = document.createElement("div");
  wrap.className = "rep-pill-tabs rep-pill-tabs--reports-main";
  wrap.setAttribute("role", "tablist");
  for (const t of tabs) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.role = "tab";
    btn.dataset.repTab = t.id;
    btn.setAttribute("aria-selected", activeId === t.id ? "true" : "false");
    btn.className = `proj-tab rep-tab-pill rep-tab-pill--${t.id}${activeId === t.id ? " is-active" : ""}`;
    btn.textContent = t.label;
    btn.onclick = () => onSelect(t.id);
    wrap.appendChild(btn);
  }
  return wrap;
}

export function wrapReportsTabPanel(tabId, node, visible) {
  const panel = document.createElement("div");
  panel.className = "rep-tab-panel";
  panel.dataset.repTab = tabId;
  panel.setAttribute("role", "tabpanel");
  if (!visible) panel.hidden = true;
  panel.appendChild(node);
  return panel;
}
