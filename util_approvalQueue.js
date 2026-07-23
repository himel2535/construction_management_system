import { normalizeRole } from "./util_roles.js";
import { roleHasAction } from "./util_roleActions.js";

/** Inbox types procurement may approve (not billing / change orders / quality). */
export const PROCUREMENT_INBOX_TYPES = new Set([
  "purchaseorder",
  "purchase_order",
  "purchase_requisition",
  "material_request",
  "supplierbill",
  "bill",
]);

/**
 * Primary permission key for approving a queue row (non-expense).
 * @param {string} [entityType]
 */
export function queueRowDecisionPermissionKey(entityType) {
  const t = String(entityType || "").toLowerCase();
  if (t === "clientinvoice" || t === "billing") return "approve_billing";
  if (t === "supplierbill" || t === "bill") return "approve_supplier_bill";
  return "approve";
}

function roleCanPerform(role, action) {
  return roleHasAction(normalizeRole(role), action);
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

  const key = queueRowDecisionPermissionKey(row.entityType);
  if (key === "approve_supplier_bill") {
    return roleCanPerform(r, "approve_supplier_bill") || roleCanPerform(r, "approve");
  }
  return roleCanPerform(r, key);
}
