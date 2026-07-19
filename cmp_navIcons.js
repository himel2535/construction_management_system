const ICON_PATH = "assets/icons/nav";

export const NAV_ICON_KEYS = {
  logo: "nav-logo",
  dashboard: "nav-dashboard",
  portal: "nav-portal",
  clients: "nav-clients",
  projects: "nav-projects",
  site: "nav-site",
  finance: "nav-finance",
  procurement: "nav-procurement",
  inventory: "nav-inventory",
  hr: "nav-hr",
  assets: "nav-assets",
  billing: "nav-billing",
  suppliers: "nav-suppliers",
  approvals: "nav-approvals",
  reports: "nav-reports",
  settings: "nav-settings",
};

export function navIcon(name, className = "nav-color-icon") {
  const file = NAV_ICON_KEYS[name] || NAV_ICON_KEYS.dashboard;
  return `<img class="${className}" src="${ICON_PATH}/${file}.svg" width="32" height="32" alt="" decoding="async" />`;
}

export function sidebarLogo(className = "nav-color-icon nav-color-icon--logo") {
  return `<img class="${className}" src="${ICON_PATH}/${NAV_ICON_KEYS.logo}.svg" width="32" height="32" alt="" decoding="async" />`;
}
