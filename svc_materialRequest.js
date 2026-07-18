/** Material request workflow and delivery sync from PO/GRN */

import { updatePath, readRef } from "./svc_data.js";
import { getCurrentUserId } from "./svc_auth.js";
import { deriveDeliveryStatus } from "./util_materialRequest.js";

export async function submitMaterialRequest(projectId, mrId) {
  const cur = readRef(`materialRequests/${projectId}/${mrId}`) || {};
  await updatePath(`materialRequests/${projectId}/${mrId}`, {
    ...cur,
    status: "submitted",
    deliveryStatus: "requested",
    submittedAt: Date.now(),
    requestedBy: getCurrentUserId(),
    updatedAt: Date.now(),
  });
}

export async function approveMaterialRequest(projectId, mrId) {
  const cur = readRef(`materialRequests/${projectId}/${mrId}`) || {};
  if (cur.requestType === "central") {
    return approveCentralRequisition(projectId, mrId);
  }
  await updatePath(`materialRequests/${projectId}/${mrId}`, {
    ...cur,
    status: "approved",
    deliveryStatus: "approved",
    approvedAt: Date.now(),
    approvedBy: getCurrentUserId(),
    updatedAt: Date.now(),
  });
}

export async function approveCentralRequisition(projectId, mrId) {
  const cur = readRef(`materialRequests/${projectId}/${mrId}`) || {};
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
  const mr = readRef(`materialRequests/${projectId}/${mrId}`) || {};
  await updatePath(`materialRequests/${projectId}/${mrId}`, {
    ...mr,
    poId,
    deliveryStatus: "ordered",
    updatedAt: Date.now(),
  });
}

export async function syncMrDeliveryFromGrn(projectId, poId) {
  const pos = Object.entries(readRef(`purchaseOrders/${projectId}`) || {}).map(([id, row]) => ({
    id,
    ...row,
  }));
  const grns = Object.entries(readRef(`goodsReceipts/${projectId}`) || {}).map(([id, row]) => ({
    id,
    ...row,
  }));
  const po = pos.find((p) => p.id === poId);
  if (!po?.mrId) return;
  const mr = readRef(`materialRequests/${projectId}/${po.mrId}`);
  if (!mr) return;
  const status = deriveDeliveryStatus({ ...mr, poId: po.id }, pos, grns);
  await updatePath(`materialRequests/${projectId}/${po.mrId}`, {
    ...mr,
    poId: po.id,
    deliveryStatus: status,
    updatedAt: Date.now(),
  });
}
