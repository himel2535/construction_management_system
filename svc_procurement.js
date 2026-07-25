/** Purchase order approval workflow */

import { readRef, updatePath } from "./svc_data.js";
import { getCurrentUserId } from "./svc_auth.js";
import { checkBudgetForApproval } from "./svc_projectCost.js";
import { writeAuditLog } from "./svc_workflow.js";
import { syncMrOnPoApprove } from "./svc_materialRequest.js";
import { clearApprovalQueue, canPerformAction } from "./svc_governance.js";
import { formatBDT } from "./util_format.js";

function poPath(projectId, poId) {
  return `purchaseOrders/${projectId}/${poId}`;
}

/**
 * Approve a draft purchase order (Procurement tab or Approvals inbox).
 * @param {string} projectId
 * @param {string} poId
 */
export async function approvePurchaseOrder(projectId, poId) {
  if (!canPerformAction("approve_purchase_order")) {
    throw new Error("You cannot approve POs with your role");
  }
  const path = poPath(projectId, poId);
  const cur = readRef(path);
  if (!cur) {
    throw new Error("PO not found — refresh the page and try again");
  }
  if (cur.status !== "draft") {
    throw new Error(`PO is already ${cur.status || "processed"}`);
  }
  const amount = Number(cur.amount) || 0;
  const check = checkBudgetForApproval(projectId, amount);
  if (!check.ok) {
    throw new Error(check.message);
  }
  const now = Date.now();
  await updatePath(path, {
    ...cur,
    status: "approved",
    approvedBy: getCurrentUserId(),
    approvedAt: now,
    updatedAt: now,
  });
  if (cur.mrId) {
    await syncMrOnPoApprove(projectId, poId, cur.mrId);
  }
  await clearApprovalQueue("purchase_order", poId);
  await clearApprovalQueue("purchaseOrder", poId);
  await writeAuditLog({
    entityType: "purchaseOrder",
    entityId: poId,
    action: "approve",
    diffSummary: `PO approved ${formatBDT(amount)}`,
    projectId,
  });
  return { ...cur, status: "approved" };
}

/**
 * Reject a draft purchase order from the Approvals inbox.
 * @param {string} projectId
 * @param {string} poId
 */
export async function rejectPurchaseOrder(projectId, poId) {
  if (!canPerformAction("approve_purchase_order")) {
    throw new Error("You cannot reject POs with your role");
  }
  const path = poPath(projectId, poId);
  const cur = readRef(path);
  if (!cur || cur.status !== "draft") {
    throw new Error("PO cannot be rejected");
  }
  const now = Date.now();
  await updatePath(path, {
    ...cur,
    status: "rejected",
    rejectedBy: getCurrentUserId(),
    rejectedAt: now,
    updatedAt: now,
  });
  await clearApprovalQueue("purchase_order", poId);
  await clearApprovalQueue("purchaseOrder", poId);
  await writeAuditLog({
    entityType: "purchaseOrder",
    entityId: poId,
    action: "status_change",
    diffSummary: `PO rejected ${formatBDT(cur.amount)}`,
    projectId,
  });
}
