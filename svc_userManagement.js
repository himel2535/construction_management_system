import { updatePath, readRef } from "./svc_data.js";
import { getCurrentUserId } from "./svc_auth.js";
import { guardAction, listRoleUsers } from "./svc_governance.js";
import { writeAuditLog } from "./svc_workflow.js";
import { normalizeRole } from "./util_roles.js";
import { sanitizeAuditState } from "./util_audit.js";

function uid() {
  return `usr_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

export function isUserActive(userId) {
  const row = readRef(`roles/${userId}`);
  return row && row.active !== false && !row.deletedAt;
}

/**
 * @param {{ displayName: string, email: string, role: string }} payload
 */
export async function createEmployee(payload) {
  guardAction("manage_users");
  const name = String(payload.displayName || "").trim();
  const email = String(payload.email || "").trim();
  const role = normalizeRole(payload.role || "site_engineer");
  if (!name) throw new Error("Name is required");
  if (!email) throw new Error("Email is required");

  const existing = listRoleUsers().find((u) => u.email?.toLowerCase() === email.toLowerCase());
  if (existing && !existing.deletedAt) throw new Error("User with this email already exists");

  const id = existing?.id || uid();
  const now = Date.now();
  const row = {
    displayName: name,
    email,
    role,
    active: true,
    createdAt: now,
    updatedAt: now,
    createdBy: getCurrentUserId(),
  };
  await updatePath(`roles/${id}`, row);
  await writeAuditLog({
    entityType: "user",
    entityId: id,
    action: "create",
    actionType: "create",
    diffSummary: `Added employee ${name} (${role})`,
    afterState: sanitizeAuditState(row),
  });
  return id;
}

export async function deactivateUser(userId) {
  guardAction("manage_users");
  if (userId === getCurrentUserId()) throw new Error("Cannot deactivate your own account");
  const cur = readRef(`roles/${userId}`);
  if (!cur) throw new Error("User not found");
  const after = { ...cur, active: false, deactivatedAt: Date.now(), updatedAt: Date.now() };
  await updatePath(`roles/${userId}`, after);
  await writeAuditLog({
    entityType: "user",
    entityId: userId,
    action: "update",
    actionType: "update",
    diffSummary: `Deactivated ${cur.displayName || userId}`,
    beforeState: sanitizeAuditState(cur),
    afterState: sanitizeAuditState(after),
  });
}

export async function reactivateUser(userId) {
  guardAction("manage_users");
  const cur = readRef(`roles/${userId}`);
  if (!cur) throw new Error("User not found");
  const after = { ...cur, active: true, deactivatedAt: null, updatedAt: Date.now() };
  await updatePath(`roles/${userId}`, after);
  await writeAuditLog({
    entityType: "user",
    entityId: userId,
    action: "update",
    actionType: "update",
    diffSummary: `Reactivated ${cur.displayName || userId}`,
    beforeState: sanitizeAuditState(cur),
    afterState: sanitizeAuditState(after),
  });
}

export async function removeEmployee(userId) {
  guardAction("manage_users");
  if (userId === getCurrentUserId()) throw new Error("Cannot remove your own account");
  const cur = readRef(`roles/${userId}`);
  if (!cur) throw new Error("User not found");
  const after = { ...cur, active: false, deletedAt: Date.now(), updatedAt: Date.now() };
  await updatePath(`roles/${userId}`, after);
  await writeAuditLog({
    entityType: "user",
    entityId: userId,
    action: "delete",
    actionType: "delete",
    diffSummary: `Removed employee ${cur.displayName || userId}`,
    beforeState: sanitizeAuditState(cur),
    afterState: sanitizeAuditState(after),
  });
}
