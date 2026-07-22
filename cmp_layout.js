import { getCurrentUserName, getCurrentUserEmail } from "./svc_auth.js";
import { createAppHeader, initHeaderInteractions } from "./cmp_header.js";
import { navIcon, sidebarLogo, sidebarMinimizeIcon, sidebarExpandIcon } from "./cmp_navIcons.js";
import { getCurrentRole } from "./svc_governance.js";
import { filterNavItems, defaultRouteForRole, roleLabel } from "./util_roles.js";
import { readRef } from "./svc_tenant.js";
import { valToList } from "./svc_clientCache.js";
import { countPendingApprovals } from "./util_dashboard.js";
import { getRoutePath, navigateTo } from "./util_route.js";

export const APP_NAV = [
  { path: "/dashboard", label: "Dashboard", icon: "dashboard" },
  { path: "/client-portal", label: "Client Portal", icon: "portal" },
  { path: "/clients", label: "Clients / Contacts", icon: "clients" },
  { path: "/projects", label: "Projects", icon: "projects" },
  { path: "/site-incharge", label: "Site Management", icon: "site" },
  { path: "/accounting", label: "Finance", icon: "finance" },
  { path: "/purchases", label: "Procurement", icon: "procurement" },
  { path: "/inventory", label: "Inventory", icon: "inventory" },
  { path: "/workers", label: "HR & Payroll", icon: "hr" },
  { path: "/assets", label: "Assets & Equipment", icon: "assets" },
  { path: "/billing", label: "Billing", icon: "billing" },
  { path: "/suppliers", label: "Suppliers", icon: "suppliers" },
  { path: "/approvals", label: "Approvals", icon: "approvals", badgeKey: "approvals" },
  { path: "/reports", label: "Reports", icon: "reports" },
  { path: "/settings", label: "Settings", icon: "settings" },
];

const SIDEBAR_COLLAPSED_KEY = "erp-sidebar-collapsed";

function buildNavLinks(navEl) {
  if (!navEl) return;
  const role = getCurrentRole();
  const items = filterNavItems(APP_NAV, role);
  const approvalCount = countPendingApprovals(valToList(readRef("approvalQueue") || {}));
  navEl.innerHTML = "";
  for (const item of items) {
    const a = document.createElement("a");
    a.href = item.path;
    a.className = "nav-link";
    a.dataset.path = item.path;
    a.title = item.label;
    const badge =
      item.badgeKey === "approvals" && approvalCount > 0
        ? `<span class="nav-badge">${approvalCount > 99 ? "99+" : approvalCount}</span>`
        : "";
    a.innerHTML = `<span class="nav-icon">${navIcon(item.icon)}</span><span class="nav-label">${item.label}</span>${badge}`;
    navEl.appendChild(a);
  }
  navEl.querySelectorAll(".nav-link").forEach((a) => {
    a.addEventListener("click", () => {
      if (window.matchMedia("(max-width: 768px)").matches) {
        document.querySelector(".app-shell")?.classList.remove("sidebar-open");
        document.body.classList.remove("sidebar-drawer-open");
      }
    });
  });
}

function isDesktopSidebar() {
  return window.matchMedia("(min-width: 769px)").matches;
}

function readSidebarCollapsedPref() {
  try {
    return localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === "1";
  } catch {
    return false;
  }
}

function writeSidebarCollapsedPref(collapsed) {
  try {
    localStorage.setItem(SIDEBAR_COLLAPSED_KEY, collapsed ? "1" : "0");
  } catch {
    /* ignore */
  }
}

function initSidebarCollapse(shell) {
  const btn = shell.querySelector(".sidebar-collapse-btn");
  if (!btn) return;

  function applyCollapsed(collapsed) {
    if (!isDesktopSidebar()) {
      shell.classList.remove("sidebar-collapsed");
      btn.innerHTML = sidebarMinimizeIcon();
      btn.setAttribute("aria-label", "Collapse sidebar");
      btn.setAttribute("aria-expanded", "true");
      return;
    }
    shell.classList.toggle("sidebar-collapsed", collapsed);
    btn.innerHTML = collapsed ? sidebarExpandIcon() : sidebarMinimizeIcon();
    btn.setAttribute("aria-label", collapsed ? "Expand sidebar" : "Collapse sidebar");
    btn.setAttribute("aria-expanded", collapsed ? "false" : "true");
    writeSidebarCollapsedPref(collapsed);
  }

  btn.addEventListener("click", (e) => {
    e.stopPropagation();
    if (!isDesktopSidebar()) return;
    applyCollapsed(!shell.classList.contains("sidebar-collapsed"));
  });

  applyCollapsed(readSidebarCollapsedPref());

  window.matchMedia("(min-width: 769px)").addEventListener("change", (e) => {
    applyCollapsed(e.matches ? readSidebarCollapsedPref() : false);
  });
}

export function refreshSidebarNav() {
  buildNavLinks(document.getElementById("sidebar-nav"));
  setActiveNav();
}

export function renderLayout(contentEl) {
  const root = document.createElement("div");
  root.className = "app-root";

  const banner = document.createElement("div");
  banner.className = "demo-banner";
  banner.hidden = true;
  banner.textContent = "Firebase RTDB demo • Construction ERP";
  root.appendChild(banner);

  const shell = document.createElement("div");
  shell.className = "app-shell";

  const backdrop = document.createElement("div");
  backdrop.className = "sidebar-backdrop";
  backdrop.id = "sidebar-backdrop";
  shell.appendChild(backdrop);

  const aside = document.createElement("aside");
  aside.className = "sidebar";

  const userName = getCurrentUserName();
  const userEmail = getCurrentUserEmail();
  const initials =
    userName
      .split(/\s+/)
      .map((w) => w[0])
      .join("")
      .slice(0, 2)
      .toUpperCase() || "U";

  aside.innerHTML = `
    <div class="sidebar-head">
      <button type="button" class="sidebar-head-brand" title="Go to home">
        <span class="sidebar-logo" aria-hidden="true">${sidebarLogo()}</span>
        <div class="sidebar-head-text">
          <h1>Construction ERP</h1>
          <p>Owner / Admin panel</p>
        </div>
      </button>
      <button type="button" class="sidebar-collapse-btn" aria-label="Collapse sidebar" aria-expanded="true">
        ${sidebarMinimizeIcon()}
      </button>
    </div>
    <nav id="sidebar-nav"></nav>
    <div class="sidebar-foot">
      <button type="button" class="sidebar-user-card">
        <span class="user-avatar sm">${initials}</span>
        <span class="sidebar-user-text">
          <strong></strong>
          <span></span>
        </span>
        <span class="sidebar-user-chevron"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 9l6 6 6-6"/></svg></span>
      </button>
    </div>
  `;

  const nameEl = aside.querySelector(".sidebar-user-text strong");
  const emailEl = aside.querySelector(".sidebar-user-text span");
  if (nameEl) nameEl.textContent = userName;
  if (emailEl) emailEl.textContent = roleLabel(getCurrentRole());

  const sidebarBrand = aside.querySelector(".sidebar-head-brand");
  if (sidebarBrand) {
    sidebarBrand.addEventListener("click", () => {
      navigateTo(defaultRouteForRole(getCurrentRole()));
    });
  }

  const userCard = aside.querySelector(".sidebar-user-card");
  if (userCard) {
    userCard.title = "Settings";
    userCard.addEventListener("click", () => {
      navigateTo("/settings");
    });
  }

  const nav = aside.querySelector("#sidebar-nav");
  buildNavLinks(nav);

  const main = document.createElement("main");
  main.className = "main";

  main.appendChild(createAppHeader());

  const inner = document.createElement("div");
  inner.className = "main-inner";
  inner.id = "page-content";
  if (contentEl) inner.appendChild(contentEl);
  main.appendChild(inner);

  shell.appendChild(aside);
  shell.appendChild(main);
  root.appendChild(shell);

  initSidebarCollapse(shell);

  requestAnimationFrame(() => initHeaderInteractions({ nav: APP_NAV }));

  return root;
}

export function setActiveNav() {
  const path = getRoutePath();
  document.querySelectorAll(".nav-link").forEach((a) => {
    const navPath = a.dataset.path || "";
    const active =
      navPath === path ||
      (navPath === "/projects" && path.startsWith("/projects")) ||
      (navPath === "/clients" && (path.startsWith("/clients") || path.startsWith("/customers"))) ||
      (navPath === "/billing" && (path === "/billing" || path === "/sales")) ||
      (navPath === "/reports" && path.startsWith("/reports")) ||
      (navPath === "/client-portal" && path === "/client-portal") ||
      (navPath === "/settings" && path === "/settings");
    a.classList.toggle("active", active);
  });
}

export function getPageContainer() {
  return document.getElementById("page-content");
}
