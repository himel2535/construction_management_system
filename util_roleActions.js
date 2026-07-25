import { normalizeRole } from "./util_roles.js";

/** Single source of truth for demo RBAC action keys (used by guards + Settings matrix). */
export const ROLE_ACTIONS = {
  owner: ["*"],
  project_manager: [
    "submit",
    "submit_billing",
    "submit_site_diary",
    "approve_site_diary",
    "submit_material_request",
    "create_quality",
    "create_safety",
    "create_change_order",
    "create_claim",
    "create_progress",
    "post_expense",
    "submit_expense",
    "approve_expense",
    "manage_team",
    "submit_document",
    "approve_document",
    "approve_purchase_order",
    "approve_material_request",
    "approve_central_requisition",
    "approve_quality",
    "approve_safety",
    "approve_change_order",
    "approve_claim",
    "approve_eot",
    "approve_measurement",
    "approve_ipc",
    "approve_material_log",
    "approve_settlement",
    "approve_milestone",
  ],
  site_engineer: [
    "submit",
    "submit_site_diary",
    "approve_site_diary",
    "submit_material_request",
    "submit_expense",
    "submit_document",
    "create_quality",
    "create_safety",
    "create_progress",
    "approve_material_log",
  ],
  site_supervisor: [
    "submit",
    "submit_site_diary",
    "submit_material_request",
    "create_progress",
  ],
  accountant: [
    "approve_billing",
    "submit_billing",
    "post_expense",
    "submit_expense",
    "approve_expense",
    "approve_supplier_bill",
    "create_supplier_bill",
    "pay_supplier",
    "approve_document",
  ],
  procurement_officer: [
    "create_supplier_bill",
    "submit",
    "post_central_grn",
    "issue_site_voucher",
    "create_purchase_order",
  ],
  client: [],
  manager: [
    "submit",
    "submit_billing",
    "submit_site_diary",
    "approve_site_diary",
    "submit_material_request",
    "create_quality",
    "create_safety",
    "create_change_order",
    "create_claim",
    "create_progress",
    "post_expense",
    "submit_expense",
    "approve_expense",
    "submit_document",
    "approve_document",
    "approve_purchase_order",
    "approve_material_request",
    "approve_central_requisition",
    "approve_quality",
    "approve_safety",
    "approve_change_order",
    "approve_claim",
    "approve_eot",
    "approve_measurement",
    "approve_ipc",
    "approve_material_log",
    "approve_settlement",
    "approve_milestone",
  ],
  viewer: [],
};

/** Release 4 / admin actions keyed separately from ROLE_ACTIONS lists */
export const R4_ACTIONS = {
  switch_tenant: ["owner", "project_manager", "manager"],
  create_dispute: ["owner", "project_manager", "manager", "accountant"],
  submit_dispute: ["owner", "project_manager", "manager", "accountant"],
  create_arbitration_case: ["owner", "project_manager", "manager"],
  arbitration_decide: ["owner", "project_manager", "manager"],
  schedule_hearing: ["owner", "project_manager", "manager"],
  resolve_sync_conflict: ["owner", "project_manager", "manager"],
  replay_offline: ["owner", "project_manager", "manager", "site_engineer"],
  manage_users: ["owner"],
  manage_company: ["owner"],
};

/**
 * @param {string} role
 * @param {string} action
 */
export function roleHasAction(role, action) {
  const r = normalizeRole(role === "manager" ? "project_manager" : role);
  const allowed = ROLE_ACTIONS[r] || ROLE_ACTIONS.viewer;
  if (allowed.includes("*")) return true;
  if (allowed.includes(action)) return true;
  const r4 = R4_ACTIONS[action];
  if (r4) return r4.includes(r);
  return false;
}
