/** §2.7 — project expense categories and gov approval stages */

export const EXPENSE_CATEGORIES = ["Material", "Labor", "Equipment", "Admin", "Other"];

export const EXPENSE_STATUSES = ["draft", "submitted", "approved", "rejected"];

export const EXPENSE_APPROVAL_STAGES_GOV = ["pm", "accountant", "owner"];

export const EXPENSE_STAGE_LABELS = {
  pm: "Project Manager",
  accountant: "Accountant",
  owner: "Owner",
};

/** Roles allowed to approve each gov expense stage */
export const EXPENSE_STAGE_ROLES = {
  pm: ["project_manager", "manager"],
  accountant: ["accountant"],
  owner: ["owner"],
};

/**
 * Map spec category to internal cost rollup key.
 * @param {string} category
 */
export function mapExpenseCategoryToCostCategory(category) {
  const c = String(category || "Other");
  if (c === "Material") return "material";
  if (c === "Labor") return "labor";
  if (c === "Equipment") return "equipment";
  if (c === "Admin" || c === "Other") return "overhead";
  return "overhead";
}

/**
 * @param {string} stage
 * @param {string} role normalized role id
 */
export function canRoleApproveExpenseStage(stage, role) {
  if (!stage) return false;
  const allowed = EXPENSE_STAGE_ROLES[stage] || [];
  return allowed.includes(role);
}

export function nextGovExpenseStage(current) {
  const idx = EXPENSE_APPROVAL_STAGES_GOV.indexOf(current);
  if (idx < 0 || idx >= EXPENSE_APPROVAL_STAGES_GOV.length - 1) return null;
  return EXPENSE_APPROVAL_STAGES_GOV[idx + 1];
}
