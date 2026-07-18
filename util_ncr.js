/** §2.9 — Non-Conformance Report helpers */

export const NCR_SEVERITIES = ["low", "medium", "high", "critical"];

export const NCR_RESOLUTION_STATUSES = ["open", "in_progress", "resolved", "closed"];

export function ncrResolutionLabel(status) {
  const s = String(status || "open");
  const map = {
    open: "Open",
    in_progress: "In progress",
    resolved: "Resolved",
    closed: "Closed",
  };
  return map[s] || s;
}

export function canAdvanceNcrResolution(from, to) {
  const order = NCR_RESOLUTION_STATUSES;
  const fi = order.indexOf(from || "open");
  const ti = order.indexOf(to);
  if (fi < 0 || ti < 0) return false;
  return ti === fi + 1 || (from === "resolved" && to === "closed");
}
