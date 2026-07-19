let navigateImpl = null;

export function bindNavigate(fn) {
  navigateImpl = fn;
}

export function navigateTo(route, { replace = false } = {}) {
  if (!navigateImpl) {
    const target = route.startsWith("/") ? route : `/${route}`;
    if (replace) history.replaceState(null, "", target);
    else history.pushState(null, "", target);
    return;
  }
  navigateImpl(route, { replace });
}

export function getRoutePath() {
  const pathname = location.pathname || "/";
  if (pathname === "/" || pathname === "") return "/dashboard";
  return pathname.split("?")[0];
}

export function getRouteQuery() {
  return new URLSearchParams(location.search || "");
}
