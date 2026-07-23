import { roleLabel } from "./util_roles.js";
import { roleHasAction } from "./util_roleActions.js";

export const PERMISSION_GROUPS = [
  {
    id: "projects",
    label: "Projects & schedule",
    actions: [
      "create_progress",
      "submit",
      "approve",
      "create_change_order",
      "create_claim",
      "submit_material_request",
    ],
  },
  {
    id: "site",
    label: "Site & diary",
    actions: ["submit_site_diary", "approve_site_diary", "issue_site_voucher"],
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
      "pay_supplier",
    ],
  },
  {
    id: "hse",
    label: "Quality & safety",
    actions: ["create_quality", "create_safety", "submit_document", "approve_document"],
  },
  {
    id: "team",
    label: "Team & procurement",
    actions: [
      "manage_team",
      "create_supplier_bill",
      "approve_supplier_bill",
      "post_central_grn",
      "approve_central_requisition",
    ],
  },
  {
    id: "admin",
    label: "Administration",
    actions: ["manage_users"],
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
