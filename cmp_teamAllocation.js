/** Cross-project resource allocation panel (§2.4) */

import { roleLabel } from "./util_roles.js";
import { detectOverAllocation, isAssignmentActive } from "./util_projectTeam.js";

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * @param {HTMLElement} container
 * @param {{ assignments?: object[], users?: object[], projects?: object[] }} ctx
 */
export function renderAllocationPanel(container, ctx = {}) {
  const { assignments = [], users = [], projects = [] } = ctx;
  const projectMap = new Map(projects.map((p) => [p.id, p]));
  const userMap = new Map(users.map((u) => [u.id, u]));
  const active = assignments.filter((a) => isAssignmentActive(a));
  const overAlloc = detectOverAllocation(assignments);
  const overSet = new Set(overAlloc.map((o) => o.userId));

  const byUser = new Map();
  for (const a of active) {
    if (!byUser.has(a.userId)) byUser.set(a.userId, []);
    byUser.get(a.userId).push(a);
  }

  const rows = [];
  for (const [userId, allocs] of byUser.entries()) {
    const user = userMap.get(userId);
    const name = user?.displayName || user?.email || userId;
    const total = allocs.reduce((s, x) => s + (Number(x.allocationPercent) || 0), 0);
    const over = overSet.has(userId);
    for (const a of allocs) {
      const proj = projectMap.get(a.projectId);
      rows.push({ userId, name, over, total, assignment: a, projectName: proj?.name || a.projectId });
    }
  }

  rows.sort((a, b) => {
    if (a.over && !b.over) return -1;
    if (b.over && !a.over) return 1;
    return b.total - a.total;
  });

  container.innerHTML = `
    <div class="team-allocation-panel">
      ${overAlloc.length ? `
        <div class="team-overalloc-banner" role="alert">
          <strong>${overAlloc.length} team member(s) over-allocated</strong>
          — active project assignments exceed 100% capacity.
        </div>
      ` : ""}
      <div class="table-wrap">
        <table class="dash-table team-allocation-table">
          <thead><tr>
            <th>Person</th><th>Project</th><th>Role</th><th>RACI</th>
            <th class="text-right">Allocation</th><th>Total</th><th>Load</th>
          </tr></thead>
          <tbody>
            ${rows.length ? rows.map((r) => {
              const pct = Number(r.assignment.allocationPercent) || 0;
              const barW = Math.min(100, pct);
              return `<tr class="${r.over ? "team-overallocated" : ""}">
                <td>${escapeHtml(r.name)}</td>
                <td>${escapeHtml(r.projectName)}</td>
                <td>${escapeHtml(roleLabel(r.assignment.role))}</td>
                <td>${escapeHtml(r.assignment.raci || "R")}</td>
                <td class="text-right">${pct}%</td>
                <td class="text-right">${r.total}%</td>
                <td>
                  <div class="team-allocation-bar" title="${pct}% on this project">
                    <span class="team-allocation-bar-fill" style="width:${barW}%"></span>
                  </div>
                </td>
              </tr>`;
            }).join("") : '<tr class="empty-row"><td colspan="7">No active team assignments yet</td></tr>'}
          </tbody>
        </table>
      </div>
    </div>
  `;
}
