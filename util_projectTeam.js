/** Project team assignment helpers (§2.4) */

import { roleLabel } from "./util_roles.js";

/** Assignment join collection: project_id + user_id + role (+ allocationPercent) */
export const TEAM_PATHS = {
  assignments: "projectTeamAssignments",
  tasks: "responsibilityTasks",
};

export const RACI_TYPES = {
  R: { key: "R", label: "Responsible" },
  A: { key: "A", label: "Accountable" },
  C: { key: "C", label: "Consulted" },
  I: { key: "I", label: "Informed" },
};

export const TASK_PRIORITIES = {
  low: { key: "low", label: "Low", severity: "normal" },
  medium: { key: "medium", label: "Medium", severity: "normal" },
  high: { key: "high", label: "High", severity: "high" },
  critical: { key: "critical", label: "Critical", severity: "high" },
};

export const TASK_STATUSES = {
  open: { key: "open", label: "Open" },
  in_progress: { key: "in_progress", label: "In progress" },
  done: { key: "done", label: "Done" },
  delegated: { key: "delegated", label: "Delegated" },
};

const todayISO = () => new Date().toISOString().slice(0, 10);

export function raciLabel(key) {
  return RACI_TYPES[key]?.label || key || "—";
}

export function priorityLabel(key) {
  return TASK_PRIORITIES[key]?.label || key || "Medium";
}

export function prioritySeverity(key) {
  return TASK_PRIORITIES[key]?.severity || "normal";
}

export function isAssignmentActive(row, today = todayISO()) {
  if (!row || row.status === "ended") return false;
  if (row.startDate && row.startDate > today) return false;
  if (row.endDate && row.endDate < today) return false;
  return true;
}

/**
 * @param {string} userId
 * @param {object[]} assignments
 * @param {string} [today]
 */
export function computeUserAllocation(userId, assignments = [], today = todayISO()) {
  const active = (assignments || []).filter(
    (a) => a.userId === userId && isAssignmentActive(a, today)
  );
  const byProject = active.map((a) => ({
    projectId: a.projectId,
    role: a.role,
    raci: a.raci,
    allocationPercent: Number(a.allocationPercent) || 0,
  }));
  const total = byProject.reduce((sum, p) => sum + p.allocationPercent, 0);
  return { byProject, total, activeCount: byProject.length };
}

/**
 * @param {object[]} assignments
 * @param {string} [today]
 * @returns {{ userId: string, total: number, projects: object[] }[]}
 */
export function detectOverAllocation(assignments = [], today = todayISO()) {
  const byUser = new Map();
  for (const a of assignments || []) {
    if (!isAssignmentActive(a, today)) continue;
    const uid = a.userId;
    if (!uid) continue;
    const pct = Number(a.allocationPercent) || 0;
    if (!byUser.has(uid)) byUser.set(uid, { userId: uid, total: 0, projects: [] });
    const row = byUser.get(uid);
    row.total += pct;
    row.projects.push({
      projectId: a.projectId,
      allocationPercent: pct,
      role: a.role,
    });
  }
  return [...byUser.values()].filter((u) => u.total > 100);
}

/**
 * Build RACI matrix rows for a project team tab.
 * @param {object[]} assignments - active assignments for project
 * @param {object[]} tasks
 * @param {object[]} users - from listRoleUsers
 */
export function buildRaciMatrix(assignments = [], tasks = [], users = []) {
  const userMap = new Map(users.map((u) => [u.id, u]));
  const memberIds = new Set([
    ...assignments.map((a) => a.userId),
    ...tasks.map((t) => t.assigneeUserId).filter(Boolean),
  ]);

  return [...memberIds].map((userId) => {
    const user = userMap.get(userId);
    const userAssignments = assignments.filter((a) => a.userId === userId);
    const userTasks = tasks.filter((t) => t.assigneeUserId === userId && t.status !== "done");
    const raciCounts = { R: 0, A: 0, C: 0, I: 0 };
    for (const a of userAssignments) {
      if (a.raci && raciCounts[a.raci] !== undefined) raciCounts[a.raci] += 1;
    }
    for (const t of userTasks) {
      if (t.raci && raciCounts[t.raci] !== undefined) raciCounts[t.raci] += 1;
    }
    const alloc = userAssignments.reduce((s, a) => s + (Number(a.allocationPercent) || 0), 0);
    return {
      userId,
      displayName: user?.displayName || user?.email || userId,
      role: userAssignments[0]?.role || user?.role || "",
      roleLabel: roleLabel(userAssignments[0]?.role || user?.role),
      raciCounts,
      taskCount: userTasks.length,
      allocationPercent: alloc,
    };
  });
}

/**
 * Flatten nested responsibility tasks for display (parent + sub-tasks).
 */
export function flattenTasksForDisplay(tasks = []) {
  const roots = tasks.filter((t) => !t.parentTaskId);
  const out = [];
  for (const root of roots) {
    out.push({ ...root, depth: 0 });
    const subs = tasks.filter((t) => t.parentTaskId === root.id);
    for (const sub of subs) out.push({ ...sub, depth: 1 });
  }
  const orphanSubs = tasks.filter(
    (t) => t.parentTaskId && !roots.some((r) => r.id === t.parentTaskId)
  );
  for (const o of orphanSubs) out.push({ ...o, depth: 1 });
  return out;
}
