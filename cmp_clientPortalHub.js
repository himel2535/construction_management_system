/** Client portal — KPI strip and dashboard widgets (read-only) */

import { escapeHtml } from "./cmp_projectTab.js";
import { kpiIcon } from "./cmp_dashboardIcons.js";
import { statusChip, progressBar } from "./cmp_ui.js";
import { formatBDT } from "./util_format.js";
import { isGovProject, projectTypeLabel } from "./util_govProject.js";

function clientInitials(name = "") {
  const parts = String(name).trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "CL";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function billDueAmount(b) {
  return Math.max(0, Number(b?.amount || 0) - Number(b?.paidAmount || 0));
}

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

/**
 * @param {object|null} client
 * @param {object[]} [upcomingBills]
 */
export function renderPortalHeroHtml(client, upcomingBills = []) {
  const name = client?.name || client?.companyName || "Client";
  const contractRef = client?.contractRef || "";
  const dueAlert =
    upcomingBills.length > 0
      ? `<div class="cp-hero__alert" role="status">
          <strong>Upcoming payments</strong>
          <ul class="cp-hero__alert-list">
            ${upcomingBills
              .slice(0, 3)
              .map((b) => {
                const due = billDueAmount(b);
                return `<li>${escapeHtml(b.projectName || "Project")} — due ${escapeHtml(b.dueDate || "—")} · ${formatBDT(due)}</li>`;
              })
              .join("")}
          </ul>
        </div>`
      : "";

  return `<section class="cp-hero card">
    <div class="cp-hero__main">
      <div class="cp-hero__avatar" aria-hidden="true">${escapeHtml(clientInitials(name))}</div>
      <div class="cp-hero__copy">
        <div class="cp-hero__badges">
          <span class="cp-badge cp-badge--readonly">Read-only portal</span>
          ${contractRef ? `<span class="cp-badge cp-badge--contract">Contract ${escapeHtml(contractRef)}</span>` : ""}
        </div>
        <h2 class="cp-hero__name">${escapeHtml(name)}</h2>
        <p class="cp-hero__sub">Track your construction projects, billing, and milestones in one place.</p>
      </div>
    </div>
    ${dueAlert}
  </section>`;
}

/**
 * @param {object} project
 */
export function renderPortalProjectCardHtml(project) {
  const pct = Number(project.progressPercent) || 0;
  const status = project.status || "ongoing";
  const metaGov = isGovProject(project)
    ? `<div class="cp-project-meta__item"><span class="cp-project-meta__label">Work order</span><span class="cp-project-meta__value">${escapeHtml(project.workOrderNo || "—")}</span></div>`
    : `<div class="cp-project-meta__item"><span class="cp-project-meta__label">Contract value</span><span class="cp-project-meta__value">${formatBDT(project.contractValue || 0)}</span></div>`;

  return `<article class="cp-project-card card">
    <header class="cp-project-card__head">
      <div>
        <h3 class="cp-project-card__title">${escapeHtml(project.name)}</h3>
        <p class="cp-project-card__sub">${escapeHtml(projectTypeLabel(project.projectType))}</p>
      </div>
      ${statusChip(status)}
    </header>
    <div class="cp-project-card__progress">
      <div class="cp-project-card__progress-top">
        <span class="cp-project-card__progress-label">Overall progress</span>
        <span class="cp-project-card__progress-pct">${pct}%</span>
      </div>
      ${progressBar(pct)}
    </div>
    <dl class="cp-project-meta">
      <div class="cp-project-meta__item">
        <span class="cp-project-meta__label">Timeline</span>
        <span class="cp-project-meta__value">${escapeHtml(project.startDate || "—")} → ${escapeHtml(project.endDate || "—")}</span>
      </div>
      ${metaGov}
    </dl>
  </article>`;
}

/**
 * @param {object[]} projects
 */
export function renderPortalProjectsSectionHtml(projects) {
  const body =
    projects.length > 0
      ? `<div class="portal-projects-stack">${projects.map((p) => renderPortalProjectCardHtml(p)).join("")}</div>`
      : `<p class="proj-empty">No projects linked to your account yet.</p>`;
  return portalWidgetHtml("Your projects", "Progress and contract summary", body, "portal-widget--projects");
}

/**
 * @param {object[]} bills
 */
export function renderPortalBillingHtml(bills) {
  const tableHtml = `
    <div class="table-wrap projects-table-wrap">
      <table class="dash-table projects-table portal-billing-table">
        <thead>
          <tr>
            <th>Project</th>
            <th>Type</th>
            <th class="portal-col-money">Amount</th>
            <th class="portal-col-money">Paid</th>
            <th class="portal-col-money">Due</th>
            <th class="portal-col-money">Due date</th>
            <th class="cust-col-center">Status</th>
            <th>Date</th>
          </tr>
        </thead>
        <tbody>
          ${
            bills.length
              ? bills
                  .map((b) => {
                    const due = billDueAmount(b);
                    return `<tr>
                  <td>${escapeHtml(b.projectName || "—")}</td>
                  <td>${escapeHtml(b.billType || "—")}</td>
                  <td class="portal-col-money">${formatBDT(b.amount)}</td>
                  <td class="portal-col-money">${formatBDT(b.paidAmount || 0)}</td>
                  <td class="portal-col-money">${formatBDT(due)}</td>
                  <td class="portal-col-money">${escapeHtml(b.dueDate || "—")}</td>
                  <td class="cust-col-center">${statusChip(b.status || "draft")}</td>
                  <td>${escapeHtml(b.billDate || "—")}</td>
                </tr>`;
                  })
                  .join("")
              : '<tr class="empty-row"><td colspan="8">No bills yet</td></tr>'
          }
        </tbody>
      </table>
    </div>`;
  return portalWidgetHtml("Billing", "Invoices and payment status (read-only)", tableHtml, "portal-widget--billing");
}

/**
 * @param {object[]} milestones
 */
export function renderPortalMilestonesHtml(milestones) {
  const listHtml = `
    <ul class="cp-milestone-timeline">
      ${
        milestones.length
          ? milestones
              .slice(0, 8)
              .map(
                (m) => `
            <li class="cp-milestone-timeline__item">
              <span class="cp-milestone-timeline__date">${escapeHtml(m.plannedDate || "—")}</span>
              <div class="cp-milestone-timeline__body">
                <strong class="cp-milestone-timeline__title">${escapeHtml(m.title || "Milestone")}</strong>
                <span class="cp-milestone-timeline__project">${escapeHtml(m.projectName || "—")}</span>
              </div>
              ${statusChip(m.status || "pending")}
            </li>`
              )
              .join("")
          : `<li class="proj-empty cp-milestone-timeline__empty">No milestones scheduled</li>`
      }
    </ul>`;
  return portalWidgetHtml("Upcoming milestones", "Schedule across your projects", listHtml, "portal-widget--milestones");
}
