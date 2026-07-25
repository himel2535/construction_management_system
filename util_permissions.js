import { roleLabel } from "./util_roles.js";
import { roleHasAction } from "./util_roleActions.js";

export const PERMISSION_GROUPS = [
  {
    id: "procurement",
    label: "Procurement",
    actions: [
      "create_purchase_order",
      "approve_purchase_order",
      "approve_material_request",
      "approve_central_requisition",
      "post_central_grn",
      "issue_site_voucher",
      "submit_material_request",
    ],
  },
  {
    id: "projects",
    label: "Projects & schedule",
    actions: [
      "create_progress",
      "submit",
      "approve_milestone",
      "create_change_order",
      "approve_change_order",
      "create_claim",
      "approve_claim",
      "approve_eot",
      "approve_measurement",
      "approve_ipc",
    ],
  },
  {
    id: "site",
    label: "Site & diary",
    actions: [
      "submit_site_diary",
      "approve_site_diary",
      "approve_material_log",
      "approve_settlement",
    ],
  },
  {
    id: "financial",
    label: "Financial",
    actions: [
      "post_expense",
      "submit_expense",
      "approve_expense",
      "submit_billing",
      "approve_billing",
      "create_supplier_bill",
      "approve_supplier_bill",
      "pay_supplier",
    ],
  },
  {
    id: "hse",
    label: "Quality & safety",
    actions: [
      "create_quality",
      "approve_quality",
      "create_safety",
      "approve_safety",
      "submit_document",
      "approve_document",
    ],
  },
  {
    id: "team",
    label: "Team & admin",
    actions: ["manage_team", "manage_users", "manage_company"],
  },
];

export const MATRIX_ROLES = [
  "owner",
  "project_manager",
  "site_engineer",
  "site_supervisor",
  "accountant",
  "procurement_officer",
];

export function roleHasPermission(role, action) {
  return roleHasAction(role, action);
}

export function matrixRoleLabel(role) {
  if (role === "owner") return "Owner / Admin";
  if (role === "site_engineer") return "Engineer";
  if (role === "site_supervisor") return "Supervisor";
  if (role === "procurement_officer") return "Procurement";
  return roleLabel(role);
}
