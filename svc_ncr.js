import { create, updatePath } from "./svc_data.js";
import { readRef } from "./svc_tenant.js";
import { getCurrentUserId } from "./svc_auth.js";
import { writeAuditLog } from "./svc_workflow.js";
import { guardAction } from "./svc_governance.js";
import { R3_PATHS } from "./svc_governance.js";
import { canAdvanceNcrResolution } from "./util_ncr.js";

export async function createNcr(projectId, data) {
  guardAction("create_safety");
  const now = Date.now();
  const id = await create(`${R3_PATHS.ncrReports}/${projectId}`, {
    projectId,
    title: String(data.title || "").trim(),
    description: String(data.description || "").trim(),
    severity: data.severity || "medium",
    correctiveAction: String(data.correctiveAction || "").trim(),
    phaseId: data.phaseId || "",
    resolutionStatus: "open",
    status: "draft",
    createdAt: now,
    updatedAt: now,
    createdBy: getCurrentUserId(),
  });
  await writeAuditLog({
    entityType: "ncrReport",
    entityId: id,
    action: "create",
    diffSummary: `NCR: ${data.title}`,
    projectId,
  });
  return id;
}

export async function updateNcrResolution(projectId, ncrId, resolutionStatus) {
  const path = `${R3_PATHS.ncrReports}/${projectId}/${ncrId}`;
  const cur = readRef(path) || {};
  const from = cur.resolutionStatus || "open";
  if (!canAdvanceNcrResolution(from, resolutionStatus)) {
    throw new Error(`Cannot move NCR from ${from} to ${resolutionStatus}`);
  }
  const now = Date.now();
  const patch = {
    ...cur,
    resolutionStatus,
    updatedAt: now,
    resolvedBy: getCurrentUserId(),
    resolvedAt: resolutionStatus === "resolved" || resolutionStatus === "closed" ? now : cur.resolvedAt,
  };
  if (resolutionStatus === "closed") patch.status = "closed";
  await updatePath(path, patch);
  await writeAuditLog({
    entityType: "ncrReport",
    entityId: ncrId,
    action: "status_change",
    diffSummary: `NCR ${cur.title}: ${from} → ${resolutionStatus}`,
    projectId,
  });
}

export async function closeNcr(projectId, ncrId) {
  return updateNcrResolution(projectId, ncrId, "closed");
}
