/**
 * Release 4 — dispute and arbitration lifecycle.
 */
import { create, updatePath } from "./svc_data.js";
import { resolveRead, getActiveTenantId } from "./svc_tenant.js";

import { getCurrentUserId } from "./svc_auth.js";
import { writeAuditLog } from "./svc_workflow.js";
import { guardAction, upsertApprovalQueue, clearApprovalQueue } from "./svc_governance.js";

export const ARBITRATION_STATES = ["draft", "submitted", "review", "hearing", "award", "closed"];

const TRANSITIONS = {
  draft: ["submitted"],
  submitted: ["review", "closed"],
  review: ["hearing", "closed"],
  hearing: ["award", "closed"],
  award: ["closed"],
  closed: [],
};

export function canArbitrationTransition(from, to) {
  const f = String(from || "draft").toLowerCase();
  return (TRANSITIONS[f] || []).includes(String(to).toLowerCase());
}

export function queueEntityType(collection) {
  return collection === "disputes" ? "dispute" : "arbitrationCase";
}

function baseFields() {
  const now = Date.now();
  return {
    tenantId: getActiveTenantId(),
    status: "draft",
    createdAt: now,
    updatedAt: now,
    createdBy: getCurrentUserId(),
    submittedBy: null,
    submittedAt: null,
    approvedBy: null,
    approvedAt: null,
  };
}

async function refreshCache() {
  const { refreshReportsCacheClient } = await import("./svc_operations.js");
  await refreshReportsCacheClient();
}

/**
 * @param {object} opts
 */
export async function applyArbitrationTransition({
  collection,
  entityId,
  title,
  to,
  patchExtra = {},
  onTransition,
}) {
  if (to === "submitted") {
    guardAction("submit_dispute");
  } else {
    guardAction("arbitration_decide");
  }

  const path = `${collection}/${entityId}`;
  const cur = resolveRead(path) || {};
  const from = cur.status || "draft";
  if (!canArbitrationTransition(from, to)) {
    throw new Error(`Invalid arbitration transition: ${from} → ${to}`);
  }

  const now = Date.now();
  const patch = { status: to, updatedAt: now, ...patchExtra };
  const qType = queueEntityType(collection);

  if (to === "submitted") {
    patch.submittedBy = getCurrentUserId();
    patch.submittedAt = now;
    await upsertApprovalQueue({
      entityType: qType,
      entityId,
      projectId: cur.projectId || "",
      title: title || entityId,
      path,
      workflowProfile: "arbitration",
      status: "pending",
      submittedBy: getCurrentUserId(),
      submittedAt: now,
    });
  }

  if (to === "review" || to === "closed" || to === "award") {
    await clearApprovalQueue(qType, entityId);
  }

  if (to === "review") {
    patch.reviewedBy = getCurrentUserId();
    patch.reviewedAt = now;
  }
  if (to === "award") {
    patch.awardedAt = now;
  }

  await updatePath(path, { ...cur, ...patch });

  if (onTransition) await onTransition({ ...cur, ...patch });
  await writeAuditLog({
    entityType: qType,
    entityId,
    action: "arbitration_transition",
    diffSummary: `${title || entityId}: ${from} → ${to}`,
    tenantId: getActiveTenantId(),
  });
  await refreshCache();
}

export async function createDispute(data) {
  guardAction("create_dispute");
  const id = await create("disputes", {
    ...baseFields(),
    ...data,
  });
  await writeAuditLog({
    entityType: "dispute",
    entityId: id,
    action: "create",
    diffSummary: `Dispute opened: ${data.title}`,
    tenantId: getActiveTenantId(),
  });
  await refreshCache();
  return id;
}

export async function createArbitrationCase(disputeId, data) {
  guardAction("create_arbitration_case");
  const id = await create("arbitrationCases", {
    ...baseFields(),
    disputeId,
    ...data,
  });
  await writeAuditLog({
    entityType: "arbitrationCase",
    entityId: id,
    action: "create",
    diffSummary: `Arbitration case for dispute ${disputeId}`,
    tenantId: getActiveTenantId(),
  });
  await refreshCache();
  return id;
}

export async function createHearing(caseId, data) {
  guardAction("schedule_hearing");
  const id = await create(`arbitrationHearings/${caseId}`, {
    ...data,
    caseId,
    status: data.status || "scheduled",
    tenantId: getActiveTenantId(),
    createdAt: Date.now(),
    updatedAt: Date.now(),
    source: "demo",
  });
  await refreshCache();
  return id;
}
