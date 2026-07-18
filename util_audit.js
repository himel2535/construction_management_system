const SKIP_KEYS = new Set(["updatedAt", "createdAt", "revisionHistory"]);

export function sanitizeAuditState(obj, maxKeys = 24) {
  if (!obj || typeof obj !== "object") return null;
  const out = {};
  let count = 0;
  for (const [k, v] of Object.entries(obj)) {
    if (SKIP_KEYS.has(k)) continue;
    if (typeof v === "string" && v.length > 200) {
      out[k] = `${v.slice(0, 200)}…`;
    } else if (v != null && typeof v === "object" && !Array.isArray(v)) {
      out[k] = "[object]";
    } else {
      out[k] = v;
    }
    count++;
    if (count >= maxKeys) break;
  }
  return Object.keys(out).length ? out : null;
}

export function buildAuditDiff(before, after) {
  const b = before || {};
  const a = after || {};
  const keys = new Set([...Object.keys(b), ...Object.keys(a)]);
  const changes = [];
  for (const k of keys) {
    if (SKIP_KEYS.has(k)) continue;
    const bv = b[k];
    const av = a[k];
    if (JSON.stringify(bv) !== JSON.stringify(av)) {
      changes.push(`${k}: ${fmtVal(bv)} → ${fmtVal(av)}`);
    }
  }
  return changes.length ? changes.join("; ") : "";
}

function fmtVal(v) {
  if (v == null || v === "") return "—";
  if (typeof v === "object") return "[object]";
  return String(v).slice(0, 80);
}
