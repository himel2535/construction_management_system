import { create, updatePath } from "./svc_data.js";
import { readRef, resolveRead } from "./svc_tenant.js";
import { getCurrentUserId } from "./svc_auth.js";
import { valToList } from "./svc_clientCache.js";
import { writeAuditLog } from "./svc_workflow.js";
import {
  guardAction,
  upsertApprovalQueue,
  clearApprovalQueue,
  getCurrentRole,
} from "./svc_governance.js";
import { normalizeRole } from "./util_roles.js";
import { isGovProject } from "./util_govProject.js";
import { checkBudgetForApproval, postProjectExpense } from "./svc_projectCost.js";
import {
  mapExpenseCategoryToCostCategory,
  canRoleApproveExpenseStage,
  nextGovExpenseStage,
  EXPENSE_STAGE_LABELS,
} from "./util_projectExpense.js";

export const EXPENSE_PATH = "projectExpenses";

export function expenseStoragePath(projectId, expenseId) {
  return `${EXPENSE_PATH}/${projectId}/${expenseId}`;
}

export const STALE_APPROVAL_MSG =
  "This item is no longer waiting for approval (already processed or updated).";

export const EXPENSE_LOADING_MSG = "Loading expense details… try again in a moment.";

/** @param {string} path */
export function parseExpenseQueuePath(path) {
  if (!path || typeof path !== "string") return null;
  const m = path.match(/^projectExpenses\/([^/]+)\/([^/]+)$/);
  if (!m) return null;
  return { projectId: m[1], expenseId: m[2] };
}

/**
 * @param {{ projectId?: string, entityId?: string, path?: string } | string} rowOrProjectId
 * @param {string} [expenseId]
 */
export function resolveExpenseContext(rowOrProjectId, expenseId) {
  let projectId = "";
  let resolvedExpenseId = "";
  let path = "";

  if (typeof rowOrProjectId === "object" && rowOrProjectId !== null) {
    const row = rowOrProjectId;
    projectId = row.projectId || "";
    resolvedExpenseId = row.entityId || "";
    path = row.path || "";
  } else {
    projectId = rowOrProjectId || "";
    resolvedExpenseId = expenseId || "";
    path = projectId && resolvedExpenseId ? expenseStoragePath(projectId, resolvedExpenseId) : "";
  }

  const parsed = parseExpenseQueuePath(path);
  if (parsed) {
    projectId = projectId || parsed.projectId;
    resolvedExpenseId = resolvedExpenseId || parsed.expenseId;
  }
  if (!path && projectId && resolvedExpenseId) {
    path = expenseStoragePath(projectId, resolvedExpenseId);
  }

  let loaded = false;
  let cur = null;
  if (path) {
    const raw = readRef(path);
    if (raw !== undefined) {
      loaded = true;
      cur = raw && typeof raw === "object" ? raw : {};
    }
  }

  return { projectId, expenseId: resolvedExpenseId, path, cur, loaded };
}

async function assertExpensePendingApproval(ctx) {
  const { expenseId, loaded, cur } = ctx;
  if (!ctx.projectId || !expenseId) {
    throw new Error(STALE_APPROVAL_MSG);
  }
  if (!loaded) {
    throw new Error(EXPENSE_LOADING_MSG);
  }
  if ((cur?.status || "draft") !== "submitted") {
    await clearApprovalQueue("projectExpense", expenseId);
    throw new Error(STALE_APPROVAL_MSG);
  }
}

/**
 * Same role/stage rules as Finance expense table action buttons.
 * @param {object} row approval queue row
 * @param {string} [role]
 */
export function canApproveExpenseQueueRow(row, role = normalizeRole(getCurrentRole())) {
  const ctx = resolveExpenseContext(row);
  if (!ctx.loaded || (ctx.cur?.status || "draft") !== "submitted") return false;
  const project = getProject(ctx.projectId);
  const gov = isGovProject(project);
  if (gov) {
    return canRoleApproveExpenseStage(ctx.cur.approvalStage || "pm", role);
  }
  return (
    role === "owner" ||
    canRoleApproveExpenseStage("pm", role) ||
    canRoleApproveExpenseStage("accountant", role)
  );
}

export function canRejectExpenseQueueRow(row, role = normalizeRole(getCurrentRole())) {
  return canApproveExpenseQueueRow(row, role);
}

/** @param {object} row */
export function expenseQueueRowAwaitingLabel(row) {
  const ctx = resolveExpenseContext(row);
  if (!ctx.loaded || (ctx.cur?.status || "draft") !== "submitted") return "";
  const project = getProject(ctx.projectId);
  if (!isGovProject(project)) return "";
  const stage = ctx.cur.approvalStage || "pm";
  const label = EXPENSE_STAGE_LABELS[stage] || stage;
  return `Awaiting ${label}`;
}

export function listProjectExpenses(projectId) {
  if (!projectId) return [];
  return valToList(resolveRead(`${EXPENSE_PATH}/${projectId}`) || {});
}

function getProject(projectId) {
  return valToList(resolveRead("projects") || {}).find((p) => p.id === projectId) || null;
}

function expenseTitle(expense) {
  return `${expense.category || "Expense"} — ${Number(expense.amount || 0).toLocaleString("en-BD")} BDT`;
}

async function refreshReports() {
  try {
    const { refreshReportsCacheClient } = await import("./svc_operations.js");
    await refreshReportsCacheClient();
  } catch (err) {
    console.warn("Reports cache refresh failed after expense action:", err?.message || err);
  }
}

export async function createProjectExpense({
  projectId,
  category,
  amount,
  phaseId = "",
  description = "",
  expenseDate,
}) {
  if (!projectId) throw new Error("Project required");
  const amt = Number(amount);
  if (!Number.isFinite(amt) || amt <= 0) throw new Error("Amount must be positive");
  const now = Date.now();
  const id = await create(`${EXPENSE_PATH}/${projectId}`, {
    projectId,
    category: category || "Other",
    amount: amt,
    phaseId: phaseId || "",
    description: description || "",
    expenseDate: expenseDate || new Date().toISOString().slice(0, 10),
    status: "draft",
    approvalStage: "",
    submittedBy: "",
    approvedBy: "",
    voucherRef: "",
    createdBy: getCurrentUserId(),
    createdAt: now,
    updatedAt: now,
  });
  await writeAuditLog({
    entityType: "projectExpense",
    entityId: id,
    action: "create",
    diffSummary: expenseTitle({ category, amount: amt }),
    projectId,
  });
  return id;
}

export async function submitProjectExpense(projectId, expenseId) {
  guardAction("submit_expense");
  const path = expenseStoragePath(projectId, expenseId);
  const cur = readRef(path) || {};
  if (!["draft", "rejected"].includes(cur.status || "draft")) {
    throw new Error("Only draft or rejected expenses can be submitted");
  }
  const check = checkBudgetForApproval(projectId, Number(cur.amount) || 0);
  if (!check.ok) throw new Error(check.message);

  const project = getProject(projectId);
  const gov = isGovProject(project);
  const now = Date.now();
  const patch = {
    ...cur,
    status: "submitted",
    submittedBy: getCurrentUserId(),
    submittedAt: now,
    updatedAt: now,
    rejectionReason: "",
  };

  if (gov) {
    patch.approvalStage = "pm";
  } else {
    patch.approvalStage = "";
  }

  await updatePath(path, patch);
  await upsertApprovalQueue({
    entityType: "projectExpense",
    entityId: expenseId,
    projectId,
    path,
    title: expenseTitle(patch),
    status: "pending",
    approvalStage: patch.approvalStage || "private",
    submittedBy: getCurrentUserId(),
    submittedAt: now,
  });
  await writeAuditLog({
    entityType: "projectExpense",
    entityId: expenseId,
    action: "submit",
    diffSummary: `Submitted: ${expenseTitle(patch)}`,
    projectId,
  });
  await refreshReports();
}

async function finalizeExpenseApproval(projectId, expenseId, cur) {
  guardAction("approve_expense");
  const costCategory = mapExpenseCategoryToCostCategory(cur.category);
  const voucherNo = await postProjectExpense({
    projectId,
    amount: Number(cur.amount) || 0,
    costCategory,
    narration: cur.description || `${cur.category} expense`,
    refType: "projectExpense",
    refId: expenseId,
    date: cur.expenseDate,
  });
  const now = Date.now();
  await updatePath(expenseStoragePath(projectId, expenseId), {
    ...cur,
    status: "approved",
    approvalStage: "",
    approvedBy: getCurrentUserId(),
    approvedAt: now,
    voucherRef: voucherNo,
    updatedAt: now,
  });
  await clearApprovalQueue("projectExpense", expenseId);
  await writeAuditLog({
    entityType: "projectExpense",
    entityId: expenseId,
    action: "approve",
    diffSummary: `Approved & posted: ${expenseTitle(cur)}`,
    projectId,
  });
  await refreshReports();
}

async function ensureExpenseContextLoaded(ctx) {
  if (ctx.loaded || !ctx.path) return ctx;
  const { get } = await import("./svc_data.js");
  if (ctx.projectId) {
    await get(`${EXPENSE_PATH}/${ctx.projectId}`);
  } else {
    await get(EXPENSE_PATH);
  }
  return resolveExpenseContext({
    projectId: ctx.projectId,
    entityId: ctx.expenseId,
    path: ctx.path,
  });
}

export async function advanceExpenseApproval(projectIdOrRow, expenseId) {
  let ctx =
    typeof projectIdOrRow === "object" && projectIdOrRow !== null
      ? resolveExpenseContext(projectIdOrRow)
      : resolveExpenseContext({
          projectId: projectIdOrRow,
          entityId: expenseId,
          path: expenseStoragePath(projectIdOrRow, expenseId),
        });
  ctx = await ensureExpenseContextLoaded(ctx);
  await assertExpensePendingApproval(ctx);

  const { projectId, expenseId: eid, path, cur } = ctx;

  const project = getProject(projectId);
  const gov = isGovProject(project);
  const role = normalizeRole(getCurrentRole());

  if (gov) {
    const stage = cur.approvalStage || "pm";
    if (!canRoleApproveExpenseStage(stage, role)) {
      throw new Error(`Your role cannot approve at ${EXPENSE_STAGE_LABELS[stage] || stage} stage`);
    }
    const next = nextGovExpenseStage(stage);
    if (next) {
      const now = Date.now();
      await updatePath(path, {
        ...cur,
        approvalStage: next,
        updatedAt: now,
        lastApprovedBy: getCurrentUserId(),
        lastApprovedAt: now,
      });
      await clearApprovalQueue("projectExpense", eid);
      await upsertApprovalQueue({
        entityType: "projectExpense",
        entityId: eid,
        projectId,
        path,
        title: `${expenseTitle(cur)} (${EXPENSE_STAGE_LABELS[next]})`,
        status: "pending",
        approvalStage: next,
        submittedAt: cur.submittedAt || now,
      });
      await writeAuditLog({
        entityType: "projectExpense",
        entityId: eid,
        action: "stage_approve",
        diffSummary: `${EXPENSE_STAGE_LABELS[stage]} approved → ${EXPENSE_STAGE_LABELS[next]}`,
        projectId,
      });
      await refreshReports();
      return;
    }
    await finalizeExpenseApproval(projectId, eid, cur);
    return;
  }

  if (!canRoleApproveExpenseStage("accountant", role) && !canRoleApproveExpenseStage("pm", role) && role !== "owner") {
    guardAction("approve_expense");
  }
  await finalizeExpenseApproval(projectId, eid, cur);
}

export async function rejectProjectExpense(projectIdOrRow, expenseId, reason = "") {
  guardAction("approve_expense");
  let ctx =
    typeof projectIdOrRow === "object" && projectIdOrRow !== null
      ? resolveExpenseContext(projectIdOrRow)
      : resolveExpenseContext({
          projectId: projectIdOrRow,
          entityId: expenseId,
          path: expenseStoragePath(projectIdOrRow, expenseId),
        });
  ctx = await ensureExpenseContextLoaded(ctx);
  await assertExpensePendingApproval(ctx);

  const { projectId, expenseId: eid, path, cur } = ctx;
  const now = Date.now();
  await updatePath(path, {
    ...cur,
    status: "rejected",
    approvalStage: "",
    rejectionReason: reason || "",
    rejectedBy: getCurrentUserId(),
    rejectedAt: now,
    updatedAt: now,
  });
  await clearApprovalQueue("projectExpense", eid);
  await writeAuditLog({
    entityType: "projectExpense",
    entityId: eid,
    action: "reject",
    diffSummary: `Rejected: ${expenseTitle(cur)}`,
    projectId,
  });
  await refreshReports();
}

export async function reopenProjectExpense(projectId, expenseId) {
  const path = expenseStoragePath(projectId, expenseId);
  const cur = readRef(path) || {};
  if ((cur.status || "draft") !== "rejected") throw new Error("Only rejected expenses can be reopened");
  await updatePath(path, {
    ...cur,
    status: "draft",
    approvalStage: "",
    updatedAt: Date.now(),
  });
}

/**
 * HTML action buttons for expense rows on Accounting page.
 */
export function expenseActionButtons(expense, projectId) {
  const st = expense.status || "draft";
  const project = getProject(projectId);
  const gov = isGovProject(project);
  const role = normalizeRole(getCurrentRole());
  const btns = [];

  if (st === "draft" || st === "rejected") {
    btns.push(
      `<button type="button" class="btn btn-primary btn-sm exp-submit" data-pid="${projectId}" data-id="${expense.id}">Submit</button>`
    );
  }
  if (st === "submitted") {
    let canApprove = false;
    if (gov) {
      canApprove = canRoleApproveExpenseStage(expense.approvalStage || "pm", role);
    } else {
      canApprove =
        role === "owner" ||
        canRoleApproveExpenseStage("pm", role) ||
        canRoleApproveExpenseStage("accountant", role);
    }
    if (canApprove) {
      const label = gov ? `Approve (${EXPENSE_STAGE_LABELS[expense.approvalStage] || expense.approvalStage})` : "Approve";
      btns.push(
        `<button type="button" class="btn btn-primary btn-sm exp-approve" data-pid="${projectId}" data-id="${expense.id}">${label}</button>`
      );
      btns.push(
        `<button type="button" class="btn btn-ghost btn-sm exp-reject" data-pid="${projectId}" data-id="${expense.id}">Reject</button>`
      );
    }
  }
  if (st === "rejected") {
    btns.push(
      `<button type="button" class="btn btn-ghost btn-sm exp-reopen" data-pid="${projectId}" data-id="${expense.id}">Reopen</button>`
    );
  }
  return btns.length ? btns.join(" ") : "—";
}
