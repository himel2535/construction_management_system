import { normalizeRole } from "./util_roles.js";
import { roleHasAction } from "./util_roleActions.js";
import { approvalActionForEntity, canApproveEntity } from "./util_approvalResponsibility.js";

/** Supplier bill rows procurement may see but not decide (accountant approves). */
export const PROCUREMENT_INBOX_TYPES = new Set(["supplierbill", "bill"]);

/**
 * Primary permission key for approving a queue row (non-expense).
 * @param {string} [entityType]
 */
export function queueRowDecisionPermissionKey(entityType) {
  return approvalActionForEntity(entityType);
}

/**
 * Whether role may approve/reject this approval-queue row (expense uses dedicated checker).
 * @param {object} row
 * @param {string} [role]
 * @param {{ canApproveExpense?: (row: object, role: string) => boolean }} [opts]
 */
export function canRoleDecideQueueRow(row, role, opts = {}) {
  if (!row) return false;
  const r = normalizeRole(role || "viewer");

  if (row.entityType === "projectExpense") {
    return opts.canApproveExpense ? opts.canApproveExpense(row, r) : false;
  }

  if (r === "procurement_officer") {
    const t = String(row.entityType || "").toLowerCase();
    if (!PROCUREMENT_INBOX_TYPES.has(t)) return false;
  }

  return canApproveEntity(row.entityType, r);
}
