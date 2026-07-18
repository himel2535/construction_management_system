import { valToList } from "./svc_clientCache.js";
import { milestoneVariance } from "./svc_workflow.js";
import { detectOverAllocation } from "./util_projectTeam.js";
import { computeProjectBudgetSummary } from "./svc_projectCost.js";
import { delayCauseLabel } from "./util_milestone.js";
import { isGovProject } from "./util_govProject.js";

function daysBetween(from, to) {
  if (!from || !to) return 0;
  const a = new Date(from);
  const b = new Date(to);
  return Math.max(0, Math.round((b - a) / 86400000));
}

export function computeProfitabilityReport(projects = [], sales = {}, costSummary = []) {
  const costMap = new Map((costSummary || []).map((r) => [r.projectId, Number(r.actual) || 0]));
  return projects.map((p) => {
    const revenue = Object.values(sales)
      .filter((s) => s.projectId === p.id && s.status !== "cancelled")
      .reduce((a, s) => a + (Number(s.totalPrice) || Number(s.amount) || 0), 0);
    const cost = costMap.has(p.id) ? costMap.get(p.id) : computeProjectBudgetSummary(p.id).actual;
    const margin = revenue - cost;
    const marginPct = revenue > 0 ? Math.round((margin / revenue) * 100) : 0;
    return {
      projectId: p.id,
      name: p.name,
      sector: isGovProject(p) ? "Government" : "Private",
      projectType: p.projectType || "private_civil",
      revenue,
      cost,
      margin,
      marginPct,
    };
  });
}

export function computeDelayAnalysis(milestonesByProject = {}, projects = [], today = new Date().toISOString().slice(0, 10)) {
  const delayedRows = [];
  const causeCounts = {};
  for (const p of projects) {
    const milestones = milestonesByProject[p.id] || [];
    for (const m of milestones) {
      const v = milestoneVariance(m, today);
      if (v.key !== "delayed") continue;
      const actual = m.actualDate || today;
      const daysLate = daysBetween(m.plannedDate, actual);
      const cause = m.delayCause || "other";
      causeCounts[cause] = (causeCounts[cause] || 0) + 1;
      delayedRows.push({
        projectId: p.id,
        projectName: p.name,
        milestoneId: m.id,
        title: m.title,
        plannedDate: m.plannedDate,
        actualDate: m.actualDate || "—",
        daysLate,
        delayCause: cause,
        delayCauseLabel: delayCauseLabel(cause),
        delayNotes: m.delayNotes || "",
      });
    }
  }
  return {
    delayedRows: delayedRows.sort((a, b) => b.daysLate - a.daysLate),
    causeSummary: Object.entries(causeCounts).map(([cause, count]) => ({
      cause,
      label: delayCauseLabel(cause),
      count,
    })),
  };
}

export function computeResourceUtilization(assignments = [], users = []) {
  const today = new Date().toISOString().slice(0, 10);
  const over = detectOverAllocation(assignments, today);
  const userMap = new Map(users.map((u) => [u.id, u]));
  const byUser = new Map();
  for (const a of assignments) {
    if (!a.userId || a.status !== "active") continue;
    if (!byUser.has(a.userId)) byUser.set(a.userId, { userId: a.userId, total: 0, projects: [] });
    const row = byUser.get(a.userId);
    const pct = Number(a.allocationPercent) || 0;
    row.total += pct;
    row.projects.push({ projectId: a.projectId, pct });
  }
  const under = [...byUser.values()]
    .filter((u) => u.total > 0 && u.total < 50)
    .map((u) => ({
      userId: u.userId,
      name: userMap.get(u.userId)?.displayName || u.userId,
      total: u.total,
      projects: u.projects,
    }));
  return {
    overAllocated: over.map((u) => ({
      userId: u.userId,
      name: userMap.get(u.userId)?.displayName || u.userId,
      total: u.total,
      projects: u.projects,
    })),
    underAllocated: under,
  };
}

export function computeSectorComparison(projects = [], profitability = [], delayAnalysis = {}, governance = {}) {
  const sectors = { Government: [], Private: [] };
  for (const p of projects) {
    const key = isGovProject(p) ? "Government" : "Private";
    sectors[key].push(p.id);
  }
  const result = {};
  for (const [sector, ids] of Object.entries(sectors)) {
    const prof = profitability.filter((r) => ids.includes(r.projectId));
    const avgMargin = prof.length
      ? Math.round(prof.reduce((a, r) => a + r.marginPct, 0) / prof.length)
      : 0;
    const delayed = (delayAnalysis.delayedRows || []).filter((r) => ids.includes(r.projectId)).length;
    const msCount = prof.length || 1;
    result[sector] = {
      projectCount: ids.length,
      avgMarginPct: avgMargin,
      delayedCount: delayed,
      delayedPct: Math.round((delayed / msCount) * 100),
      openNcr: governance.ncrOpen || 0,
      qualityOpen: governance.qualityOpen || 0,
    };
  }
  return result;
}

/**
 * @param {object} data
 */
export function computeAnalyticsSummaries(data = {}) {
  const projects = data.projects || [];
  const msRoot = data.milestonesRoot || {};
  const milestonesByProject = {};
  for (const p of projects) {
    milestonesByProject[p.id] = valToList(msRoot[p.id] || {});
  }
  const profitability = computeProfitabilityReport(projects, data.sales || {}, data.costSummary || []);
  const delayAnalysis = computeDelayAnalysis(milestonesByProject, projects);
  const utilization = computeResourceUtilization(data.assignments || [], data.users || []);
  const sectorComparison = computeSectorComparison(projects, profitability, delayAnalysis, data.governance || {});
  return {
    profitability,
    delayAnalysis,
    resourceUtilization: utilization,
    sectorComparison,
    updatedAt: Date.now(),
  };
}
