/** Demo RBAC users — session switch (no separate login). */

import { readRef } from "./svc_tenant.js";
import { setCurrentUser, getCurrentUserId } from "./svc_auth.js";
import { guardAction, invalidateRoleCache, canPerformAction } from "./svc_governance.js";
import { refreshSidebarNav } from "./cmp_layout.js";
import { syncHeaderUser } from "./cmp_header.js";
import { defaultRouteForRole, roleLabel } from "./util_roles.js";
import { navigateTo } from "./util_route.js";
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

/**
 * Switch browser session to another demo user (Firebase roles/{id}).
 * @param {string} userId
 * @param {{ navigate?: boolean, toast?: boolean }} [opts]
 */
export function switchDemoUser(userId, opts = {}) {
  const { navigate = true, toast = true } = opts;
  const targetIsDemo = isDemoUserId(userId);
  const currentIsDemo = isDemoUserId(getCurrentUserId());
  if (!targetIsDemo || (!currentIsDemo && !canPerformAction("manage_users"))) {
    guardAction("manage_users");
  }

  const def = DEMO_ROLE_USERS.find((u) => u.id === userId);
  const row = readRef(`roles/${userId}`) || def;
  if (!row) throw new Error("User not found");
  if (row.active === false || row.deletedAt) throw new Error("User is not active");

  const role = row.role || def?.role || "owner";
  setCurrentUser({
    id: userId,
    name: row.displayName || def?.displayName || row.email || userId,
    email: row.email || def?.email || "",
    role,
  });
  invalidateRoleCache();
  refreshSidebarNav();
  syncHeaderUser();

  if (navigate) navigateTo(defaultRouteForRole(role));
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
