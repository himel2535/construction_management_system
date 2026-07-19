import { setActiveNav, refreshSidebarNav } from "./cmp_layout.js";
import { applyRouteChrome, updatePageChromeBack, syncHeaderUser } from "./cmp_header.js";
import { getCurrentRole } from "./svc_governance.js";
import { canAccessRoute, defaultRouteForRole } from "./util_roles.js";
import { getRoutePath, getRouteQuery, bindNavigate } from "./util_route.js";

export { getRoutePath, getRouteQuery, navigateTo } from "./util_route.js";

const routes = new Map();
let currentUnmount = null;

export function registerRoute(path, handler) {
  routes.set(path, handler);
}

function getRoute() {
  const path = getRoutePath();
  const search = location.search || "";
  return `${path}${search}`;
}

function resolveHandler(path) {
  const pathname = path.split("?")[0];
  if (routes.has(pathname)) return routes.get(pathname);
  if (pathname.startsWith("/projects")) return routes.get("/projects");
  return routes.get("/dashboard");
}

export function navigateToImpl(route, { replace = false } = {}) {
  const target = route.startsWith("/") ? route : `/${route}`;
  const current = location.pathname + (location.search || "");
  if (current === target) {
    navigate();
    return;
  }
  if (replace) history.replaceState(null, "", target);
  else history.pushState(null, "", target);
  navigate();
}

export async function navigate() {
  if (currentUnmount) {
    currentUnmount();
    currentUnmount = null;
  }

  let path = getRoute();
  const role = getCurrentRole();

  if (!canAccessRoute(role, path)) {
    const fallback = defaultRouteForRole(role);
    if (getRoutePath() !== fallback) {
      navigateToImpl(fallback, { replace: true });
      return;
    }
  }

  path = getRoute();
  setActiveNav();
  applyRouteChrome();
  const handler = resolveHandler(path);
  const container = document.getElementById("page-content");
  if (!container || !handler) return;

  container.innerHTML = "";
  const result = await handler(container);
  if (result?.unmount) currentUnmount = result.unmount;

  refreshSidebarNav();
  syncHeaderUser();
  updatePageChromeBack();
}

function normalizeLegacyHash() {
  if (location.hash.startsWith("#/")) {
    history.replaceState(null, "", location.hash.slice(1));
  }
}

function bindLinkInterceptor() {
  document.addEventListener("click", (e) => {
    const a = e.target.closest("a[href]");
    if (!a || a.target === "_blank") return;
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    const href = a.getAttribute("href");
    if (!href || !href.startsWith("/") || href.startsWith("//")) return;
    e.preventDefault();
    navigateToImpl(href);
  });
}

export function startRouter() {
  bindNavigate(navigateToImpl);
  normalizeLegacyHash();
  const role = getCurrentRole();
  if (getRoutePath() === "/dashboard" && (location.pathname === "/" || location.pathname === "")) {
    history.replaceState(null, "", defaultRouteForRole(role));
  }
  window.addEventListener("popstate", navigate);
  bindLinkInterceptor();
  navigate();
}
