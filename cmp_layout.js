import { getCurrentUserName, getCurrentUserEmail } from "./svc_auth.js";
import { createAppHeader, initHeaderInteractions } from "./cmp_header.js";
import { getCurrentRole } from "./svc_governance.js";
import { filterNavItems, defaultRouteForRole, roleLabel } from "./util_roles.js";
import { readRef } from "./svc_tenant.js";
import { valToList } from "./svc_clientCache.js";
import { countPendingApprovals } from "./util_dashboard.js";
import { getRoutePath, navigateTo } from "./util_route.js";

const NAV = [
  { path: "/dashboard", label: "Dashboard", icon: "dashboard" },
  { path: "/client-portal", label: "Client Portal", icon: "users" },
  { path: "/clients", label: "Clients / Contacts", icon: "users" },
  { path: "/projects", label: "Projects", icon: "folder" },
  { path: "/site-incharge", label: "Site Management", icon: "hardhat" },
  { path: "/accounting", label: "Finance", icon: "ledger" },
  { path: "/purchases", label: "Procurement", icon: "bag" },
  { path: "/inventory", label: "Inventory", icon: "inventory" },
  { path: "/workers", label: "HR & Payroll", icon: "hardhat" },
  { path: "/assets", label: "Assets & Equipment", icon: "assets" },
  { path: "/billing", label: "Billing", icon: "ledger" },
  { path: "/suppliers", label: "Suppliers", icon: "truck" },
  { path: "/approvals", label: "Approvals", icon: "check", badgeKey: "approvals" },
  { path: "/reports", label: "Reports", icon: "chart" },
  { path: "/settings", label: "Settings", icon: "gear" },
];

function buildNavLinks(navEl) {
  if (!navEl) return;
  const role = getCurrentRole();
  const items = filterNavItems(NAV, role);
  const approvalCount = countPendingApprovals(valToList(readRef("approvalQueue") || {}));
  navEl.innerHTML = "";
  for (const item of items) {
    const a = document.createElement("a");
    a.href = item.path;
    a.className = "nav-link";
    a.dataset.path = item.path;
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

export function refreshSidebarNav() {
  buildNavLinks(document.getElementById("sidebar-nav"));
  setActiveNav();
}

function navIcon(name) {
  const icons = {
    dashboard: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>',
    users: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75"/></svg>',
    folder: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z"/></svg>',
    bag: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4z"/><path d="M3 6h18M16 10a4 4 0 01-8 0"/></svg>',
    card: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="1" y="4" width="22" height="16" rx="2"/><path d="M1 10h22"/></svg>',
    ledger: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 19.5A2.5 2.5 0 016.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z"/></svg>',
    truck: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 3h15v13H1zM16 8h4l3 5v3h-7V8z"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/></svg>',
    inventory: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z"/><path d="M3.27 6.96L12 12.01l8.73-5.05M12 22.08V12"/></svg>',
    assets: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14.7 6.3a1 1 0 000 1.4l1.6 1.6a1 1 0 001.4 0l3.77-3.77a6 6 0 01-7.94 7.94l-6.91 6.91a2.12 2.12 0 01-3-3l6.91-6.91a6 6 0 017.94-7.94l-3.76 3.76z"/></svg>',
    hardhat: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M2 18a1 1 0 001 1h18a1 1 0 001-1v-2a6 6 0 00-6-6H8a6 6 0 00-6 6v2z"/><path d="M12 2v4M8 6h8"/></svg>',
    chart: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 20V10M12 20V4M6 20v-6"/></svg>',
    check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"/></svg>',
    scale: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 3v18M3 7h4a4 4 0 008 0H3M13 17h8a4 4 0 00-8 0h8"/></svg>',
    gear: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/></svg>',
  };
  return icons[name] || icons.dashboard;
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
      <span class="sidebar-logo" aria-hidden="true">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 21h18M5 21V7l7-4 7 4v14M9 21v-6h6v6M9 9h.01M15 9h.01M9 13h.01M15 13h.01"/></svg>
      </span>
      <div>
        <h1>Construction ERP</h1>
        <p>Owner / Admin panel</p>
      </div>
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

  const sidebarHead = aside.querySelector(".sidebar-head");
  if (sidebarHead) {
    sidebarHead.title = "Go to home";
    sidebarHead.addEventListener("click", () => {
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

  requestAnimationFrame(() => initHeaderInteractions());

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
      (navPath === "/client-portal" && path === "/client-portal") ||
      (navPath === "/settings" && path === "/settings");
    a.classList.toggle("active", active);
  });
}

export function getPageContainer() {
  return document.getElementById("page-content");
}
