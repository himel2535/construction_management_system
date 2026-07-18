import { roleLabel } from "./util_roles.js";

export const PERMISSION_GROUPS = [
  {
    id: "projects",
    label: "Projects & schedule",
    actions: ["create_progress", "submit", "approve"],
  },
  {
    id: "financial",
    label: "Financial",
    actions: ["post_expense", "submit_expense", "approve_expense", "submit_billing", "approve_billing"],
  },
  {
    id: "hse",
    label: "Quality & safety",
    actions: ["create_quality", "create_safety", "submit_document", "approve_document"],
  },
  {
    id: "team",
    label: "Team & procurement",
    actions: ["manage_team", "create_supplier_bill", "approve_supplier_bill", "post_central_grn"],
  },
  {
    id: "admin",
    label: "Administration",
    actions: ["manage_users"],
  },
];

export const MATRIX_ROLES = ["owner", "project_manager", "site_engineer", "accountant"];

const ROLE_ACTIONS = {
  owner: ["*"],
  project_manager: [
    "approve", "submit", "submit_billing", "create_quality", "create_safety",
    "create_progress", "post_expense", "submit_expense", "approve_expense",
    "manage_team", "submit_document", "approve_document", "create_supplier_bill",
    "approve_supplier_bill",
  ],
  site_engineer: ["submit", "submit_expense", "submit_document", "create_quality", "create_safety", "create_progress"],
  accountant: ["approve", "approve_billing", "submit_billing", "post_expense", "approve_expense", "approve_document"],
};

const R4 = { manage_users: ["owner"] };

export function roleHasPermission(role, action) {
  const r = role === "manager" ? "project_manager" : role;
  const allowed = ROLE_ACTIONS[r] || [];
  if (allowed.includes("*")) return true;
  if (allowed.includes(action)) return true;
  if (R4[action]?.includes(r)) return true;
  return false;
}

export function matrixRoleLabel(role) {
  if (role === "owner") return "Owner / Admin";
  if (role === "site_engineer") return "Engineer";
  return roleLabel(role);
}
