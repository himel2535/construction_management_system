/** System-wide role labels, nav access, and route guards */

export const ROLE_LABELS = {
  owner: "Owner / Admin",
  project_manager: "Project Manager",
  site_engineer: "Site Engineer",
  site_supervisor: "Site Supervisor",
  accountant: "Accountant / Finance",
  procurement_officer: "Procurement Officer",
  client: "Client (Portal)",
  manager: "Project Manager",
  viewer: "Viewer",
};

export const ALL_ROLES = [
  "owner",
  "project_manager",
  "site_engineer",
  "site_supervisor",
  "accountant",
  "procurement_officer",
  "client",
];

/** Requirements doc §1.3 — role descriptions */
export const ROLE_DESCRIPTIONS = {
  owner: "Full access; manages company, all projects, users, and permissions",
  project_manager: "Manages assigned project(s) end-to-end — schedule, budget, team, reporting",
  site_engineer: "Field execution, daily progress entry, quality checks",
  site_supervisor: "Labor and material supervision at site level",
  accountant: "Budget, billing, payments, payroll",
  procurement_officer: "Vendor, purchase order, material management",
  client: "View-only access to their project's progress and billing",
  manager: "Manages assigned project(s) end-to-end — schedule, budget, team, reporting",
  viewer: "Read-only dashboard and reports",
};

export const RESPONSIBLE_ROLES = [
  "project_manager",
  "site_engineer",
  "site_supervisor",
  "accountant",
  "procurement_officer",
];

/** RACI matrix roles (§2.4) */
export const RACI_TYPES = ["R", "A", "C", "I"];

export const RACI_LABELS = {
  R: "Responsible",
  A: "Accountable",
  C: "Consulted",
  I: "Informed",
};

/** Nav module keys allowed per role */
export const ROLE_NAV = {
  owner: ["*"],
  project_manager: [
    "dashboard",
    "clients",
    "projects",
    "workers",
    "site-incharge",
    "approvals",
    "reports",
    "settings",
  ],
  site_engineer: ["dashboard", "projects", "site-incharge", "approvals", "settings"],
  site_supervisor: ["dashboard", "projects", "site-incharge", "workers", "settings"],
  accountant: ["dashboard", "clients", "billing", "accounting", "reports", "approvals", "settings"],
  procurement_officer: ["dashboard", "purchases", "suppliers", "inventory", "reports", "settings"],
  client: ["client-portal", "settings"],
  manager: [
    "dashboard",
    "clients",
    "projects",
    "workers",
    "site-incharge",
    "approvals",
    "reports",
    "settings",
  ],
  viewer: ["dashboard", "reports", "settings"],
};

const HASH_TO_NAV = {
  "/dashboard": "dashboard",
  "/clients": "clients",
  "/customers": "clients",
  "/projects": "projects",
  "/billing": "billing",
  "/sales": "billing",
  "/accounting": "accounting",
  "/purchases": "purchases",
  "/suppliers": "suppliers",
  "/inventory": "inventory",
  "/assets": "assets",
  "/workers": "workers",
  "/site-incharge": "site-incharge",
  "/approvals": "approvals",
  "/arbitration": "arbitration",
  "/reports": "reports",
  "/settings": "settings",
  "/client-portal": "client-portal",
};

export function normalizeRole(role) {
  if (role === "manager") return "project_manager";
  return role || "owner";
}

export function roleLabel(role) {
  return ROLE_LABELS[normalizeRole(role)] || role || "User";
}

export function roleDescription(role) {
  return ROLE_DESCRIPTIONS[normalizeRole(role)] || "";
}

export function getNavForRole(role) {
  const r = normalizeRole(role);
  return ROLE_NAV[r] || ROLE_NAV.viewer;
}

export function navKeyFromPath(path) {
  const p = path.split("?")[0];
  if (p.startsWith("/projects")) return "projects";
  if (p.startsWith("/clients") || p.startsWith("/customers")) return "clients";
  return HASH_TO_NAV[p] || null;
}

export function canAccessRoute(role, path) {
  const allowed = getNavForRole(role);
  if (allowed.includes("*")) return true;
  const key = navKeyFromPath(path);
  if (!key) return allowed.includes("*");
  return allowed.includes(key);
}

export function defaultRouteForRole(role) {
  const r = normalizeRole(role);
  if (r === "client") return "/client-portal";
  return "/dashboard";
}

export function filterNavItems(navItems, role) {
  const allowed = getNavForRole(role);
  if (allowed.includes("*")) return navItems;
  return navItems.filter((item) => {
    const key = navKeyFromPath(item.path || item.hash?.replace("#", "") || "");
    return key && allowed.includes(key);
  });
}
