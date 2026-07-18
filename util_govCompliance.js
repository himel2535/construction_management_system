/** Government regulatory compliance helpers (§2.2) */

export const COMPLIANCE_STATUSES = ["pending", "compliant", "non_compliant"];

export const COMPLIANCE_STATUS_LABELS = {
  pending: "Pending",
  compliant: "Compliant",
  non_compliant: "Non-compliant",
};

/** Agency-keyed regulatory checklist templates */
export const REGULATORY_CHECKLIST = {
  PWD: [
    { itemKey: "pwd_site_approval", label: "Site layout approval (PWD)" },
    { itemKey: "pwd_building_code", label: "Building code compliance certificate" },
    { itemKey: "pwd_env_clearance", label: "Environmental clearance" },
    { itemKey: "pwd_labour_compliance", label: "Labour law compliance register" },
  ],
  LGED: [
    { itemKey: "lged_technical_approval", label: "Technical approval (LGED)" },
    { itemKey: "lged_social_safeguard", label: "Social safeguard compliance" },
    { itemKey: "lged_road_standard", label: "Road design standard compliance" },
    { itemKey: "lged_mb_procedure", label: "Measurement book procedure adherence" },
  ],
  RAJUK: [
    { itemKey: "rajuk_planning_permit", label: "RAJUK planning permit" },
    { itemKey: "rajuk_fire_safety", label: "Fire safety clearance" },
    { itemKey: "rajuk_structural_cert", label: "Structural design certification" },
    { itemKey: "rajuk_occupancy", label: "Occupancy certificate readiness" },
  ],
};

const AGENCY_ALIASES = {
  LGED: "LGED",
  "LGED/RHD": "LGED",
  PWD: "PWD",
  RHD: "LGED",
  RAJUK: "RAJUK",
  "City Corporation": "RAJUK",
  BWDB: "LGED",
  Custom: "LGED",
};

/**
 * @param {string} employerAgency
 * @returns {{ itemKey: string, label: string, agency: string }[]}
 */
export function checklistForAgency(employerAgency) {
  const key = AGENCY_ALIASES[employerAgency] || "LGED";
  const items = REGULATORY_CHECKLIST[key] || REGULATORY_CHECKLIST.LGED;
  return items.map((item) => ({ ...item, agency: key }));
}

/**
 * @param {object[]} items - checklist rows with status: pending | done | na
 */
export function computeComplianceStatus(items = []) {
  const required = items.filter((i) => i.status !== "na");
  if (!required.length) return "pending";
  const allDone = required.every((i) => i.status === "done");
  if (allDone) return "compliant";
  const anyPending = required.some((i) => i.status === "pending");
  if (anyPending) return "non_compliant";
  return "pending";
}

export function complianceStatusLabel(status) {
  return COMPLIANCE_STATUS_LABELS[status] || status || "Pending";
}

/**
 * @param {object[]} ledger
 */
export function resolveRetentionAmount(ledger = []) {
  let held = 0;
  let released = 0;
  for (const row of ledger) {
    if (row.entryType === "hold") held += Number(row.amount || 0);
    if (row.entryType === "release") released += Number(row.amount || 0);
  }
  return Math.max(0, held - released);
}
