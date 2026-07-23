/** Demo RBAC users — session switch (no separate login). */

import { readRef, getActiveTenantId } from "./svc_tenant.js";
import { setCurrentUser, getCurrentUser, getCurrentUserId } from "./svc_auth.js";
import { invalidateRoleCache, listRoleUsers } from "./svc_governance.js";
import { refreshSidebarNav, syncSidebarUserFoot } from "./cmp_layout.js";
import { syncHeaderUser, applyRouteChrome } from "./cmp_header.js";
import { defaultRouteForRole, roleLabel, canAccessRoute } from "./util_roles.js";
import { navigateTo, getRoutePath } from "./util_route.js";
import { showToast } from "./cmp_toast.js";

export const DEMO_ROLE_USERS = [
  { id: "demo-user", role: "owner", displayName: "Owner Admin", email: "owner@demo.com" },
  { id: "demo-pm", role: "project_manager", displayName: "PM Rahman", email: "pm@demo.com" },
  { id: "demo-site-eng", role: "site_engineer", displayName: "Site Engineer Karim", email: "engineer@demo.com" },
  { id: "demo-site-sup", role: "site_supervisor", displayName: "Site Supervisor Ali", email: "supervisor@demo.com" },
  { id: "demo-accountant", role: "accountant", displayName: "Finance Suma", email: "finance@demo.com" },
  { id: "demo-procurement", role: "procurement_officer", displayName: "Procurement Nasir", email: "procurement@demo.com" },
  {
    id: "demo-client",
    role: "client",
    displayName: "Client Rahim",
    email: "rahim@demo.com",
    clientId: "client_1",
  },
];

export function listDemoRoleUsers() {
  return DEMO_ROLE_USERS.map((def) => {
    const row = readRef(`roles/${def.id}`) || {};
    return { ...def, ...row, id: def.id };
  });
}

/** All active employees for session switch (demo RBAC testing). */
export function listSessionSwitchUsers() {
  return listRoleUsers().filter((u) => u.active !== false && !u.deletedAt);
}

/**
 * Switch browser session to another demo user (Firebase roles/{id}).
 * @param {string} userId
 * @param {{ navigate?: boolean, toast?: boolean }} [opts]
 */
export function switchDemoUser(userId, opts = {}) {
  const { navigate = true, toast = true } = opts;
  const row = readRef(`roles/${userId}`);
  if (!row || row.deletedAt) throw new Error("User not found");
  if (row.active === false) throw new Error("User is not active");

  const def = DEMO_ROLE_USERS.find((u) => u.id === userId);
  const role = row.role || def?.role || "viewer";
  const prev = getCurrentUser();
  setCurrentUser({
    id: userId,
    name: row.displayName || def?.displayName || row.email || userId,
    email: row.email || def?.email || "",
    role,
    clientId: row.clientId || def?.clientId || "",
    tenantId: row.tenantId || prev?.tenantId || getActiveTenantId(),
  });
  invalidateRoleCache();
  refreshSidebarNav();
  syncSidebarUserFoot();
  syncHeaderUser();

  if (navigate) {
    const target = defaultRouteForRole(role);
    const current = getRoutePath();
    if (current === target && canAccessRoute(role, current)) {
      applyRouteChrome();
    }
    navigateTo(target);
  }
  if (toast) {
    showToast(`Switched to ${row.displayName || roleLabel(role)}`);
  }
  return { id: userId, role, displayName: row.displayName };
}

export function isDemoUserId(userId) {
  return DEMO_ROLE_USERS.some((u) => u.id === userId);
}

export function getActiveDemoUserLabel() {
  const id = getCurrentUserId();
  const def = DEMO_ROLE_USERS.find((u) => u.id === id);
  const row = readRef(`roles/${id}`) || {};
  return row.displayName || def?.displayName || "User";
}
