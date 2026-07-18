/** Core project helpers — progress, health, budget (§2.1) */

import { milestoneVariance } from "./svc_workflow.js";
import { isGovProject } from "./util_govProject.js";

export const PROJECT_HEALTH = {
  on_track: { key: "on_track", label: "On-track" },
  delayed: { key: "delayed", label: "Delayed" },
  at_risk: { key: "at_risk", label: "At-risk" },
};

const todayISO = () => new Date().toISOString().slice(0, 10);

/**
 * @param {object[]} milestones
 * @returns {number}
 */
export function computeProgressFromMilestones(milestones = []) {
  if (!milestones.length) return 0;
  const completed = milestones.filter((m) => m.status === "completed").length;
  return Math.round((completed / milestones.length) * 100);
}

/**
 * Resolve display progress: computed from milestones when available, else stored value.
 * @param {object} project
 * @param {object[]} [milestones]
 */
export function resolveProjectProgress(project, milestones = []) {
  if (milestones.length) return computeProgressFromMilestones(milestones);
  return Number(project?.progressPercent) || 0;
}

/**
 * @param {object} project
 * @param {object[]} [milestones]
 * @param {string} [today]
 */
export function computeProjectHealth(project, milestones = [], today = todayISO()) {
  const status = String(project?.status || "ongoing").toLowerCase();
  if (status === "completed" || status === "closed") return PROJECT_HEALTH.on_track.key;

  const open = milestones.filter((m) => m.status !== "completed");
  const overdue = open.filter((m) => milestoneVariance(m, today).key === "delayed");

  if (overdue.length >= 2) return PROJECT_HEALTH.at_risk.key;
  if (project?.endDate && project.endDate < today && status === "ongoing") {
    return PROJECT_HEALTH.at_risk.key;
  }
  if (overdue.length >= 1) return PROJECT_HEALTH.delayed.key;
  return PROJECT_HEALTH.on_track.key;
}

/**
 * @param {object} project
 * @returns {number}
 */
export function resolveBudgetTotal(project) {
  if (!project) return 0;
  const budget = Number(project.budgetTotal);
  if (budget > 0) return budget;
  const contract = Number(project.contractValue);
  if (contract > 0) return contract;
  if (isGovProject(project) && contract >= 0) return contract;
  return 0;
}

export function healthLabel(key) {
  return PROJECT_HEALTH[key]?.label || key || "—";
}
