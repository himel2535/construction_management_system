/** Client portal — KPI strip and dashboard widgets (read-only) */

import { escapeHtml } from "./cmp_projectTab.js";
import { kpiIcon } from "./cmp_dashboardIcons.js";
import { formatBDT } from "./util_format.js";

function portalSparklineSvg(values = [], tone = "green") {
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

function billBalance(b) {
  if (!b || b.status === "cancelled" || b.status === "paid") return 0;
  return Math.max(0, Number(b.amount || 0) - Number(b.paidAmount || 0));
}

/**
 * @param {{ projects: object[], bills: object[], milestones: object[] }} input
 */
export function computeClientPortalStats({ projects = [], bills = [], milestones = [] }) {
  const projectCount = projects.length;
  const totalOutstanding = bills.reduce((s, b) => s + billBalance(b), 0);
  const avgProgress =
    projectCount > 0
      ? Math.round(
          projects.reduce((s, p) => s + (Number(p.progressPercent) || 0), 0) / projectCount
        )
      : 0;
  const today = new Date().toISOString().slice(0, 10);
  const upcoming = milestones.filter((m) => m.plannedDate && m.plannedDate >= today);
  const nextMs = (upcoming.length ? upcoming : milestones)[0];
  const nextMilestoneLabel = nextMs
    ? `${nextMs.title || "Milestone"} · ${nextMs.plannedDate || "—"}`
    : "None scheduled";
  const nextMilestoneDate = nextMs?.plannedDate || "—";

  return {
    projectCount,
    totalOutstanding,
    totalOutstandingLabel: formatBDT(totalOutstanding),
    avgProgress,
    nextMilestoneLabel,
    nextMilestoneDate,
    milestoneCount: milestones.length,
  };
}

export function renderClientPortalKpiHtml(stats) {
  const cards = [
    {
      label: "Your projects",
      value: String(stats.projectCount),
      iconKey: "projects",
      tone: "blue",
      footLeft: "Linked to your account",
      spark: portalSparklineSvg([stats.projectCount || 1, 2, 2, 1, 1, 1, 1], "blue"),
    },
    {
      label: "Outstanding",
      value: stats.totalOutstandingLabel,
      iconKey: "receivable",
      tone: "orange",
      footLeft: "Unpaid client bills",
      spark: portalSparklineSvg([3, 4, 5, 4, 5, 6, 5], "orange"),
    },
    {
      label: "Avg progress",
      value: `${stats.avgProgress}%`,
      iconKey: "collection",
      tone: "green",
      footLeft: "Across active projects",
      spark: portalSparklineSvg([2, 3, 4, 5, 5, 6, stats.avgProgress || 3], "green"),
    },
    {
      label: "Next milestone",
      value: stats.milestoneCount ? stats.nextMilestoneDate : "—",
      iconKey: "expense",
      tone: "teal",
      footLeft: stats.milestoneCount ? stats.nextMilestoneLabel : "No milestones",
      spark: portalSparklineSvg([2, 2, 3, 3, 4, 4, 4], "teal"),
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
          <div class="dash-kpi-value portal-kpi-value">${escapeHtml(c.value)}</div>
        </div>
      </div>
      <div class="dash-kpi-foot">
        <div class="dash-kpi-foot-left">${escapeHtml(c.footLeft)}</div>
      </div>
    </div>`
    )
    .join("");
}

/**
 * @param {string} title
 * @param {string} subtitle
 * @param {string} bodyHtml
 * @param {string} [extraClass]
 */
export function portalWidgetHtml(title, subtitle = "", bodyHtml = "", extraClass = "") {
  return `<section class="dash-widget dash-widget--projects card portal-report-block ${extraClass}">
    <div class="dash-widget-head dash-widget-head--split">
      <div>
        <h3 class="dash-widget-title">${escapeHtml(title)}</h3>
        ${subtitle ? `<p class="dash-widget-sub">${escapeHtml(subtitle)}</p>` : ""}
      </div>
    </div>
    <div class="dash-widget-body portal-section-body">${bodyHtml}</div>
  </section>`;
}
