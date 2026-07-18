import { setActiveNav, refreshSidebarNav } from "./cmp_layout.js";
import { applyRouteChrome, updatePageChromeBack, syncHeaderUser } from "./cmp_header.js";
import { getCurrentRole } from "./svc_governance.js";
import { canAccessRoute, defaultRouteForRole } from "./util_roles.js";

const routes = new Map();
let currentUnmount = null;

export function registerRoute(path, handler) {
  routes.set(path, handler);
}

function getRoute() {
  const hash = location.hash.slice(1) || "/dashboard";
  return hash.startsWith("/") ? hash : `/${hash}`;
}

function resolveHandler(path) {
  if (routes.has(path)) return routes.get(path);
  if (path.startsWith("/projects")) return routes.get("/projects");
  return routes.get("/dashboard");
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
    if (path !== fallback) {
      location.hash = `#${fallback}`;
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

export function startRouter() {
  window.addEventListener("hashchange", navigate);
  const role = getCurrentRole();
  if (!location.hash) location.hash = `#${defaultRouteForRole(role)}`;
  navigate();
}
