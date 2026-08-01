let navigateImpl = null;

export function bindNavigate(fn) {
  navigateImpl = fn;
}

export function navigateTo(route, { replace = false } = {}) {
  const target = route.startsWith("/") ? route : `/${route}`;
  if (!navigateImpl) {
    if (typeof window !== "undefined") {
      if (replace) {
        window.location.replace(target);
      } else {
        window.location.href = target;
      }
    }
    return;
  }
  navigateImpl(target, { replace });
}

export function getRoutePath() {
  if (typeof window === "undefined") return "/dashboard";
  const pathname = location.pathname || "/";
  if (pathname === "/" || pathname === "") return "/dashboard";
  return pathname.split("?")[0];
}

export function getRouteQuery() {
  if (typeof window === "undefined") return new URLSearchParams();
  return new URLSearchParams(location.search || "");
}
