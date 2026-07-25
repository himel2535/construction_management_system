import { createNotification } from "./svc_notifications.js";
import { getCurrentUserId } from "./svc_auth.js";
import { listRoleUsers, getCurrentRole } from "./svc_governance.js";
import { canRoleDecideQueueRow } from "./util_approvalQueue.js";
import { resolveActionGuidance, ACTION_GUIDANCE } from "./util_actionGuidance.js";
import { normalizeRole } from "./util_roles.js";
import { roleHasAction } from "./util_roleActions.js";

const recentKeys = new Set();
const DEDUPE_MS = 8000;

function dedupeKey(parts) {
  return parts.filter(Boolean).join(":");
}

function shouldSkip(key) {
  if (recentKeys.has(key)) return true;
  recentKeys.add(key);
  setTimeout(() => recentKeys.delete(key), DEDUPE_MS);
  return false;
}

function usersForRoles(roles = []) {
  const want = new Set(roles.map((r) => normalizeRole(r)));
  return listRoleUsers().filter((u) => u.active !== false && !u.deletedAt && want.has(normalizeRole(u.role)));
}

function usersWhoCanApproveCentralReq() {
  return listRoleUsers().filter(
    (u) =>
      u.active !== false &&
      !u.deletedAt &&
      (roleHasAction(normalizeRole(u.role), "approve_central_requisition") ||
        roleHasAction(normalizeRole(u.role), "approve"))
  );
}

/**
 * @param {string} actionKey
 * @param {object} ctx
 * @param {ReturnType<typeof resolveActionGuidance>} [resolved]
 */
export async function emitActionNotifications(actionKey, ctx = {}, resolved = null) {
  const guidance = resolved || resolveActionGuidance(actionKey, ctx);
  if (!guidance) return;

  const actorId = getCurrentUserId();
  const entityId = guidance.entityId || ctx.entityId || "";

  if (guidance.notifySelf && actorId) {
    const dk = dedupeKey(["self", actionKey, entityId, actorId]);
    if (!shouldSkip(dk)) {
      await createNotification(actorId, {
        type: "action_reminder",
        title: guidance.notifySelf.title || "Action completed",
        message: guidance.notifySelf.message || "",
        link: guidance.notifySelf.link || "",
        projectId: guidance.projectId || ctx.projectId || "",
        meta: { actionKey, entityId, role: "submitter" },
      });
    }
  }

  if (guidance.notifyRolePayload) {
    let targets = [];
    if (actionKey === "central_requisition_submit") {
      targets = usersWhoCanApproveCentralReq();
    } else if (guidance.notifyRoles?.length) {
      targets = usersForRoles(guidance.notifyRoles);
    }

    for (const user of targets) {
      if (user.id === actorId) continue;
      const dk = dedupeKey(["role", actionKey, entityId, user.id]);
      if (shouldSkip(dk)) continue;
      await createNotification(user.id, {
        type: guidance.notifyRolePayload.type || "action_handoff",
        title: guidance.notifyRolePayload.title || "Action required",
        message: guidance.notifyRolePayload.message || "",
        link: guidance.notifyRolePayload.link || "",
        projectId: guidance.projectId || ctx.projectId || "",
        meta: { actionKey, entityId, targetRole: user.role },
      });
    }
  }
}

/**
 * Notify approvers when an item enters approvalQueue.
 * @param {object} item
 */
export async function notifyApprovalQueueHandoff(item) {
  if (!item || item.status !== "pending") return;

  const actorId = getCurrentUserId();
  const entityId = item.entityId || "";
  const dk = dedupeKey(["queue", item.entityType, entityId]);
  if (shouldSkip(dk)) return;

  const users = listRoleUsers().filter((u) => u.active !== false && !u.deletedAt);
  for (const user of users) {
    if (user.id === actorId) continue;
    if (!canRoleDecideQueueRow(item, user.role)) continue;
    const nKey = dedupeKey(["queue-user", item.entityType, entityId, user.id]);
    if (shouldSkip(nKey)) continue;
    await createNotification(user.id, {
      type: "approval",
      title: item.title ? `Approval: ${item.title}` : "Approval required",
      message: `Review in Approvals inbox (${item.entityType || "item"})`,
      link: "/approvals",
      projectId: item.projectId || "",
      meta: { entityType: item.entityType, entityId, queueHandoff: true },
    });
  }
}

export { ACTION_GUIDANCE, resolveActionGuidance };
