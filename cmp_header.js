import { getCurrentRole } from "./svc_governance.js";
import { defaultRouteForRole, roleLabel, filterNavItems } from "./util_roles.js";
import { getCurrentUserName, getCurrentUserId } from "./svc_auth.js";
import { getRoutePath, navigateTo } from "./util_route.js";
import { listenList } from "./svc_data.js";
import { buildGlobalSearchIndex, searchGlobalIndex } from "./util_globalSearch.js";

/** @typedef {{ title?: string, subtitle?: string, showDateRange?: boolean, quickActionLabel?: string, onQuickAction?: (() => void) | null }} PageChrome */

let pageChrome = {
  title: "Dashboard",
  subtitle: "",
  showDateRange: false,
  quickActionLabel: "",
  onQuickAction: null,
};

const ROUTE_CHROME = {
  "/dashboard": {
    title: "Dashboard",
    subtitle: "Welcome back! Here's what's happening with your business today.",
    showDateRange: true,
    quickActionLabel: "+ Quick Action",
  },
  "/clients": { title: "Clients / Owners", subtitle: "Project owners, employers, and contract contacts." },
  "/customers": { title: "Clients / Owners", subtitle: "Project owners, employers, and contract contacts." },
  "/clients/new": { title: "Add Client", subtitle: "Create a new client or project owner record." },
  "/customers/new": { title: "Add Client", subtitle: "Create a new client or project owner record." },
  "/projects": { title: "Projects", subtitle: "Project master, operations, quality/safety, and contracts." },
  "/projects/new": {
    title: "Create Project",
    subtitle: "Set up a new private or government construction project.",
  },
  "/billing": { title: "Billing & Invoicing", subtitle: "Client bills, progress billing, and payment tracking." },
  "/sales": { title: "Billing & Invoicing", subtitle: "Client bills, progress billing, and payment tracking." },
  "/accounting": { title: "Accounting", subtitle: "Receipts, payments, and ledger." },
  "/purchases": { title: "Purchase", subtitle: "Material requests, purchase orders, and goods receipt." },
  "/suppliers": { title: "Suppliers", subtitle: "Payees, bills, payments, and outstanding balances." },
  "/inventory": { title: "Inventory", subtitle: "Materials, stock in/out, ledger, and pending returns." },
  "/assets": { title: "Assets", subtitle: "Machinery, vehicles, tools — register, assignment, and maintenance." },
  "/workers": { title: "Workers", subtitle: "Worker registry, attendance, salary, and site assignments." },
  "/site-incharge": {
    title: "Site In-charge",
    subtitle: "Field PM — material usage, workers roster, and monthly settlement.",
  },
  "/approvals": { title: "Approvals", subtitle: "Enterprise approval inbox for quality, safety, contracts, and claims." },
  "/arbitration": { title: "Arbitration", subtitle: "Disputes, hearings, awards, and offline sync console." },
  "/reports": { title: "Reports", subtitle: "Summary reports, governance metrics, and exports." },
  "/client-portal": { title: "Client Portal", subtitle: "View project progress and billing (read-only)." },
  "/settings": { title: "Settings", subtitle: "Company, users, roles, and system settings." },
};

function iconSvg(name) {
  const icons = {
    menu: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 6h16M4 12h16M4 18h16"/></svg>',
    search: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3-3"/></svg>',
    bell: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/></svg>',
    message: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg>',
    help: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 015.83 1c0 2-3 3-3 3"/><path d="M12 17h.01"/></svg>',
    chevron: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 9l6 6 6-6"/></svg>',
    chevronLeft: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M15 18l-6-6 6-6"/></svg>',
    calendar: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>',
    buildings: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 21h18M5 21V7l7-4 7 4v14M9 21v-6h6v6"/></svg>',
  };
  return icons[name] || "";
}

export function getDefaultDateRangeLabel() {
  const now = new Date();
  const start = new Date(now);
  start.setDate(now.getDate() - 6);
  const fmt = (d) =>
    d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  const y = now.getFullYear();
  return `${fmt(start)} - ${fmt(now)}, ${y}`;
}

/** @param {Partial<PageChrome>} patch */
export function setPageChrome(patch) {
  pageChrome = { ...pageChrome, ...patch };
  renderPageChrome();
}

function getCurrentRoutePath() {
  return getRoutePath();
}

export function updatePageChromeBack() {
  const backBtn = document.getElementById("page-chrome-back");
  if (!backBtn) return;
  const role = getCurrentRole();
  const home = defaultRouteForRole(role);
  const path = getCurrentRoutePath();
  const show = path !== home;
  backBtn.style.display = show ? "inline-flex" : "none";
  backBtn.setAttribute("aria-label", "Go back");
  backBtn.innerHTML = `<span class="page-chrome-back-icon" aria-hidden="true">${iconSvg("chevronLeft")}</span>`;
  backBtn.onclick = () => {
    if (history.length > 1) history.back();
    else navigateTo(home);
  };
}

export function applyRouteChrome() {
  const path = getCurrentRoutePath();
  const defaults = ROUTE_CHROME[path] || ROUTE_CHROME["/dashboard"];
  pageChrome = {
    title: defaults.title,
    subtitle: defaults.subtitle || "",
    showDateRange: !!defaults.showDateRange,
    quickActionLabel: defaults.quickActionLabel || "",
    onQuickAction: null,
  };
  renderPageChrome();
}

export function renderPageChrome() {
  const titleEl = document.getElementById("page-chrome-title");
  const subEl = document.getElementById("page-chrome-subtitle");
  const dateEl = document.getElementById("page-chrome-date");
  const qaBtn = document.getElementById("header-quick-action");
  if (titleEl) titleEl.textContent = pageChrome.title;
  if (subEl) {
    subEl.textContent = pageChrome.subtitle;
    subEl.style.display = pageChrome.subtitle ? "" : "none";
  }
  if (dateEl) {
    dateEl.style.display = pageChrome.showDateRange ? "" : "none";
    if (pageChrome.showDateRange) {
      const span = dateEl.querySelector(".date-range-text");
      if (span) span.textContent = getDefaultDateRangeLabel();
    }
  }
  if (qaBtn) {
    const label = pageChrome.quickActionLabel;
    qaBtn.style.display = label ? "" : "none";
    const chevron = pageChrome.onQuickAction
      ? ""
      : ` <span class="qa-chevron">${iconSvg("chevron")}</span>`;
    qaBtn.innerHTML = `${label}${chevron}`;
    qaBtn.onclick = pageChrome.onQuickAction || null;
  }
  updatePageChromeBack();
}

export function syncHeaderUser() {
  const btn = document.getElementById("header-user-btn");
  if (!btn) return;
  const name = getCurrentUserName();
  const role = roleLabel(getCurrentRole());
  const initials =
    name
      .split(/\s+/)
      .map((w) => w[0])
      .join("")
      .slice(0, 2)
      .toUpperCase() || "U";
  const avatar = btn.querySelector(".user-avatar");
  const nameEl = btn.querySelector(".user-name");
  if (avatar) avatar.textContent = initials;
  if (nameEl) nameEl.textContent = `${name} · ${role}`;
}

export function createAppHeader() {
  const header = document.createElement("header");
  header.className = "app-header";
  header.innerHTML = `
    <div class="header-left">
      <button type="button" class="icon-btn" id="sidebar-toggle" aria-label="Open menu">${iconSvg("menu")}</button>
    </div>
    <div class="page-chrome page-toolbar card" id="page-chrome">
      <button type="button" class="page-chrome-back icon-btn icon-btn--round" id="page-chrome-back" style="display:none" aria-label="Go back">
        <span class="page-chrome-back-icon" aria-hidden="true">${iconSvg("chevronLeft")}</span>
      </button>
      <div class="page-chrome-titles">
        <h1 class="page-chrome-title" id="page-chrome-title">Dashboard</h1>
        <p class="page-chrome-subtitle" id="page-chrome-subtitle"></p>
      </div>
      <div class="header-center">
        <div class="header-search-wrap">
          <span class="search-icon" aria-hidden="true">${iconSvg("search")}</span>
          <input type="search" class="header-search" id="header-search" placeholder="Search anything..." autocomplete="off" aria-controls="header-search-panel" aria-expanded="false" />
          <div class="header-search-panel" id="header-search-panel" hidden role="listbox" aria-label="Search results"></div>
        </div>
      </div>
      <div class="page-chrome-actions">
        <button type="button" class="icon-btn header-notify" id="header-notify-btn" aria-label="Notifications" aria-expanded="false">
          ${iconSvg("bell")}
          <span class="notify-badge" id="header-notify-badge" hidden>0</span>
        </button>
        <div class="notify-dropdown" id="header-notify-dropdown" hidden role="menu" aria-label="Notifications"></div>
        <button type="button" class="date-range-btn" id="page-chrome-date" style="display:none">
          <span class="date-icon">${iconSvg("calendar")}</span>
          <span class="date-range-text"></span>
          <span class="date-chevron">${iconSvg("chevron")}</span>
        </button>
        <button type="button" class="btn btn-primary header-quick-action" id="header-quick-action">
          + Quick Action <span class="qa-chevron">${iconSvg("chevron")}</span>
        </button>
        <button type="button" class="header-user" id="header-user-btn" aria-label="User menu">
          <span class="user-avatar">OD</span>
          <span class="user-meta">
            <span class="user-name">Owner (Demo)</span>
            <span class="user-chevron">${iconSvg("chevron")}</span>
          </span>
        </button>
      </div>
    </div>
  `;
  return header;
}

export function initHeaderInteractions(options = {}) {
  const toggle = document.getElementById("sidebar-toggle");
  const backdrop = document.getElementById("sidebar-backdrop");
  const search = document.getElementById("header-search");
  const shell = document.querySelector(".app-shell");

  const closeDrawer = () => {
    shell?.classList.remove("sidebar-open");
    document.body.classList.remove("sidebar-drawer-open");
    toggle?.setAttribute("aria-expanded", "false");
  };

  const openDrawer = () => {
    shell?.classList.add("sidebar-open");
    document.body.classList.add("sidebar-drawer-open");
    toggle?.setAttribute("aria-expanded", "true");
  };

  toggle?.addEventListener("click", () => {
    if (shell?.classList.contains("sidebar-open")) closeDrawer();
    else openDrawer();
  });

  backdrop?.addEventListener("click", closeDrawer);

  document.querySelectorAll(".nav-link").forEach((a) => {
    a.addEventListener("click", () => {
      if (window.matchMedia("(max-width: 768px)").matches) closeDrawer();
    });
  });

  document.addEventListener("keydown", (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
      e.preventDefault();
      search?.focus();
    }
    if (e.key === "Escape") closeDrawer();
  });

  initGlobalSearch(options.nav || []);

  document.getElementById("header-user-btn")?.addEventListener("click", () => {
    navigateTo("/settings");
  });

  initNotificationBell();

  window.addEventListener("popstate", () => updatePageChromeBack());

  syncHeaderUser();
  applyRouteChrome();
}

function escapeSearchHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function initGlobalSearch(navItems = []) {
  const search = document.getElementById("header-search");
  const panel = document.getElementById("header-search-panel");
  if (!search || !panel) return;

  const searchData = {
    projects: [],
    clients: [],
    workers: [],
    suppliers: [],
  };
  let activeIndex = -1;
  let debounceTimer = null;

  const getIndex = () =>
    buildGlobalSearchIndex({
      navItems: filterNavItems(navItems, getCurrentRole()),
      projects: searchData.projects,
      clients: searchData.clients,
      workers: searchData.workers,
      suppliers: searchData.suppliers,
    });

  const closePanel = () => {
    panel.hidden = true;
    search.setAttribute("aria-expanded", "false");
    activeIndex = -1;
  };

  const selectResult = (path) => {
    if (!path) return;
    navigateTo(path);
    search.value = "";
    panel.innerHTML = "";
    closePanel();
    search.blur();
  };

  const renderPanel = (results, query) => {
    const q = query.trim();
    if (!q) {
      panel.innerHTML = "";
      closePanel();
      return;
    }
    if (!results.length) {
      panel.hidden = false;
      search.setAttribute("aria-expanded", "true");
      panel.innerHTML = `<p class="header-search-empty">No results for "${escapeSearchHtml(q)}"</p>`;
      activeIndex = -1;
      return;
    }
    if (activeIndex >= results.length) activeIndex = results.length - 1;
    panel.hidden = false;
    search.setAttribute("aria-expanded", "true");
    panel.innerHTML = results
      .map(
        (result, index) => `<button type="button" class="header-search-result${index === activeIndex ? " is-active" : ""}" role="option" data-path="${escapeSearchHtml(result.path)}" data-index="${index}">
        <span class="header-search-result-type">${escapeSearchHtml(result.typeLabel)}</span>
        <strong>${escapeSearchHtml(result.label)}</strong>
        ${result.subtitle ? `<small>${escapeSearchHtml(result.subtitle)}</small>` : ""}
      </button>`
      )
      .join("");
    panel.querySelectorAll(".header-search-result").forEach((btn) => {
      btn.addEventListener("click", () => selectResult(btn.dataset.path));
    });
  };

  const runSearch = () => {
    const q = search.value.trim();
    const results = searchGlobalIndex(getIndex(), q);
    renderPanel(results, q);
  };

  search.addEventListener("input", () => {
    clearTimeout(debounceTimer);
    activeIndex = -1;
    debounceTimer = setTimeout(runSearch, 150);
  });

  search.addEventListener("focus", () => {
    if (search.value.trim()) runSearch();
  });

  search.addEventListener("keydown", (e) => {
    const q = search.value.trim();
    const results = searchGlobalIndex(getIndex(), q);

    if (e.key === "Escape") {
      e.preventDefault();
      closePanel();
      return;
    }
    if (e.key === "ArrowDown") {
      if (!q) return;
      e.preventDefault();
      if (panel.hidden) runSearch();
      activeIndex = Math.min(activeIndex + 1, Math.max(results.length - 1, 0));
      renderPanel(results, q);
      panel.querySelector(".header-search-result.is-active")?.scrollIntoView({ block: "nearest" });
      return;
    }
    if (e.key === "ArrowUp") {
      if (!q) return;
      e.preventDefault();
      activeIndex = Math.max(activeIndex - 1, 0);
      renderPanel(results, q);
      panel.querySelector(".header-search-result.is-active")?.scrollIntoView({ block: "nearest" });
      return;
    }
    if (e.key === "Enter") {
      e.preventDefault();
      if (!q) return;
      if (activeIndex >= 0 && results[activeIndex]) selectResult(results[activeIndex].path);
      else if (results[0]) selectResult(results[0].path);
    }
  });

  document.addEventListener("click", (e) => {
    if (panel.hidden) return;
    if (panel.contains(e.target) || e.target === search) return;
    closePanel();
  });

  for (const [key, path] of [
    ["projects", "projects"],
    ["clients", "clients"],
    ["workers", "workers"],
    ["suppliers", "suppliers"],
  ]) {
    listenList(path, (list) => {
      searchData[key] = list;
      if (search.value.trim() && document.activeElement === search) runSearch();
    });
  }
}

function escapeNotifyHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function initNotificationBell() {
  const btn = document.getElementById("header-notify-btn");
  const dropdown = document.getElementById("header-notify-dropdown");
  const badge = document.getElementById("header-notify-badge");
  if (!btn || !dropdown || !badge) return;

  let notifications = [];
  let unsub = () => {};

  const renderDropdown = () => {
    const unread = notifications.filter((n) => !n.read);
    if (unread.length) {
      badge.hidden = false;
      badge.textContent = String(unread.length > 9 ? "9+" : unread.length);
    } else {
      badge.hidden = true;
    }

    const sorted = [...notifications].sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    dropdown.innerHTML = sorted.length
      ? sorted.slice(0, 8).map((n) => {
          const typeLabel = {
            task_deadline: "Task",
            bg_expiry: "BG",
            bill_due: "Bill",
            permit_expiry: "Permit",
            project_message: "Message",
          }[n.type] || "";
          return `
          <button type="button" class="notify-dropdown-item${n.read ? "" : " is-unread"}" data-id="${n.id}" data-link="${escapeNotifyHtml(n.link || "")}">
            ${typeLabel ? `<span class="notify-type-chip">${escapeNotifyHtml(typeLabel)}</span>` : ""}
            <strong>${escapeNotifyHtml(n.title || "Notification")}</strong>
            <span>${escapeNotifyHtml(n.message || "")}</span>
          </button>`;
        }).join("")
      : `<p class="notify-dropdown-empty">No notifications</p>`;

    dropdown.querySelectorAll(".notify-dropdown-item").forEach((item) => {
      item.onclick = async () => {
        const id = item.dataset.id;
        const link = item.dataset.link;
        dropdown.hidden = true;
        btn.setAttribute("aria-expanded", "false");
        try {
          const { markNotificationRead } = await import("./svc_notifications.js");
          await markNotificationRead(getCurrentUserId(), id);
        } catch (_) { /* ignore */ }
        if (link) {
          const path = link.startsWith("#/") ? link.slice(1) : link.startsWith("#") ? link.slice(1) : link;
          navigateTo(path.startsWith("/") ? path : `/${path}`);
        }
      };
    });
  };

  import("./svc_notifications.js").then(({ listenUserNotifications }) => {
    unsub = listenUserNotifications(getCurrentUserId(), (list) => {
      notifications = list;
      renderDropdown();
    });
  });

  btn.addEventListener("click", (e) => {
    e.stopPropagation();
    const open = dropdown.hidden;
    dropdown.hidden = !open;
    btn.setAttribute("aria-expanded", open ? "true" : "false");
  });

  document.addEventListener("click", (e) => {
    if (!dropdown.hidden && !dropdown.contains(e.target) && e.target !== btn) {
      dropdown.hidden = true;
      btn.setAttribute("aria-expanded", "false");
    }
  });

  window.addEventListener("beforeunload", () => unsub());
}
