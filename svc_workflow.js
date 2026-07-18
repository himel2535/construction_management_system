import { create } from "./svc_data.js";

import { getCurrentUserId } from "./svc_auth.js";
import { getActiveTenantId } from "./svc_tenant.js";
import { getDeviceId } from "./svc_tenant.js";

/** Release 1 workflow states */
export const WORKFLOW_STATES = ["draft", "submitted", "approved", "rejected", "closed"];

/** Allowed transitions: from -> [to] */
const TRANSITIONS = {
  draft: ["submitted"],
  submitted: ["approved", "rejected"],
  rejected: ["draft"],
  approved: ["closed"],
  closed: [],
};

/** Project lifecycle statuses (master record) */
export const PROJECT_STATUSES = ["planning", "ongoing", "on_hold", "completed", "closed"];

/** Allowed project status transitions */
export const PROJECT_STATUS_TRANSITIONS = {
  planning: ["ongoing", "on_hold"],
  ongoing: ["on_hold", "completed"],
  on_hold: ["planning", "ongoing"],
  completed: ["closed"],
  closed: [],
};

/**
 * @param {string} from
 * @param {string} to
 */
export function canProjectStatusTransition(from, to) {
  const f = String(from || "planning").toLowerCase();
  const allowed = PROJECT_STATUS_TRANSITIONS[f] || [];
  return allowed.includes(String(to).toLowerCase()) || f === String(to).toLowerCase();
}

/**
 * @param {string} from
 * @param {string} to
 */
export function canTransition(from, to) {
  const f = String(from || "draft").toLowerCase();
  const allowed = TRANSITIONS[f] || [];
  return allowed.includes(String(to).toLowerCase());
}

/**
 * @param {string} status
 */
export function isWorkflowEditable(status) {
  const s = String(status || "draft").toLowerCase();
  return s === "draft" || s === "rejected";
}

/**
 * @param {{ entityType: string, entityId: string, action: string, diffSummary?: string, actorId?: string }} entry
 */
export async function writeAuditLog({
  entityType,
  entityId,
  action,
  actionType = "",
  diffSummary = "",
  beforeState = null,
  afterState = null,
  actorId = getCurrentUserId(),
  tenantId = getActiveTenantId(),
  deviceId = getDeviceId(),
  projectId = "",
}) {
  await create("auditLogs", {
    entityType,
    entityId,
    action,
    actionType: actionType || action,
    actorId,
    tenantId,
    deviceId,
    projectId,
    timestamp: Date.now(),
    diffSummary,
    beforeState,
    afterState,
  });
}

/**
 * Milestone schedule variance vs today or actual date.
 * @param {{ plannedDate?: string, actualDate?: string, status?: string }} m
 * @param {string} [today]
 */
export function milestoneVariance(m, today = new Date().toISOString().slice(0, 10)) {
  if (!m.plannedDate) return { key: "pending", label: "No date" };
  if (m.status === "completed" || m.actualDate) {
    const actual = m.actualDate || today;
    return actual <= m.plannedDate
      ? { key: "on_time", label: "On time" }
      : { key: "delayed", label: "Delayed" };
  }
  if (m.plannedDate < today) return { key: "delayed", label: "Overdue" };
  return { key: "pending", label: "Upcoming" };
}
