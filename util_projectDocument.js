/** §2.8 — project document types and expiry helpers */

export const DOCUMENT_TYPES = ["Drawing", "Contract", "Permit", "License", "Other"];

const LEGACY_TYPE_MAP = {
  drawing: "Drawing",
  contract: "Contract",
  report: "Other",
  permit: "Permit",
  license: "License",
  other: "Other",
};

/**
 * Normalize stored type to spec enum label.
 * @param {string} type
 */
export function normalizeDocumentType(type) {
  const t = String(type || "Other");
  if (DOCUMENT_TYPES.includes(t)) return t;
  return LEGACY_TYPE_MAP[t.toLowerCase()] || "Other";
}

/**
 * @param {string} type
 */
export function requiresExpiry(type) {
  const n = normalizeDocumentType(type);
  return n === "Permit" || n === "License";
}

/**
 * @param {string|null|undefined} dateISO
 */
export function daysUntilExpiry(dateISO) {
  if (!dateISO) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const exp = new Date(dateISO);
  if (Number.isNaN(exp.getTime())) return null;
  exp.setHours(0, 0, 0, 0);
  return Math.ceil((exp - today) / 86400000);
}

/**
 * @param {string|null|undefined} dateISO
 * @returns {"ok"|"warn"|"critical"|null}
 */
export function expiryAlertLevel(dateISO) {
  const days = daysUntilExpiry(dateISO);
  if (days === null) return null;
  if (days < 0) return "critical";
  if (days <= 30) return "warn";
  return "ok";
}

/**
 * @param {object} doc
 */
export function documentDisplayType(doc) {
  return normalizeDocumentType(doc.type || doc.docType);
}

/**
 * @param {object} doc
 */
export function documentVersion(doc) {
  if (doc.version != null && doc.version !== "") return Number(doc.version) || 0;
  const rev = String(doc.revision || "");
  const m = rev.match(/(\d+)/);
  return m ? Number(m[1]) : 1;
}
