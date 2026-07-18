import { create, updatePath } from "./svc_data.js";
import { readRef, resolveRead } from "./svc_tenant.js";
import { getCurrentUserId } from "./svc_auth.js";
import { valToList } from "./svc_clientCache.js";
import { writeAuditLog } from "./svc_workflow.js";
import {
  guardAction,
  upsertApprovalQueue,
  clearApprovalQueue,
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
  const { refreshReportsCacheClient } = await import("./svc_operations.js");
  await refreshReportsCacheClient();
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

export async function advanceExpenseApproval(projectId, expenseId) {
  const path = expenseStoragePath(projectId, expenseId);
  const cur = readRef(path) || {};
  if ((cur.status || "draft") !== "submitted") throw new Error("Expense is not pending approval");

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
      await clearApprovalQueue("projectExpense", expenseId);
      await upsertApprovalQueue({
        entityType: "projectExpense",
        entityId: expenseId,
        projectId,
        path,
        title: `${expenseTitle(cur)} (${EXPENSE_STAGE_LABELS[next]})`,
        status: "pending",
        approvalStage: next,
        submittedAt: cur.submittedAt || now,
      });
      await writeAuditLog({
        entityType: "projectExpense",
        entityId: expenseId,
        action: "stage_approve",
        diffSummary: `${EXPENSE_STAGE_LABELS[stage]} approved → ${EXPENSE_STAGE_LABELS[next]}`,
        projectId,
      });
      await refreshReports();
      return;
    }
    await finalizeExpenseApproval(projectId, expenseId, cur);
    return;
  }

  if (!canRoleApproveExpenseStage("accountant", role) && !canRoleApproveExpenseStage("pm", role) && role !== "owner") {
    guardAction("approve_expense");
  }
  await finalizeExpenseApproval(projectId, expenseId, cur);
}

export async function rejectProjectExpense(projectId, expenseId, reason = "") {
  guardAction("approve_expense");
  const path = expenseStoragePath(projectId, expenseId);
  const cur = readRef(path) || {};
  if ((cur.status || "draft") !== "submitted") throw new Error("Expense is not pending approval");
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
  await clearApprovalQueue("projectExpense", expenseId);
  await writeAuditLog({
    entityType: "projectExpense",
    entityId: expenseId,
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
