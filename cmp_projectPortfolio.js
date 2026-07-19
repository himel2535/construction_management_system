/** Multi-project portfolio — card and table views (§2.1) */

import { statusChip, progressBar, healthChip } from "./cmp_ui.js";
import { formatBDT, formatDateRange } from "./util_format.js";
import { formatProjectTypeShort } from "./util_responsibility.js";
import {
  computeProjectHealth,
  resolveProjectProgress,
  resolveBudgetTotal,
} from "./util_projectCore.js";
import { resolveManagerLabel } from "./cmp_projectTab.js";

export const PORTFOLIO_VIEW_KEY = "erp_portfolio_view";

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function getPortfolioViewMode() {
  const v = sessionStorage.getItem(PORTFOLIO_VIEW_KEY);
  return v === "card" ? "card" : "table";
}

export function setPortfolioViewMode(mode) {
  sessionStorage.setItem(PORTFOLIO_VIEW_KEY, mode === "card" ? "card" : "table");
}

/**
 * @param {object[]} projects
 * @param {Record<string, object[]>} milestonesByProject
 * @param {{ viewMode?: string, emptyMessage?: string }} [opts]
 */
export function renderPortfolioHtml(projects, milestonesByProject = {}, opts = {}) {
  const viewMode = opts.viewMode || getPortfolioViewMode();
  const emptyMessage = opts.emptyMessage || "No projects in portfolio";

  if (!projects.length) {
    return `<p class="proj-empty">${escapeHtml(emptyMessage)}</p>`;
  }

  const toggle = `
    <div class="portfolio-toolbar">
      <div class="portfolio-view-toggle" role="group" aria-label="View mode">
        <button type="button" class="portfolio-view-btn${viewMode === "table" ? " is-active" : ""}" data-view="table">Table</button>
        <button type="button" class="portfolio-view-btn${viewMode === "card" ? " is-active" : ""}" data-view="card">Cards</button>
      </div>
    </div>
  `;

  if (viewMode === "card") {
    return (
      toggle +
      `<div class="project-card-grid">${projects
        .map((p) => {
          const milestones = milestonesByProject[p.id] || [];
          const progress = resolveProjectProgress(p, milestones);
          const health = computeProjectHealth(p, milestones);
          const budget = resolveBudgetTotal(p);
          return `
          <a href="/projects?select=${encodeURIComponent(p.id)}" class="project-card card">
            <div class="project-card-head">
              <strong class="project-card-title">${escapeHtml(p.name)}</strong>
              <span class="project-card-chips">${statusChip(p.status || "ongoing")}${healthChip(health)}</span>
            </div>
            <p class="project-card-meta">${escapeHtml(formatProjectTypeShort(p))} · ${escapeHtml(p.clientName || "—")}</p>
            ${p.location ? `<p class="project-card-loc">${escapeHtml(p.location)}</p>` : ""}
            <div class="project-card-progress">${progressBar(progress)}<small>${progress}% complete</small></div>
            <div class="project-card-foot">
              <span>${budget ? formatBDT(budget) : "—"}</span>
              <span>${escapeHtml(formatDateRange(p.startDate, p.endDate) || "—")}</span>
            </div>
          </a>`;
        })
        .join("")}</div>`
    );
  }

  return (
    toggle +
    `<div class="table-wrap">
      <table class="dash-table portfolio-table">
        <thead><tr><th>Project</th><th>Type</th><th>PM</th><th>Progress</th><th>Status</th><th>Health</th></tr></thead>
        <tbody>
          ${projects
            .map((p) => {
              const milestones = milestonesByProject[p.id] || [];
              const progress = resolveProjectProgress(p, milestones);
              const health = computeProjectHealth(p, milestones);
              return `
              <tr>
                <td><a href="/projects?select=${encodeURIComponent(p.id)}"><strong>${escapeHtml(p.name)}</strong></a></td>
                <td>${escapeHtml(formatProjectTypeShort(p))}</td>
                <td>${escapeHtml(resolveManagerLabel(p.projectManagerId))}</td>
                <td class="progress-cell">${progressBar(progress)}<small>${progress}%</small></td>
                <td>${statusChip(p.status || "ongoing")}</td>
                <td>${healthChip(health)}</td>
              </tr>`;
            })
            .join("")}
        </tbody>
      </table>
    </div>`
  );
}

/**
 * Wire view toggle buttons inside a host element.
 * @param {HTMLElement} host
 * @param {() => void} onViewChange
 */
export function wirePortfolioViewToggle(host, onViewChange) {
  host.querySelectorAll(".portfolio-view-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      setPortfolioViewMode(btn.dataset.view);
      onViewChange?.();
    });
  });
}

/**
 * Mount portfolio into host with optional re-render callback.
 */
export function mountPortfolio(host, projects, milestonesByProject, opts = {}) {
  const render = () => {
    host.innerHTML = renderPortfolioHtml(projects, milestonesByProject, {
      ...opts,
      viewMode: getPortfolioViewMode(),
    });
    wirePortfolioViewToggle(host, render);
  };
  render();
  return { refresh: render };
}
