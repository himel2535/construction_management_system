/** Material request workflow and delivery sync from PO/GRN */

import { updatePath, get } from "./svc_data.js";
import { getCurrentUserId } from "./svc_auth.js";
import { deriveDeliveryStatus } from "./util_materialRequest.js";
import { upsertApprovalQueue, clearApprovalQueue, canPerformAction, guardAction } from "./svc_governance.js";

function mrPath(projectId, mrId) {
  return `materialRequests/${projectId}/${mrId}`;
}

export async function submitMaterialRequest(projectId, mrId) {
  guardAction("submit_material_request");
  const path = mrPath(projectId, mrId);
  const curDoc = await get(path);
  const cur = curDoc.val() || {};
  const now = Date.now();
  await updatePath(path, {
    ...cur,
    status: "submitted",
    deliveryStatus: "requested",
    submittedAt: now,
    requestedBy: getCurrentUserId(),
    updatedAt: now,
  });
  await upsertApprovalQueue({
    entityType: "material_request",
    entityId: mrId,
    projectId,
    title: cur.title || mrId,
    path,
    status: "pending",
    submittedAt: now,
    submittedBy: getCurrentUserId(),
  });
}

export async function approveMaterialRequest(projectId, mrId) {
  const path = mrPath(projectId, mrId);
  const curDoc = await get(path);
  const cur = curDoc.val() || {};
  if (cur.requestType === "central") {
    guardAction("approve_central_requisition");
    await approveCentralRequisition(projectId, mrId);
    await clearApprovalQueue("material_request", mrId);
    return;
  }
  guardAction("approve_material_request");
  await updatePath(path, {
    ...cur,
    status: "approved",
    deliveryStatus: "approved",
    approvedAt: Date.now(),
    approvedBy: getCurrentUserId(),
    updatedAt: Date.now(),
  });
  await clearApprovalQueue("material_request", mrId);
}

export async function rejectMaterialRequest(projectId, mrId) {
  guardAction("approve_material_request");
  const path = mrPath(projectId, mrId);
  const curDoc = await get(path);
  const cur = curDoc.val() || {};
  if ((cur.status || "draft") !== "submitted") {
    throw new Error("Material request cannot be rejected");
  }
  await updatePath(path, {
    ...cur,
    status: "rejected",
    rejectedAt: Date.now(),
    rejectedBy: getCurrentUserId(),
    updatedAt: Date.now(),
  });
  await clearApprovalQueue("material_request", mrId);
}

export async function approveCentralRequisition(projectId, mrId) {
  const curDoc = await get(`materialRequests/${projectId}/${mrId}`);
  const cur = curDoc.val() || {};
  if (cur.requestType !== "central") throw new Error("Not a central requisition");
  await updatePath(`materialRequests/${projectId}/${mrId}`, {
    ...cur,
    status: "approved",
    deliveryStatus: "approved",
    approvedAt: Date.now(),
    approvedBy: getCurrentUserId(),
    updatedAt: Date.now(),
  });
}

export async function syncMrOnPoApprove(projectId, poId, mrId) {
  if (!mrId) return;
  const mrDoc = await get(`materialRequests/${projectId}/${mrId}`);
  const mr = mrDoc.val() || {};
  await updatePath(`materialRequests/${projectId}/${mrId}`, {
    ...mr,
    poId,
    deliveryStatus: "ordered",
    updatedAt: Date.now(),
  });
}

export async function syncMrDeliveryFromGrn(projectId, poId) {
  const posData = (await get(`purchaseOrders/${projectId}`)).val() || {};
  const pos = Array.isArray(posData) ? posData : Object.entries(posData).map(([id, row]) => ({ id, ...row }));
  const grnsData = (await get(`goodsReceipts/${projectId}`)).val() || {};
  const grns = Array.isArray(grnsData) ? grnsData : Object.entries(grnsData).map(([id, row]) => ({ id, ...row }));
  const po = pos.find((p) => p.id === poId);
  if (!po?.mrId) return;
  const mr = (await get(`materialRequests/${projectId}/${po.mrId}`)).val();
  if (!mr) return;
  const status = deriveDeliveryStatus({ ...mr, poId: po.id }, pos, grns);
  await updatePath(`materialRequests/${projectId}/${po.mrId}`, {
    ...mr,
    poId: po.id,
    deliveryStatus: status,
    updatedAt: Date.now(),
  });
}
