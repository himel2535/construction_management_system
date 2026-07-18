/** Government construction project constants and helpers */

export const PROJECT_TYPES = [
  { id: "private_civil", label: "Private / Local" },
  { id: "government_civil", label: "Government" },
];

export const EMPLOYER_AGENCIES = [
  "LGED",
  "PWD",
  "RHD",
  "RAJUK",
  "City Corporation",
  "BWDB",
  "LGED/RHD",
  "Custom",
];

export const GOV_PATHS = {
  measurementEntries: "measurementEntries",
  ipcBills: "ipcBills",
  ipcBillLines: "ipcBillLines",
  retentionLedger: "retentionLedger",
  eotRequests: "eotRequests",
  govComplianceChecklist: "govComplianceChecklist",
};

export const DEFAULT_GOV_PHASES = [
  { name: "Mobilization", sortOrder: 1 },
  { name: "Substructure", sortOrder: 2 },
  { name: "Superstructure", sortOrder: 3 },
  { name: "Finishing", sortOrder: 4 },
  { name: "Handover", sortOrder: 5 },
];

export const DEFAULT_PRIVATE_PHASES = [
  { name: "Foundation", sortOrder: 1 },
  { name: "Structure", sortOrder: 2 },
  { name: "Finishing", sortOrder: 3 },
  { name: "Handover", sortOrder: 4 },
];

export const MANDATORY_GOV_DOCS = [
  { title: "Agreement / Work Order", docType: "contract" },
  { title: "Contract BOQ", docType: "contract" },
  { title: "Approved Drawings", docType: "drawing" },
  { title: "Method Statement", docType: "report" },
  { title: "Inspection Test Plan (ITP)", docType: "report" },
];

export const CERT_STAGES = [
  { id: "site_engineer", label: "Site Engineer" },
  { id: "resident_engineer", label: "Resident Engineer" },
  { id: "executive_engineer", label: "Executive Engineer" },
  { id: "accounts", label: "Accounts" },
];

export const BG_TYPES = [
  { id: "performance", label: "Performance guarantee" },
  { id: "security", label: "Security / mobilization" },
];

export function isGovProject(project) {
  return project?.type === "government" || project?.projectType === "government_civil";
}

export function isPrivateProject(project) {
  if (project?.type === "private") return true;
  return !project?.projectType || project.projectType === "private_civil";
}

export function isRealEstateProject() {
  return false;
}

export function getProjectTabs(project) {
  const gov = isGovProject(project);
  const tabs = [{ id: "home", label: "Home" }];
  tabs.push({ id: "boq", label: gov ? "BOQ & CSR" : "BOQ & Budget" });
  tabs.push(
    { id: "phases", label: "Phases" },
    { id: "milestones", label: "Milestones" },
    { id: "timeline", label: "Timeline" },
    { id: "progress", label: "Progress" },
    { id: "documents", label: "Documents" },
    { id: "resources", label: "Resources" },
    { id: "team", label: "Team" },
    { id: "messages", label: "Messages" },
    { id: "quality", label: "Quality" },
    { id: "safety", label: "Safety" }
  );
  if (gov) {
    tabs.push({ id: "measurement", label: "Measurement Book (MB)" });
    tabs.push({ id: "retention", label: "Retention & Final" });
    tabs.push({ id: "contract", label: "Contract" });
    tabs.push({ id: "compliance", label: "Compliance" });
  } else {
    tabs.push({ id: "contract", label: "Client Contract" });
    tabs.push({ id: "billing", label: "Billing" });
  }
  tabs.push(
    { id: "contracts", label: gov ? "VO, Claims & EOT" : "Contracts & Claims" },
    { id: "activity", label: "Activity" }
  );
  return tabs;
}

export function projectTypeLabel(type) {
  return PROJECT_TYPES.find((t) => t.id === type)?.label || type || "Private / Local";
}

export function defaultProjectType() {
  return "private_civil";
}
