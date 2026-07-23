import { create, updatePath, getRef } from "./svc_data.js";
import { resolveRead, getActiveTenantId, getDeviceId } from "./svc_tenant.js";
import { getCurrentUser, getCurrentUserId } from "./svc_auth.js";
import { valToList } from "./svc_clientCache.js";
import { canTransition, writeAuditLog, milestoneVariance } from "./svc_workflow.js";
import { postProjectExpense, computeProjectBudgetSummary } from "./svc_projectCost.js";
import { showToast } from "./cmp_toast.js";
import {
  expiryAlertLevel,
  requiresExpiry,
  normalizeDocumentType,
} from "./util_projectDocument.js";

/** Release 3 collection paths */
export const R3_PATHS = {
  qualityChecks: "qualityChecks",
  safetyIncidents: "safetyIncidents",
  changeOrders: "changeOrders",
  contractClaims: "contractClaims",
  ncrReports: "ncrReports",
};

import { normalizeRole, roleLabel, ALL_ROLES } from "./util_roles.js";
import { ROLE_ACTIONS, R4_ACTIONS, roleHasAction } from "./util_roleActions.js";
import { canRoleDecideQueueRow } from "./util_approvalQueue.js";

export { ALL_ROLES, roleLabel, normalizeRole };
export { ROLE_ACTIONS, R4_ACTIONS, roleHasAction };

let cachedRole = "owner";

/**
 * Load current user role — prefer session user.role, then roles cache.
 */
export function getCurrentRole() {
  const session = getCurrentUser();
  if (session?.role) {
    cachedRole = normalizeRole(session.role);
    const entry = (getRef("roles") || {})[session.id || getCurrentUserId()];
    if (entry?.active === false) return "viewer";
    return cachedRole;
  }
  const roles = getRef("roles") || {};
  const entry = roles[getCurrentUserId()];
  if (entry?.active === false) return "viewer";
  if (entry?.role) cachedRole = normalizeRole(entry.role);
  return cachedRole;
}

export function getRoleEntry(userId = getCurrentUserId()) {
  const roles = getRef("roles") || {};
  return roles[userId] || null;
}

export function listRoleUsers() {
  const roles = getRef("roles") || {};
  return Object.entries(roles)
    .map(([id, row]) => ({
      id,
      ...row,
      role: normalizeRole(row.role),
    }))
    .filter((u) => !u.deletedAt);
}

export function invalidateRoleCache() {
  cachedRole = "owner";
  getCurrentRole();
}

/**
 * Projects visible to PM / site roles (owner/accountant see all).
 */
export function getAssignedProjectIds(userId = getCurrentUserId(), role = getCurrentRole()) {
  const r = normalizeRole(role);
  if (r === "owner" || r === "accountant" || r === "procurement_officer") return null;
  const projects = valToList(resolveRead("projects") || {});
  const teamRoot = resolveRead("projectTeamAssignments") || {};
  const teamProjectIds = new Set();
  for (const row of Object.values(teamRoot)) {
    if (row?.userId === userId && row?.status === "active" && row?.projectId) {
      teamProjectIds.add(row.projectId);
    }
  }
  if (r === "client") {
    const entry = getRoleEntry(userId);
    const clientId = entry?.clientId;
    if (!clientId) return [];
    return projects.filter((p) => p.clientId === clientId).map((p) => p.id);
  }
  if (r === "project_manager") {
    return [...new Set([
      ...projects
        .filter((p) => p.projectManagerId === userId || p.ownerId === userId)
        .map((p) => p.id),
      ...teamProjectIds,
    ])];
  }
  if (r === "site_engineer" || r === "site_supervisor") {
    const ids = new Set([
      ...projects
        .filter((p) => p.projectManagerId === userId || p.ownerId === userId)
        .map((p) => p.id),
      ...teamProjectIds,
    ]);
    const msRoot = resolveRead("projectMilestones") || {};
    for (const [pid, bucket] of Object.entries(msRoot)) {
      if (!bucket || typeof bucket !== "object") continue;
      for (const m of Object.values(bucket)) {
        if (m?.ownerId === userId) ids.add(pid);
      }
    }
    return [...ids];
  }
  return [...new Set([
    ...projects
      .filter((p) => p.projectManagerId === userId || p.ownerId === userId)
      .map((p) => p.id),
    ...teamProjectIds,
  ])];
}

export function canViewProject(projectId, userId = getCurrentUserId(), role = getCurrentRole()) {
  const assigned = getAssignedProjectIds(userId, role);
  if (assigned === null) return true;
  return assigned.includes(projectId);
}

/**
 * @param {string} action
 * @param {string} [roleOverride] optional role for matrix / tests
 */
export function canPerformAction(action, roleOverride) {
  const role = normalizeRole(roleOverride ?? getCurrentRole());
  return roleHasAction(role, action);
}

/**
 * @param {string} action
 */
export function guardAction(action) {
  if (!canPerformAction(action)) {
    throw new Error(`Permission denied for role "${getCurrentRole()}"`);
  }
}

/** @param {object} row */
export async function assertCanDecideApprovalQueueRow(row) {
  const role = getCurrentRole();
  let allowed = false;
  if (row?.entityType === "projectExpense") {
    const { canApproveExpenseQueueRow } = await import("./svc_projectExpense.js");
    allowed = canApproveExpenseQueueRow(row, role);
  } else {
    allowed = canRoleDecideQueueRow(row, role);
  }
  if (!allowed) {
    throw new Error(`Permission denied for role "${role}" on ${row?.entityType || "item"}`);
  }
}

/**
 * @param {object} item
 */
export async function upsertApprovalQueue(item) {
  const existing = resolveRead("approvalQueue") || {};
  for (const [id, row] of Object.entries(existing)) {
    if (row.entityType === item.entityType && row.entityId === item.entityId && row.status === "pending") {
      await updatePath(`approvalQueue/${id}`, { ...row, ...item, updatedAt: Date.now() });
      return id;
    }
  }
  return create("approvalQueue", {
    status: "pending",
    createdAt: Date.now(),
    ...item,
  });
}

/**
 * @param {string} entityType
 * @param {string} entityId
 */
export async function clearApprovalQueue(entityType, entityId) {
  const existing = resolveRead("approvalQueue") || {};
  for (const [id, row] of Object.entries(existing)) {
    if (row.entityType === entityType && row.entityId === entityId) {
      await updatePath(`approvalQueue/${id}`, { status: "cleared", updatedAt: Date.now() });
    }
  }
}

/**
 * Whether the entity at row.path is present in the client cache (not merely "pending in queue").
 * @param {object} row
 */
export function isApprovalQueueEntityLoaded(row) {
  if (!row?.path) return false;
  return resolveRead(row.path) !== undefined;
}

function entityMatchesPendingQueueRow(row, entity) {
  if (!entity || typeof entity !== "object") return false;
  if (row.entityType === "projectExpense") {
    return (entity.status || "draft") === "submitted";
  }
  const st = entity.status || "draft";
  return st === "submitted" || st === "pending";
}

/**
 * Queue row is outdated: entity is loaded and no longer awaiting this inbox action.
 * @param {object} row
 */
export function isApprovalQueueRowStale(row) {
  if (!row || row.status !== "pending" || !row.path) return false;
  if (!isApprovalQueueEntityLoaded(row)) return false;
  const entity = resolveRead(row.path);
  return !entityMatchesPendingQueueRow(row, entity);
}

/**
 * Whether an approval queue row still matches a submittable entity in storage.
 * @param {object} row
 */
export function isApprovalQueueRowActionable(row) {
  if (!row || row.status !== "pending" || !row.path) return false;
  if (!isApprovalQueueEntityLoaded(row)) return false;
  const entity = resolveRead(row.path);
  return entityMatchesPendingQueueRow(row, entity);
}

/**
 * Show in Approvals inbox until proven stale (trust queue while entity cache is loading).
 * @param {object} row
 */
export function isApprovalQueueRowVisible(row) {
  if (!row || row.status !== "pending" || !row.path) return false;
  if (isApprovalQueueRowStale(row)) return false;
  return true;
}

/**
 * Apply workflow transition with audit + approval queue sync.
 * @param {object} opts
 */
export async function applyEntityWorkflowTransition({
  path,
  entityType,
  entityId,
  projectId,
  title,
  to,
  requireApproveRole = true,
  onApproved,
  skipQueue = false,
}) {
  const cur = resolveRead(path) || {};
  const from = cur.status || "draft";
  if (!canTransition(from, to)) throw new Error("Invalid status transition");

  if (to === "submitted" && !canPerformAction("submit")) {
    throw new Error("You cannot submit for approval");
  }
  if ((to === "approved" || to === "rejected") && requireApproveRole && !canPerformAction("approve")) {
    throw new Error("You cannot approve or reject");
  }

  const now = Date.now();
  const patch = { status: to, updatedAt: now };
  if (to === "submitted") {
    patch.submittedBy = getCurrentUserId();
    patch.submittedAt = now;
    if (!skipQueue) {
      await upsertApprovalQueue({
        entityType,
        entityId,
        projectId,
        title: title || entityId,
        path,
        status: "pending",
        submittedBy: getCurrentUserId(),
        submittedAt: now,
      });
    }
  }
  if (to === "approved") {
    patch.approvedBy = getCurrentUserId();
    patch.approvedAt = now;
    await clearApprovalQueue(entityType, entityId);
    if (onApproved) await onApproved({ ...cur, ...patch });
  }
  if (to === "rejected" || to === "closed" || to === "draft") {
    await clearApprovalQueue(entityType, entityId);
  }

  await updatePath(path, { ...cur, ...patch });
  await writeAuditLog({
    entityType,
    entityId,
    action: "status_change",
    diffSummary: `${title || entityId}: ${from} → ${to}`,
    projectId: projectId || "",
  });
  const { refreshReportsCacheClient } = await import("./svc_operations.js");
  await refreshReportsCacheClient();
  return patch;
}

/**
 * Process approval inbox action for R1 or arbitration workflows.
 * @param {{ row: object, decision: 'approve'|'reject' }} opts
 */
export async function applyQueueDecision({ row, decision }) {
  if (!row?.path) throw new Error("Queue entry missing path");

  await assertCanDecideApprovalQueueRow(row);

  const isArbitration =
    row.workflowProfile === "arbitration" ||
    row.entityType === "dispute" ||
    row.entityType === "arbitrationCase";

  if (isArbitration) {
    const { applyArbitrationTransition } = await import("./svc_arbitration.js");
    const collection = row.entityType === "arbitrationCase" ? "arbitrationCases" : "disputes";
    const to = decision === "approve" ? "review" : "closed";
    await applyArbitrationTransition({
      collection,
      entityId: row.entityId,
      title: row.title,
      to,
    });
    return;
  }

  if (row.entityType === "projectExpense") {
    const { advanceExpenseApproval, rejectProjectExpense, STALE_APPROVAL_MSG, EXPENSE_LOADING_MSG } =
      await import("./svc_projectExpense.js");
    if (isApprovalQueueRowStale(row)) {
      await clearApprovalQueue("projectExpense", row.entityId);
      throw new Error(STALE_APPROVAL_MSG);
    }
    if (!isApprovalQueueRowActionable(row)) {
      throw new Error(EXPENSE_LOADING_MSG);
    }
    if (decision === "approve") {
      await advanceExpenseApproval(row);
    } else {
      await rejectProjectExpense(row);
    }
    return;
  }

  const entity = resolveRead(row.path) || {};
  const to = decision === "approve" ? "approved" : "rejected";
  await applyEntityWorkflowTransition({
    path: row.path,
    entityType: row.entityType,
    entityId: row.entityId,
    projectId: row.projectId,
    title: row.title,
    to,
    onApproved:
      row.entityType === "changeOrder" && to === "approved"
        ? async () => postChangeOrderExpense(row.projectId, { ...entity, status: to })
        : undefined,
  });
}

/**
 * Build Release 3 report cache slices.
 */
export function computeGovernanceSummaries() {
  const projects = valToList(resolveRead("projects") || {});
  const today = new Date().toISOString().slice(0, 10);

  let qualityOpen = 0;
  let qualityApproved = 0;
  let safetyOpen = 0;
  let safetyCritical = 0;
  let ncrOpen = 0;
  let documentExpiryWarn = 0;
  let documentExpiryCritical = 0;
  const qualityByPhase = [];

  for (const p of projects) {
    const qc = valToList((resolveRead("qualityChecks") || {})[p.id] || {});
    const phaseRoot = resolveRead("projectPhases") || {};
    const phases = valToList(phaseRoot[p.id] || {});
    const phaseMap = new Map(phases.map((ph) => [ph.id, ph.name]));
    const phaseCounts = {};
    qc.forEach((q) => {
      if (q.status === "approved" || q.status === "closed") qualityApproved++;
      else {
        qualityOpen++;
        if (q.phaseId) {
          const name = phaseMap.get(q.phaseId) || q.phaseId;
          phaseCounts[name] = (phaseCounts[name] || 0) + 1;
        }
      }
    });
    for (const [name, count] of Object.entries(phaseCounts)) {
      qualityByPhase.push({ projectId: p.id, projectName: p.name, phaseName: name, openCount: count });
    }
    const si = valToList((resolveRead("safetyIncidents") || {})[p.id] || {});
    si.forEach((s) => {
      if (s.status !== "closed") safetyOpen++;
      if (s.severity === "critical" || s.severity === "high") safetyCritical++;
    });
    const ncrs = valToList((resolveRead("ncrReports") || {})[p.id] || {});
    ncrs.forEach((n) => {
      if ((n.resolutionStatus || "open") !== "closed" && n.status !== "closed") ncrOpen++;
    });
    const docs = valToList((resolveRead("projectDocuments") || {})[p.id] || {});
    docs.forEach((d) => {
      if (!requiresExpiry(normalizeDocumentType(d.type || d.docType))) return;
      const lvl = expiryAlertLevel(d.expiryDate);
      if (lvl === "warn") documentExpiryWarn++;
      if (lvl === "critical") documentExpiryCritical++;
    });
  }

  const queue = valToList(resolveRead("approvalQueue") || {});
  const pendingApprovals = queue
    .filter((q) => q.status === "pending")
    .map((q) => ({
      queueId: q.id,
      entityType: q.entityType,
      title: q.title,
      projectId: q.projectId,
      submittedAt: q.submittedAt,
      ageDays: (q.submittedAt || q.createdAt)
        ? Math.floor((Date.now() - (q.submittedAt || q.createdAt)) / 86400000)
        : 0,
    }));

  let coApprovedValue = 0;
  let coPendingValue = 0;
  let claimExposure = 0;
  const coRoot = resolveRead("changeOrders") || {};
  const clRoot = resolveRead("contractClaims") || {};
  for (const p of projects) {
    valToList(coRoot[p.id] || {}).forEach((co) => {
      const v = co.financialImpact || 0;
      if (co.status === "approved" || co.status === "closed") coApprovedValue += v;
      else if (co.status === "submitted") coPendingValue += v;
    });
    valToList(clRoot[p.id] || {}).forEach((c) => {
      if (c.settlementStatus !== "settled" && c.status !== "closed") claimExposure += c.amount || 0;
    });
  }

  const scheduleVariance = [];
  const msRoot = resolveRead("projectMilestones") || {};
  for (const p of projects) {
    const milestones = valToList(msRoot[p.id] || {});
    let delayed = 0;
    let onTime = 0;
    milestones.forEach((m) => {
      const v = milestoneVariance(m, today);
      if (v.key === "delayed") delayed++;
      else if (v.key === "on_time") onTime++;
    });
    if (milestones.length) {
      scheduleVariance.push({
        projectId: p.id,
        name: p.name,
        milestoneCount: milestones.length,
        delayed,
        onTime,
      });
    }
  }

  const sales = resolveRead("sales") || {};
  const projectPnL = projects.map((p) => {
    const revenue = Object.values(sales)
      .filter((s) => s.projectId === p.id && s.status !== "cancelled")
      .reduce((a, s) => a + (s.totalPrice || 0), 0);
    const cost = computeProjectBudgetSummary(p.id);
    return {
      projectId: p.id,
      name: p.name,
      revenue,
      actualCost: cost.actual,
      margin: revenue - cost.actual,
    };
  });

  return buildGovernanceReturn({
    qualityOpen,
    qualityApproved,
    safetyOpen,
    safetyCritical,
    ncrOpen,
    documentExpiryWarn,
    documentExpiryCritical,
    qualityByPhase,
    pendingApprovals,
    coApprovedValue,
    coPendingValue,
    claimExposure,
    scheduleVariance,
    projectPnL,
  });
}

function buildGovernanceReturn(data) {
  return {
    governanceCompliance: {
      qualityOpen: data.qualityOpen,
      qualityApproved: data.qualityApproved,
      safetyOpen: data.safetyOpen,
      safetyCritical: data.safetyCritical,
      ncrOpen: data.ncrOpen || 0,
      documentExpiryWarn: data.documentExpiryWarn || 0,
      documentExpiryCritical: data.documentExpiryCritical || 0,
      updatedAt: Date.now(),
    },
    hseSummary: {
      qualityOpen: data.qualityOpen,
      safetyOpen: data.safetyOpen,
      safetyCritical: data.safetyCritical,
      ncrOpen: data.ncrOpen || 0,
      qualityByPhase: data.qualityByPhase || [],
      updatedAt: Date.now(),
    },
    documentExpiry: {
      warn: data.documentExpiryWarn || 0,
      critical: data.documentExpiryCritical || 0,
      updatedAt: Date.now(),
    },
    pendingApprovals: data.pendingApprovals,
    changeOrderSummary: {
      approvedValue: data.coApprovedValue,
      pendingValue: data.coPendingValue,
      updatedAt: Date.now(),
    },
    claimExposure: { total: data.claimExposure, updatedAt: Date.now() },
    scheduleVariance: data.scheduleVariance,
    projectPnL: data.projectPnL,
  };
}

/** Release 4 cross-tenant ops, arbitration, and sync health */
export function computeRelease4Summaries() {
  const tenants = valToList(getRef("tenants") || {});
  const disputes = valToList(resolveRead("disputes") || {});
  const cases = valToList(resolveRead("arbitrationCases") || {});
  const deviceId = getDeviceId();
  const queue = valToList(getRef(`offlineQueue/${deviceId}`) || {});
  const conflicts = valToList(getRef(`syncConflicts/${getActiveTenantId()}`) || {});
  const checkpoint = getRef(`syncCheckpoints/${deviceId}`) || {};

  const disputeAging = disputes
    .filter((d) => d.status !== "closed")
    .map((d) => ({
      id: d.id,
      title: d.title,
      status: d.status,
      amount: d.amount || 0,
      ageDays: (d.submittedAt || d.createdAt)
        ? Math.floor((Date.now() - (d.submittedAt || d.createdAt)) / 86400000)
        : 0,
    }));

  return {
    tenantOps: tenants.map((t) => ({
      tenantId: t.id,
      name: t.name,
      code: t.code,
      active: t.active !== false,
    })),
    arbitrationOutcomes: {
      openDisputes: disputes.filter((d) => d.status !== "closed").length,
      inHearing: disputes.filter((d) => d.status === "hearing").length,
      awarded: disputes.filter((d) => d.status === "award").length,
      cases: cases.length,
      updatedAt: Date.now(),
    },
    disputeAging,
    syncHealth: {
      deviceId,
      pendingOps: queue.filter((o) => o.status === "pending").length,
      conflictCount: conflicts.filter((c) => c.status === "open").length,
      lastSyncAt: checkpoint.lastSyncAt || null,
      online: typeof navigator !== "undefined" ? navigator.onLine : true,
      updatedAt: Date.now(),
    },
  };
}

/**
 * HTML workflow action buttons.
 */
export function workflowButtonsHtml(row, path, entityType) {
  const st = row.status || "draft";
  const btns = [];
  const canSubmit =
    entityType === "document" ? canPerformAction("submit_document") : canPerformAction("submit");
  const canApprove =
    entityType === "document" ? canPerformAction("approve_document") : canPerformAction("approve");
  if (canTransition(st, "submitted") && canSubmit) {
    btns.push(
      `<button type="button" class="btn btn-ghost btn-sm wf-btn" data-path="${path}" data-to="submitted" data-entity="${entityType}" data-id="${row.id}">Submit</button>`
    );
  }
  if (canTransition(st, "approved") && canApprove) {
    btns.push(
      `<button type="button" class="btn btn-ghost btn-sm wf-btn" data-path="${path}" data-to="approved" data-entity="${entityType}" data-id="${row.id}">Approve</button>`
    );
  }
  if (canTransition(st, "rejected") && canApprove) {
    btns.push(
      `<button type="button" class="btn btn-ghost btn-sm wf-btn" data-path="${path}" data-to="rejected" data-entity="${entityType}" data-id="${row.id}">Reject</button>`
    );
  }
  if (canTransition(st, "closed") && canApprove) {
    btns.push(
      `<button type="button" class="btn btn-ghost btn-sm wf-btn" data-path="${path}" data-to="closed" data-entity="${entityType}" data-id="${row.id}">Close</button>`
    );
  }
  if (canTransition(st, "draft") && st === "rejected") {
    btns.push(
      `<button type="button" class="btn btn-ghost btn-sm wf-btn" data-path="${path}" data-to="draft" data-entity="${entityType}" data-id="${row.id}">Reopen</button>`
    );
  }
  return btns.length ? `<div class="wf-actions">${btns.join("")}</div>` : "";
}

/**
 * Wire workflow buttons in a host element.
 */
export function wireWorkflowButtons(host, getMeta) {
  host.querySelectorAll(".wf-btn").forEach((btn) => {
    btn.onclick = async () => {
      try {
        const meta = getMeta(btn);
        await applyEntityWorkflowTransition({
          path: btn.dataset.path,
          entityType: btn.dataset.entity || meta.entityType,
          entityId: btn.dataset.id,
          projectId: meta.projectId,
          title: meta.title,
          to: btn.dataset.to,
          onApproved: meta.onApproved,
          skipQueue: meta.skipQueue,
        });
        showToast(`Status: ${btn.dataset.to}`);
      } catch (err) {
        showToast(err.message, "error");
      }
    };
  });
}

export async function postChangeOrderExpense(projectId, co) {
  if (!co.financialImpact || co.financialImpact <= 0) return;
  guardAction("post_expense");
  await postProjectExpense({
    projectId,
    amount: co.financialImpact,
    costCategory: co.costCategory || "overhead",
    narration: `Change order ${co.title}`,
    refType: "changeOrder",
    refId: co.id,
  });
}
