/** Production approval responsibility matrix — who approves what and where */

import { normalizeRole, roleLabel } from "./util_roles.js";
import { roleHasAction } from "./util_roleActions.js";

/** @typedef {{ path: string, tab?: string, label: string }} ApprovePage */

/**
 * @typedef {{
 *   entityType: string,
 *   label: string,
 *   actionKey: string,
 *   submitActionKey?: string,
 *   approverRoles: string[],
 *   submitterRoles?: string[],
 *   approvePages: ApprovePage[],
 *   awaitingHint: string,
 * }} ApprovalResponsibility
 */

/** Aliases map queue / workflow entityType strings to catalog keys */
const ENTITY_ALIASES = {
  purchaseorder: "purchase_order",
  purchase_order: "purchase_order",
  purchaseOrder: "purchase_order",
  material_request: "material_request",
  materialrequest: "material_request",
  central_requisition: "central_requisition",
  supplierbill: "supplier_bill",
  supplier_bill: "supplier_bill",
  bill: "supplier_bill",
  clientinvoice: "client_invoice",
  client_invoice: "client_invoice",
  billing: "client_invoice",
  projectexpense: "project_expense",
  projectExpense: "project_expense",
  expense: "project_expense",
  qualitycheck: "quality_check",
  qualityCheck: "quality_check",
  quality: "quality_check",
  safetyincident: "safety_incident",
  safetyIncident: "safety_incident",
  safety: "safety_incident",
  changeorder: "change_order",
  changeOrder: "change_order",
  contractclaim: "contract_claim",
  contractClaim: "contract_claim",
  claim: "contract_claim",
  eotrequest: "eot_request",
  eotRequest: "eot_request",
  eot: "eot_request",
  measurementbook: "measurement_book",
  measurementEntry: "measurement_book",
  measuremententry: "measurement_book",
  ipcbill: "ipc_bill",
  ipcBill: "ipc_bill",
  ipc: "ipc_bill",
  sitediary: "site_diary",
  siteDiary: "site_diary",
  materiallog: "material_log",
  materialLog: "material_log",
  material_usage_log: "material_log",
  settlement: "settlement",
  site_settlement: "settlement",
  document: "document",
  milestone: "milestone",
  phase: "milestone",
  dispute: "arbitration",
  arbitrationcase: "arbitration",
  arbitrationCase: "arbitration",
};

/** @type {ApprovalResponsibility[]} */
export const APPROVAL_RESPONSIBILITIES = [
  {
    entityType: "material_request",
    label: "Material request",
    actionKey: "approve_material_request",
    submitActionKey: "submit_material_request",
    approverRoles: ["project_manager", "owner"],
    submitterRoles: ["site_engineer", "site_supervisor", "owner"],
    approvePages: [
      { path: "/approvals", label: "Approvals inbox" },
      { path: "/purchases", tab: "requests", label: "Procurement → Material requests" },
    ],
    awaitingHint: "Awaiting Project Manager approval — Approvals inbox",
  },
  {
    entityType: "purchase_order",
    label: "Purchase order",
    actionKey: "approve_purchase_order",
    submitActionKey: "create_purchase_order",
    approverRoles: ["project_manager", "owner"],
    submitterRoles: ["procurement_officer", "owner"],
    approvePages: [
      { path: "/approvals", label: "Approvals inbox" },
      { path: "/purchases", tab: "orders", label: "Procurement → Purchase orders" },
    ],
    awaitingHint: "Awaiting Project Manager approval — Approvals inbox",
  },
  {
    entityType: "central_requisition",
    label: "Central requisition",
    actionKey: "approve_central_requisition",
    submitActionKey: "submit_material_request",
    approverRoles: ["project_manager", "owner"],
    submitterRoles: ["site_engineer", "site_supervisor", "owner"],
    approvePages: [
      { path: "/approvals", label: "Approvals inbox" },
      { path: "/inventory", label: "Inventory → Issue vouchers" },
    ],
    awaitingHint: "Awaiting Project Manager approval — Approvals inbox",
  },
  {
    entityType: "supplier_bill",
    label: "Supplier bill",
    actionKey: "approve_supplier_bill",
    submitActionKey: "create_supplier_bill",
    approverRoles: ["accountant", "owner"],
    submitterRoles: ["procurement_officer", "accountant", "owner"],
    approvePages: [
      { path: "/approvals", label: "Approvals inbox" },
      { path: "/suppliers", label: "Suppliers → Bills" },
    ],
    awaitingHint: "Awaiting Accountant approval — Approvals inbox or Suppliers",
  },
  {
    entityType: "client_invoice",
    label: "Client invoice / billing",
    actionKey: "approve_billing",
    submitActionKey: "submit_billing",
    approverRoles: ["accountant", "owner"],
    submitterRoles: ["project_manager", "accountant", "owner"],
    approvePages: [{ path: "/billing", label: "Billing → Approve" }],
    awaitingHint: "Awaiting Accountant approval — Billing",
  },
  {
    entityType: "project_expense",
    label: "Project expense",
    actionKey: "approve_expense",
    submitActionKey: "submit_expense",
    approverRoles: ["project_manager", "accountant", "owner"],
    submitterRoles: ["site_engineer", "site_supervisor", "project_manager", "accountant", "owner"],
    approvePages: [
      { path: "/approvals", label: "Approvals inbox" },
      { path: "/accounting", label: "Finance → Expenses" },
    ],
    awaitingHint: "Awaiting staged approval — Approvals inbox or Finance",
  },
  {
    entityType: "site_diary",
    label: "Site diary",
    actionKey: "approve_site_diary",
    submitActionKey: "submit_site_diary",
    approverRoles: ["project_manager", "site_engineer", "owner"],
    submitterRoles: ["site_engineer", "site_supervisor", "project_manager", "owner"],
    approvePages: [{ path: "/site-incharge", label: "Site Management → Diaries" }],
    awaitingHint: "Awaiting PM / Site Engineer approval — Site Management",
  },
  {
    entityType: "material_log",
    label: "Material usage log",
    actionKey: "approve_material_log",
    submitActionKey: "submit",
    approverRoles: ["project_manager", "site_engineer", "owner"],
    submitterRoles: ["site_engineer", "site_supervisor", "owner"],
    approvePages: [{ path: "/site-incharge", label: "Site Management → Material history" }],
    awaitingHint: "Awaiting PM / Site Engineer approval — Site Management",
  },
  {
    entityType: "settlement",
    label: "Site settlement",
    actionKey: "approve_settlement",
    submitActionKey: "submit",
    approverRoles: ["project_manager", "owner"],
    submitterRoles: ["site_engineer", "site_supervisor", "owner"],
    approvePages: [{ path: "/site-incharge", label: "Site Management → Settlement" }],
    awaitingHint: "Awaiting Project Manager approval — Site Management",
  },
  {
    entityType: "quality_check",
    label: "Quality check",
    actionKey: "approve_quality",
    submitActionKey: "create_quality",
    approverRoles: ["project_manager", "owner"],
    submitterRoles: ["site_engineer", "project_manager", "owner"],
    approvePages: [
      { path: "/approvals", label: "Approvals inbox" },
      { path: "/projects", label: "Projects → Quality" },
    ],
    awaitingHint: "Awaiting Project Manager approval — Approvals inbox",
  },
  {
    entityType: "safety_incident",
    label: "Safety incident",
    actionKey: "approve_safety",
    submitActionKey: "create_safety",
    approverRoles: ["project_manager", "owner"],
    submitterRoles: ["site_engineer", "project_manager", "owner"],
    approvePages: [
      { path: "/approvals", label: "Approvals inbox" },
      { path: "/projects", label: "Projects → Safety" },
    ],
    awaitingHint: "Awaiting Project Manager approval — Approvals inbox",
  },
  {
    entityType: "change_order",
    label: "Change order",
    actionKey: "approve_change_order",
    submitActionKey: "create_change_order",
    approverRoles: ["project_manager", "owner"],
    submitterRoles: ["project_manager", "owner"],
    approvePages: [
      { path: "/approvals", label: "Approvals inbox" },
      { path: "/projects", label: "Projects → Change orders" },
    ],
    awaitingHint: "Awaiting Project Manager approval — Approvals inbox",
  },
  {
    entityType: "contract_claim",
    label: "Contract claim",
    actionKey: "approve_claim",
    submitActionKey: "create_claim",
    approverRoles: ["project_manager", "owner"],
    submitterRoles: ["project_manager", "owner"],
    approvePages: [
      { path: "/approvals", label: "Approvals inbox" },
      { path: "/projects", label: "Projects → Claims" },
    ],
    awaitingHint: "Awaiting Project Manager approval — Approvals inbox",
  },
  {
    entityType: "eot_request",
    label: "EOT request",
    actionKey: "approve_eot",
    submitActionKey: "submit",
    approverRoles: ["project_manager", "owner"],
    submitterRoles: ["project_manager", "owner"],
    approvePages: [
      { path: "/approvals", label: "Approvals inbox" },
      { path: "/projects", label: "Projects → EOT" },
    ],
    awaitingHint: "Awaiting Project Manager approval — Approvals inbox",
  },
  {
    entityType: "measurement_book",
    label: "Measurement book",
    actionKey: "approve_measurement",
    submitActionKey: "submit",
    approverRoles: ["project_manager", "owner"],
    submitterRoles: ["site_engineer", "owner"],
    approvePages: [{ path: "/projects", label: "Gov project → Measurement" }],
    awaitingHint: "Awaiting Project Manager approval — Gov project",
  },
  {
    entityType: "ipc_bill",
    label: "IPC bill",
    actionKey: "approve_ipc",
    submitActionKey: "submit",
    approverRoles: ["project_manager", "owner"],
    submitterRoles: ["site_engineer", "owner"],
    approvePages: [{ path: "/projects", label: "Gov project → IPC" }],
    awaitingHint: "Awaiting Project Manager approval — Gov project",
  },
  {
    entityType: "document",
    label: "Project document",
    actionKey: "approve_document",
    submitActionKey: "submit_document",
    approverRoles: ["project_manager", "accountant", "owner"],
    submitterRoles: ["site_engineer", "project_manager", "accountant", "owner"],
    approvePages: [{ path: "/projects", label: "Projects → Documents" }],
    awaitingHint: "Awaiting PM / Accountant approval — Projects → Documents",
  },
  {
    entityType: "milestone",
    label: "Milestone / phase",
    actionKey: "approve_milestone",
    submitActionKey: "submit",
    approverRoles: ["project_manager", "owner"],
    submitterRoles: ["project_manager", "owner"],
    approvePages: [{ path: "/projects", label: "Projects → Schedule" }],
    awaitingHint: "Awaiting Project Manager approval — Projects → Schedule",
  },
  {
    entityType: "arbitration",
    label: "Dispute / arbitration",
    actionKey: "arbitration_decide",
    submitActionKey: "submit_dispute",
    approverRoles: ["project_manager", "owner"],
    submitterRoles: ["project_manager", "accountant", "owner"],
    approvePages: [
      { path: "/approvals", label: "Approvals inbox" },
      { path: "/arbitration", label: "Arbitration" },
    ],
    awaitingHint: "Awaiting PM / Owner decision — Approvals inbox",
  },
];

const catalogByKey = new Map(APPROVAL_RESPONSIBILITIES.map((r) => [r.entityType, r]));

/**
 * @param {string} [entityType]
 */
export function normalizeApprovalEntityType(entityType) {
  const raw = String(entityType || "").trim();
  if (!raw) return "";
  return ENTITY_ALIASES[raw] || ENTITY_ALIASES[raw.toLowerCase()] || raw.toLowerCase();
}

/**
 * @param {string} entityType
 * @returns {ApprovalResponsibility | null}
 */
export function approvalResponsibilityFor(entityType) {
  const key = normalizeApprovalEntityType(entityType);
  return catalogByKey.get(key) || null;
}

/**
 * @param {string} entityType
 */
export function submitActionForEntity(entityType) {
  const row = approvalResponsibilityFor(entityType);
  if (row?.submitActionKey) return row.submitActionKey;
  return "submit";
}

/**
 * @param {string} entityType
 */
export function approvalActionForEntity(entityType) {
  const row = approvalResponsibilityFor(entityType);
  if (row) return row.actionKey;
  if (normalizeApprovalEntityType(entityType) === "document") return "approve_document";
  return "approve_milestone";
}

/**
 * @param {string} entityType
 * @param {string} [role]
 */
export function canApproveEntity(entityType, role = "viewer") {
  const r = normalizeRole(role);
  if (r === "owner") return true;
  const action = approvalActionForEntity(entityType);
  if (action === "arbitration_decide") {
    return roleHasAction(r, "arbitration_decide");
  }
  return roleHasAction(r, action);
}

/**
 * @param {string} entityType
 * @param {string} [role]
 */
export function canSubmitEntity(entityType, role = "viewer") {
  const r = normalizeRole(role);
  if (r === "owner") return true;
  const row = approvalResponsibilityFor(entityType);
  if (!row?.submitActionKey) return roleHasAction(r, "submit");
  return roleHasAction(r, row.submitActionKey);
}

/**
 * @param {string} entityType
 */
export function approvalEntityLabel(entityType) {
  const row = approvalResponsibilityFor(entityType);
  return row?.label || String(entityType || "").replace(/_/g, " ");
}

/**
 * @param {string} entityType
 */
export function approvalAwaitingHint(entityType) {
  const row = approvalResponsibilityFor(entityType);
  return row?.awaitingHint || "Awaiting approval — Approvals inbox";
}

/**
 * @param {string} entityType
 */
export function approverRoleLabels(entityType) {
  const row = approvalResponsibilityFor(entityType);
  if (!row) return "Approver";
  return row.approverRoles.map((r) => roleLabel(r)).join(" / ");
}

/**
 * @param {string} entityType
 */
export function approvePageLabels(entityType) {
  const row = approvalResponsibilityFor(entityType);
  if (!row?.approvePages?.length) return "Approvals inbox";
  return row.approvePages.map((p) => p.label).join(" · ");
}

/** Full matrix rows for Settings UI */
export function approvalResponsibilityRows() {
  return APPROVAL_RESPONSIBILITIES.map((r) => ({
    entityType: r.entityType,
    label: r.label,
    approverRoles: r.approverRoles.map((role) => roleLabel(role)).join(", "),
    approvePages: r.approvePages.map((p) => p.label).join(" · "),
    awaitingHint: r.awaitingHint,
  }));
}

/** Product Guide — full workflow rows including operational GRN */
export function approvalGuideRows() {
  const rows = APPROVAL_RESPONSIBILITIES.map((r) => ({
    entityType: r.entityType,
    label: r.label,
    submitterRoleIds: r.submitterRoles || [],
    approverRoleIds: r.approverRoles,
    submitterLabels: (r.submitterRoles || []).map((id) => roleLabel(id)),
    approverLabels: r.approverRoles.map((id) => roleLabel(id)),
    approvePages: r.approvePages.map((p) => ({
      path: p.tab ? `${p.path}?tab=${p.tab}` : p.path,
      label: p.label,
    })),
    flowNote:
      r.entityType === "project_expense"
        ? "Staged: PM → Accountant → Owner"
        : "",
    operational: false,
  }));

  const poIdx = rows.findIndex((r) => r.entityType === "purchase_order");
  const grnRow = {
    entityType: "grn",
    label: "GRN / Goods receive",
    submitterRoleIds: ["procurement_officer", "owner"],
    approverRoleIds: [],
    submitterLabels: [roleLabel("procurement_officer"), roleLabel("owner")],
    approverLabels: [],
    approvePages: [{ path: "/purchases?tab=grn", label: "Procurement → Goods receipt" }],
    flowNote: "Operational — no approval step",
    operational: true,
  };
  if (poIdx >= 0) rows.splice(poIdx + 1, 0, grnRow);
  else rows.push(grnRow);

  return rows;
}

/**
 * Per-role submit / approve / cannot summaries for Product Guide.
 * @param {string} [role]
 */
export function roleGuideSummary(role = "viewer") {
  const r = normalizeRole(role);
  if (r === "owner") {
    return {
      canSubmit: approvalGuideRows().map((x) => x.label),
      canApprove: approvalGuideRows().filter((x) => !x.operational).map((x) => x.label),
      cannotDo: [],
    };
  }

  const canSubmit = [];
  const canApprove = [];
  for (const row of approvalGuideRows()) {
    if (row.operational) {
      if (row.submitterRoleIds.includes(r)) canSubmit.push(row.label);
      continue;
    }
    if (canSubmitEntity(row.entityType, r)) canSubmit.push(row.label);
    if (canApproveEntity(row.entityType, r)) canApprove.push(row.label);
  }

  const cannotDo = approvalGuideRows()
    .filter((row) => {
      if (row.operational) return !row.submitterRoleIds.includes(r);
      return !canSubmitEntity(row.entityType, r) && !canApproveEntity(row.entityType, r);
    })
    .map((row) => row.label)
    .slice(0, 8);

  return { canSubmit, canApprove, cannotDo };
}

/** Whether a guide row is relevant for role filter highlight */
export function approvalGuideRowRelevant(row, role = "all") {
  if (!role || role === "all") return true;
  const r = normalizeRole(role);
  if (r === "owner") return true;
  if (row.operational) return row.submitterRoleIds.includes(r);
  return (
    row.submitterRoleIds.includes(r) ||
    row.approverRoleIds.includes(r) ||
    canSubmitEntity(row.entityType, r) ||
    canApproveEntity(row.entityType, r)
  );
}

/**
 * Short summary of what the current role can approve.
 * @param {string} [role]
 */
export function approvableEntitiesForRole(role = "viewer") {
  const r = normalizeRole(role);
  if (r === "owner") return APPROVAL_RESPONSIBILITIES.map((x) => x.label);
  return APPROVAL_RESPONSIBILITIES.filter((row) => {
    if (row.actionKey === "arbitration_decide") return roleHasAction(r, "arbitration_decide");
    return roleHasAction(r, row.actionKey);
  }).map((x) => x.label);
}
