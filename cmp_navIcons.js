const ICON_PATH = "/assets/icons/nav";

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
  return `<svg class="${className}" viewBox="0 0 24 24" fill="none" stroke="var(--brand-600)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="32" height="32">
    <path d="M6 22V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18" />
    <path d="M6 12H4a2 2 0 0 0-2 2v8" />
    <path d="M18 16h2a2 2 0 0 1 2 2v4" />
    <path d="M10 6h4" />
    <path d="M10 10h4" />
    <path d="M10 14h4" />
    <path d="M10 18h4" />
  </svg>`;
}

/** Collapse sidebar — three bars + left chevron (reference image 3). */
export function sidebarMinimizeIcon() {
  return `<svg class="sidebar-collapse-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 7h10"/><path d="M4 12h7"/><path d="M4 17h10"/><path d="M18 8l-4 4 4 4"/></svg>`;
}

/** Expand sidebar — right chevron + three bars (reference image 4). */
export function sidebarExpandIcon() {
  return `<svg class="sidebar-collapse-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 8l4 4-4 4"/><path d="M10 7h10"/><path d="M13 12h7"/><path d="M10 17h10"/></svg>`;
}
