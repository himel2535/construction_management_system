/** Shared project form field names and validation */

import { PROJECT_TYPES, defaultProjectType } from "./util_govProject.js";
import { formatDateRange } from "./util_format.js";

export const GOV_CONTRACT_FIELD_NAMES = [
  "employerAgency",
  "tenderRef",
  "tenderNoticeDate",
  "tenderSubmissionDeadline",
  "tenderDocUrl",
  "workOrderNo",
  "workOrderIssueDate",
  "workOrderScope",
  "nitNo",
  "contractValue",
  "contractDate",
  "completionDate",
  "retentionPercent",
  "retentionReleaseConditions",
  "ldRate",
  "performanceGuaranteeAmount",
  "securityDeposit",
  "complianceStatus",
  "bgType",
  "bgAmount",
  "bgBank",
  "bgExpiryDate",
  "bgStatus",
];

export const ERP_SELECT_PROJECT_KEY = "erp_select_project";
export const ERP_PROJECT_DRAFT_KEY = "erp_project_draft";

export const WIZARD_STEPS = [
  { id: 1, key: "basic", title: "Project basics" },
  { id: 2, key: "schedule", title: "Schedule & team" },
  { id: 3, key: "finish", title: "Finish" },
];

export function suggestProjectCode(name) {
  const words = String(name || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (!words.length) return "";
  if (words.length === 1) return words[0].slice(0, 4).toUpperCase();
  return words
    .map((w) => w[0])
    .join("")
    .toUpperCase()
    .slice(0, 6);
}

/** Read all government contract fields from a form element. */
export function readGovFieldsFromForm(form) {
  const q = (name) => form.querySelector(`[name="${name}"]`);
  return {
    employerAgency: q("employerAgency")?.value || "",
    tenderRef: q("tenderRef")?.value?.trim() || "",
    tenderNoticeDate: q("tenderNoticeDate")?.value || "",
    tenderSubmissionDeadline: q("tenderSubmissionDeadline")?.value || "",
    tenderDocUrl: q("tenderDocUrl")?.value?.trim() || "",
    workOrderNo: q("workOrderNo")?.value?.trim() || "",
    workOrderIssueDate: q("workOrderIssueDate")?.value || "",
    workOrderScope: q("workOrderScope")?.value?.trim() || "",
    nitNo: q("nitNo")?.value?.trim() || "",
    contractValue: Number(q("contractValue")?.value) || 0,
    contractDate: q("contractDate")?.value || "",
    completionDate: q("completionDate")?.value || "",
    retentionPercent: Number(q("retentionPercent")?.value) || 10,
    retentionReleaseConditions: q("retentionReleaseConditions")?.value?.trim() || "",
    ldRate: Number(q("ldRate")?.value) || 0,
    performanceGuaranteeAmount: Number(q("performanceGuaranteeAmount")?.value) || 0,
    securityDeposit: Number(q("securityDeposit")?.value) || 0,
    complianceStatus: q("complianceStatus")?.value || "pending",
    bgType: q("bgType")?.value || "performance",
    bgAmount: Number(q("bgAmount")?.value) || 0,
    bgBank: q("bgBank")?.value?.trim() || "",
    bgExpiryDate: q("bgExpiryDate")?.value || "",
    bgStatus: q("bgStatus")?.value || "active",
  };
}

export function readProjectForm(form, { includeGov = false } = {}) {
  const payload = {
    name: form.name?.value?.trim() || "",
    projectType: form.projectType?.value || form.querySelector('input[name="projectType"]:checked')?.value || defaultProjectType(),
    code: form.code?.value?.trim() || "",
    location: form.location?.value?.trim() || "",
    clientName: form.clientName?.value?.trim() || "",
    clientId: form.clientId?.value?.trim() || "",
    startDate: form.startDate?.value || "",
    endDate: form.endDate?.value || "",
    budgetTotal: form.budgetTotal?.value === "" || form.budgetTotal?.value == null
      ? ""
      : Number(form.budgetTotal?.value) || 0,
    status: form.status?.value || "planning",
    projectManagerId: form.projectManagerId?.value?.trim() || "",
    description: form.description?.value?.trim() || "",
  };

  if (includeGov && payload.projectType === "government_civil") {
    Object.assign(payload, readGovFieldsFromForm(form));
  }

  return payload;
}

/** Only reads fields present in the DOM — safe when wizard steps destroy inputs. */
export function readProjectFormPatch(form, { includeGov = false } = {}) {
  const patch = {};
  const q = (name) => form.querySelector(`[name="${name}"]`);

  const nameEl = q("name");
  if (nameEl) patch.name = nameEl.value.trim();

  const typeEl = q("projectType");
  if (typeEl) patch.projectType = typeEl.value || defaultProjectType();

  const codeEl = q("code");
  if (codeEl) patch.code = codeEl.value.trim();

  const locEl = q("location");
  if (locEl) patch.location = locEl.value.trim();

  const clientIdEl = q("clientId");
  if (clientIdEl) patch.clientId = clientIdEl.value.trim();

  const clientManualEl = q("clientNameManual");
  if (clientManualEl && !patch.clientId) patch.clientName = clientManualEl.value.trim();

  const startEl = q("startDate");
  if (startEl) patch.startDate = startEl.value;

  const endEl = q("endDate");
  if (endEl) patch.endDate = endEl.value;

  const budgetEl = q("budgetTotal");
  if (budgetEl) patch.budgetTotal = budgetEl.value === "" ? "" : Number(budgetEl.value) || 0;

  const contractEl = q("contractValue");
  if (contractEl) patch.contractValue = contractEl.value === "" ? "" : Number(contractEl.value) || 0;

  const statusEl = q("status");
  if (statusEl) patch.status = statusEl.value || "planning";

  const mgrEl = q("projectManagerId");
  if (mgrEl) patch.projectManagerId = mgrEl.value.trim();

  const descEl = q("description");
  if (descEl) patch.description = descEl.value.trim();

  if (includeGov) {
    const govPatch = readGovFieldsFromForm(form);
    for (const [key, val] of Object.entries(govPatch)) {
      const el = q(key);
      if (el) patch[key] = val;
    }
    const cvEl = q("contractValue");
    if (cvEl) patch.contractValue = cvEl.value === "" ? "" : Number(cvEl.value) || 0;
    const pgEl = q("performanceGuaranteeAmount");
    if (pgEl) patch.performanceGuaranteeAmount = pgEl.value === "" ? "" : Number(pgEl.value) || 0;
    const sdEl = q("securityDeposit");
    if (sdEl) patch.securityDeposit = sdEl.value === "" ? "" : Number(sdEl.value) || 0;
    const bgEl = q("bgAmount");
    if (bgEl) patch.bgAmount = bgEl.value === "" ? "" : Number(bgEl.value) || 0;
  }

  return patch;
}

export function emptyProjectDraft() {
  return {
    name: "",
    projectType: defaultProjectType(),
    code: "",
    location: "",
    clientName: "",
    clientId: "",
    startDate: "",
    endDate: "",
    budgetTotal: "",
    status: "planning",
    projectManagerId: "",
    description: "",
    employerAgency: "",
    tenderRef: "",
    tenderNoticeDate: "",
    tenderSubmissionDeadline: "",
    tenderDocUrl: "",
    workOrderNo: "",
    workOrderIssueDate: "",
    workOrderScope: "",
    nitNo: "",
    contractValue: "",
    contractDate: "",
    completionDate: "",
    retentionPercent: 10,
    retentionReleaseConditions: "",
    ldRate: 0,
    performanceGuaranteeAmount: "",
    securityDeposit: "",
    complianceStatus: "pending",
    bgType: "performance",
    bgAmount: "",
    bgBank: "",
    bgExpiryDate: "",
    bgStatus: "active",
    step: 1,
    codeTouched: false,
    updatedAt: 0,
  };
}

export function loadProjectDraftEnvelope() {
  try {
    const raw = sessionStorage.getItem(ERP_PROJECT_DRAFT_KEY);
    if (!raw) return { ...emptyProjectDraft() };
    const parsed = JSON.parse(raw);
    const step = Math.min(3, Math.max(1, Number(parsed.step) || 1));
    return {
      ...emptyProjectDraft(),
      ...parsed,
      step,
      codeTouched: !!parsed.codeTouched,
      updatedAt: parsed.updatedAt || 0,
    };
  } catch {
    return { ...emptyProjectDraft() };
  }
}

export function saveProjectDraftEnvelope(envelope) {
  sessionStorage.setItem(
    ERP_PROJECT_DRAFT_KEY,
    JSON.stringify({ ...envelope, updatedAt: Date.now() })
  );
}

export function clearProjectDraft() {
  sessionStorage.removeItem(ERP_PROJECT_DRAFT_KEY);
}

export function hasMeaningfulProjectDraft(envelope) {
  if (!envelope) return false;
  return !!(
    String(envelope.name || "").trim() ||
    String(envelope.location || "").trim() ||
    String(envelope.code || "").trim() ||
    String(envelope.clientName || "").trim() ||
    String(envelope.description || "").trim() ||
    String(envelope.startDate || "").trim() ||
    String(envelope.endDate || "").trim()
  );
}

export function hasStoredProjectDraft() {
  return hasMeaningfulProjectDraft(loadProjectDraftEnvelope());
}

export function readProjectFormFromState(state) {
  return { ...state };
}

export function validateProjectPayload(payload) {
  if (!payload.name) return { ok: false, message: "Project name is required", field: "name" };
  if (!payload.location) return { ok: false, message: "Location is required", field: "location" };
  if (payload.startDate && payload.endDate && payload.endDate < payload.startDate) {
    return { ok: false, message: "End date must be on or after start date", field: "endDate" };
  }
  if (payload.projectType === "government_civil" && payload.contractValue < 0) {
    return { ok: false, message: "Contract value cannot be negative", field: "contractValue" };
  }
  if (payload.projectType !== "government_civil") {
    const cv = payload.contractValue !== "" && payload.contractValue != null
      ? Number(payload.contractValue)
      : Number(payload.budgetTotal);
    if (cv < 0) {
      return { ok: false, message: "Contract value cannot be negative", field: "contractValue" };
    }
  }
  return { ok: true, message: "", field: null };
}

export function validateProjectStep(step, payload) {
  if (step === 1) {
    if (!payload.name) return { ok: false, message: "Project name is required", field: "name" };
    if (!payload.location) return { ok: false, message: "Location is required", field: "location" };
    return { ok: true, message: "", field: null };
  }
  if (step === 2) {
    if (payload.startDate && payload.endDate && payload.endDate < payload.startDate) {
      return { ok: false, message: "End date must be on or after start date", field: "endDate" };
    }
    return { ok: true, message: "", field: null };
  }
  return validateProjectPayload(payload);
}

export function buildReviewLines(payload) {
  const typeLabel = PROJECT_TYPES.find((t) => t.id === payload.projectType)?.label || payload.projectType;
  const lines = [
    { label: "Name", value: payload.name || "—" },
    { label: "Type", value: typeLabel },
    { label: "Code", value: payload.code || "—" },
    { label: "Location", value: payload.location || "—" },
    { label: "Client", value: payload.clientName || "—" },
    { label: "Status", value: payload.status || "planning" },
    {
      label: "Timeline",
      value: formatDateRange(payload.startDate, payload.endDate) || "—",
    },
    { label: "Description", value: payload.description || "—" },
  ];
  if (payload.projectType !== "government_civil") {
    const cv = payload.contractValue || payload.budgetTotal;
    lines.splice(6, 0, {
      label: "Contract value (BDT)",
      value: cv ? String(cv) : "—",
    });
  }
  if (payload.projectType === "government_civil") {
    lines.push(
      { label: "Agency", value: payload.employerAgency || "—" },
      { label: "Tender ref", value: payload.tenderRef || "—" },
      { label: "Tender deadline", value: payload.tenderSubmissionDeadline || "—" },
      { label: "Work order", value: payload.workOrderNo || "—" },
      { label: "Contract value", value: payload.contractValue ? String(payload.contractValue) : "—" },
      { label: "Compliance", value: payload.complianceStatus || "pending" }
    );
  }
  return lines;
}
