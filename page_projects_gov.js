/**
 * Government construction — Contract, Measurement/IPC, Retention, Dashboard tabs
 */
import { create, updatePath } from "./svc_data.js";
import { getCurrentUserId } from "./svc_auth.js";
import { workflowButtonsHtml, wireWorkflowButtons } from "./svc_governance.js";
import { formatBDT } from "./util_format.js";
import { showToast } from "./cmp_toast.js";
import { confirmAction } from "./cmp_confirm.js";
import { sectionCard, statusChip } from "./cmp_ui.js";
import { GOV_PATHS, CERT_STAGES, BG_TYPES } from "./util_govProject.js";
import {
  computeComplianceStatus,
  complianceStatusLabel,
} from "./util_govCompliance.js";
import {
  computeIpcDraft,
  computeProjectKpis,
  computeRetentionBalance,
  computeLiquidatedDamages,
  postIpcPaymentVoucher,
  agencyReportRows,
  cumulativeMeasuredByBoq,
} from "./svc_govProject.js";
import { milestoneVariance } from "./svc_workflow.js";
import { auditProject, openEditDialog, openCustFormDialog } from "./cmp_projectTab.js";
import { renderBoqStatGrid } from "./page_projects_r2.js";

export const GOV_TAB_IDS = ["contract", "compliance", "home", "measurement", "retention"];

function complianceChip(status) {
  const s = String(status || "pending").toLowerCase();
  const cls =
    s === "compliant"
      ? "chip chip-success compliance-chip--compliant"
      : s === "non_compliant"
        ? "chip chip-warning compliance-chip--non_compliant"
        : "chip chip-info compliance-chip--pending";
  return `<span class="${cls}">${complianceStatusLabel(s)}</span>`;
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function bindGovSubs(state, listenProjectSub, onUpdate) {
  const pid = state.selectedProjectId;
  const tabs = [...GOV_TAB_IDS, "contracts"];
  if (!pid) {
    state.measurementEntries = [];
    state.ipcBills = [];
    state.ipcBillLines = [];
    state.retentionLedger = [];
    state.eotRequests = [];
    state.govComplianceChecklist = [];
    return () => {};
  }
  const refresh = () => {
    if (tabs.includes(state.activeTab)) onUpdate();
  };
  const attachLines = () => {
    for (const bill of state.ipcBills || []) {
      bill._lines = (state.ipcBillLines || []).filter((l) => l.ipcBillId === bill.id);
    }
  };
  const u1 = listenProjectSub(pid, GOV_PATHS.measurementEntries, (list) => {
    state.measurementEntries = list;
    refresh();
  });
  const u2 = listenProjectSub(pid, GOV_PATHS.ipcBills, (list) => {
    state.ipcBills = list;
    attachLines();
    refresh();
  });
  const u3 = listenProjectSub(pid, GOV_PATHS.ipcBillLines, (list) => {
    state.ipcBillLines = list;
    attachLines();
    refresh();
  });
  const u4 = listenProjectSub(pid, GOV_PATHS.retentionLedger, (list) => {
    state.retentionLedger = list;
    refresh();
  });
  const u5 = listenProjectSub(pid, GOV_PATHS.eotRequests, (list) => {
    state.eotRequests = list;
    refresh();
  });
  const u6 = listenProjectSub(pid, GOV_PATHS.govComplianceChecklist, (list) => {
    state.govComplianceChecklist = list;
    refresh();
  });
  return () => {
    u1();
    u2();
    u3();
    u4();
    u5();
    u6();
  };
}

function govBase() {
  const now = Date.now();
  return {
    status: "draft",
    createdAt: now,
    updatedAt: now,
    createdBy: getCurrentUserId(),
    submittedBy: null,
    submittedAt: null,
    approvedBy: null,
    approvedAt: null,
  };
}

function govStatCell(label, valueHtml) {
  return `<div class="proj-contract-gov-field"><span class="cust-detail-label">${escapeHtml(label)}</span><div class="cust-detail-value">${valueHtml}</div></div>`;
}

function govSubsection(title, gridClass, cellsHtml, extraHtml = "") {
  return `
    <section class="proj-contract-gov-subsection">
      <h5 class="proj-contract-gov-subsection-title">${escapeHtml(title)}</h5>
      <div class="proj-contract-gov-field-grid ${gridClass}">${cellsHtml}</div>
      ${extraHtml}
    </section>
  `;
}

export function buildContractTab(state, opts = {}) {
  const root = document.createElement("div");
  root.className = "proj-contract-tab proj-contract-tab--gov";
  const project = state.projects.find((p) => p.id === state.selectedProjectId);
  if (!project) {
    root.innerHTML = `<p class="proj-empty">Select a project first</p>`;
    return root;
  }

  const certified = (state.ipcBills || [])
    .filter((b) => b.status === "approved" || b.status === "certified")
    .reduce((max, b) => Math.max(max, Number(b.cumulativeCertified || 0)), 0);
  const cv = Number(project.contractValue || 0);
  const certPct = cv > 0 ? Math.round((certified / cv) * 100) : 0;
  const { balance: retentionBalance } = computeRetentionBalance(state.retentionLedger || []);
  const tenderDoc = project.tenderDocUrl
    ? `<a href="${escapeHtml(project.tenderDocUrl)}" target="_blank" rel="noopener">Open tender document</a>`
    : "—";

  const metricsSection = document.createElement("section");
  metricsSection.className = "proj-boq-metrics proj-boq-metrics--planning proj-contract-metrics";
  metricsSection.innerHTML = `<h4 class="proj-boq-section-title">Contract overview</h4>`;
  metricsSection.appendChild(
    renderBoqStatGrid([
      { label: "Contract value", value: formatBDT(cv) },
      { label: "Certified to date", value: formatBDT(certified) },
      { label: "Certified %", value: `${certPct}%` },
      { label: "Retention held", value: formatBDT(retentionBalance) },
    ])
  );
  const statGrid = metricsSection.querySelector(".proj-boq-stat-grid");
  if (statGrid) statGrid.classList.add("proj-contracts-stat-grid");

  const termsShell = document.createElement("div");
  termsShell.className = "reports-table-wrap proj-contract-gov-terms-shell";
  termsShell.innerHTML = `
    <div class="proj-contract-gov-terms-head-row">
      <h4 class="proj-boq-section-title proj-contract-gov-terms-head">Commercial contract terms</h4>
      <div class="proj-contract-gov-terms-head-actions">
        <button type="button" class="btn btn-edit btn-sm proj-contract-gov-edit-btn">Edit profile</button>
        <button type="button" class="btn btn-secondary btn-sm proj-contract-gov-compliance-btn">View compliance checklist →</button>
      </div>
    </div>
    <div class="proj-contract-gov-terms-meta">
      <span>Employer: <strong>${escapeHtml(project.employerAgency || "—")}</strong></span>
      <span>Completion: ${escapeHtml(project.completionDate || "—")}</span>
      <span class="proj-contract-gov-terms-meta-chip">Compliance: ${complianceChip(project.complianceStatus)}</span>
    </div>
  `;
  termsShell.querySelector(".proj-contract-gov-edit-btn").onclick = () => opts.onEditMaster?.();
  termsShell.querySelector(".proj-contract-gov-compliance-btn").onclick = () => opts.onNavigateTab?.("compliance");

  const woScopeHtml = project.workOrderScope
    ? `<p class="proj-contract-gov-scope-callout text-muted">${escapeHtml(project.workOrderScope)}</p>`
    : "";

  const particularsShell = document.createElement("div");
  particularsShell.className = "reports-table-wrap proj-contract-gov-particulars-shell";
  particularsShell.innerHTML = `
    <h4 class="proj-boq-section-title proj-contract-gov-particulars-head">Contract particulars</h4>
    ${govSubsection(
      "Tender / e-GP",
      "proj-contract-gov-tender-grid",
      [
        govStatCell("Tender ref", escapeHtml(project.tenderRef || "—")),
        govStatCell("Notice date", escapeHtml(project.tenderNoticeDate || "—")),
        govStatCell("Submission deadline", escapeHtml(project.tenderSubmissionDeadline || "—")),
        govStatCell("Document", tenderDoc),
      ].join("")
    )}
    ${govSubsection(
      "Work order (কার্যাদেশ)",
      "proj-contract-gov-wo-grid",
      [
        govStatCell("Reference", escapeHtml(project.workOrderNo || "—")),
        govStatCell("Issue date", escapeHtml(project.workOrderIssueDate || "—")),
      ].join(""),
      woScopeHtml
    )}
    ${govSubsection(
      "Performance guarantee",
      "proj-contract-gov-pg-grid",
      govStatCell("Amount", escapeHtml(formatBDT(project.performanceGuaranteeAmount || 0)))
    )}
  `;

  const bgLabel = BG_TYPES.find((t) => t.id === project.bgType)?.label || project.bgType || "—";
  const guaranteesShell = document.createElement("div");
  guaranteesShell.className =
    "reports-table-wrap proj-contract-gov-guarantees-shell proj-contract-gov-bg-shell";
  guaranteesShell.innerHTML = `
    <h4 class="proj-boq-section-title proj-contract-gov-guarantees-head">Guarantees & securities</h4>
    <div class="proj-contract-gov-table">
      <table class="dash-table projects-table">
        <colgroup>
          <col class="proj-contract-gov-bg-col-type">
          <col class="proj-contract-gov-bg-col-amount">
          <col class="proj-contract-gov-bg-col-bank">
          <col class="proj-contract-gov-bg-col-expiry">
          <col class="proj-contract-gov-bg-col-status">
        </colgroup>
        <thead>
          <tr>
            <th>Type</th>
            <th class="proj-contract-gov-amount-h">Amount</th>
            <th>Bank</th>
            <th>Expiry</th>
            <th class="rep-col-status">Status</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>${escapeHtml(bgLabel)}</td>
            <td class="proj-contract-gov-amount-cell">${escapeHtml(formatBDT(project.bgAmount || 0))}</td>
            <td>${escapeHtml(project.bgBank || "—")}</td>
            <td>${escapeHtml(project.bgExpiryDate || "—")}</td>
            <td class="rep-col-status"><span class="proj-contract-gov-status-wrap">${statusChip(project.bgStatus || "active")}</span></td>
          </tr>
        </tbody>
      </table>
    </div>
    <div class="reports-widget-foot">
      <span class="reports-widget-foot-meta">Contract fields are maintained in the project profile.</span>
    </div>
  `;

  root.append(metricsSection, termsShell, particularsShell, guaranteesShell);
  return root;
}

export function buildDashboardTab(state, opts = {}) {
  const project = state.projects.find((p) => p.id === state.selectedProjectId);
  const card = sectionCard("Project KPI Dashboard", "Physical & financial progress — click a KPI to open the related module");
  const body = card.querySelector(".section-card-body");
  if (!project) {
    body.innerHTML = `<p class="proj-empty">Select a project first</p>`;
    return card;
  }

  const dateFrom = state.dashboardDateFrom || "";
  const dateTo = state.dashboardDateTo || "";

  const kpis = computeProjectKpis({
    project,
    boqItems: state.boqItems,
    measurements: state.measurementEntries,
    ipcBills: state.ipcBills,
    retentionLedger: state.retentionLedger,
    eotRequests: state.eotRequests,
    milestones: state.milestones,
  });

  const report = agencyReportRows({
    project,
    kpis,
    ipcBills: state.ipcBills,
    boqItems: state.boqItems,
    measurements: state.measurementEntries,
  });

  const ipcRows = report.ipcRows.filter((r) => {
    if (dateFrom && r.date < dateFrom) return false;
    if (dateTo && r.date > dateTo) return false;
    return true;
  });

  body.innerHTML = `
    <form class="form-grid proj-form-inline gov-dash-filter" id="gov-dash-filter">
      <label>From <input name="dateFrom" type="date" value="${dateFrom}" /></label>
      <label>To <input name="dateTo" type="date" value="${dateTo}" /></label>
      <button type="submit" class="btn btn-secondary btn-sm">Apply filter</button>
    </form>
    <div class="gov-kpi-grid">
      <button type="button" class="gov-kpi-card gov-kpi-card--link" data-tab="progress"><span class="cust-detail-label">Physical progress</span><strong>${kpis.physicalPct}%</strong></button>
      <button type="button" class="gov-kpi-card gov-kpi-card--link" data-tab="measurement"><span class="cust-detail-label">Financial progress</span><strong>${kpis.financialPct}%</strong></button>
      <button type="button" class="gov-kpi-card gov-kpi-card--link" data-tab="measurement"><span class="cust-detail-label">Certified</span><strong>${formatBDT(kpis.certified)}</strong></button>
      <button type="button" class="gov-kpi-card gov-kpi-card--link" data-tab="retention"><span class="cust-detail-label">Retention held</span><strong>${formatBDT(kpis.retentionHeld)}</strong></button>
      <button type="button" class="gov-kpi-card gov-kpi-card--link" data-tab="measurement"><span class="cust-detail-label">Open IPCs</span><strong>${kpis.openIpcs}</strong></button>
      <button type="button" class="gov-kpi-card gov-kpi-card--link" data-tab="contracts"><span class="cust-detail-label">LD exposure</span><strong>${formatBDT(kpis.ldAmount)} (${kpis.ldDays}d)</strong></button>
      <button type="button" class="gov-kpi-card gov-kpi-card--link" data-tab="milestones"><span class="cust-detail-label">Schedule slip</span><strong>${kpis.scheduleSlip} days</strong></button>
      <button type="button" class="gov-kpi-card gov-kpi-card--link" data-tab="contracts"><span class="cust-detail-label">Pending EOT</span><strong>${kpis.pendingEot}</strong></button>
    </div>
    <h4 class="r3-subhead">Agency report — BOQ consumption</h4>
    <div class="table-wrap">
      <table class="dash-table">
        <thead><tr><th>Code</th><th>Description</th><th>Unit</th><th>Contract</th><th>Measured</th><th>Rate</th><th>Amount</th></tr></thead>
        <tbody>
          ${report.boqRows.length ? report.boqRows.map((r) => `
            <tr>
              <td>${escapeHtml(r.code)}</td>
              <td>${escapeHtml(r.description)}</td>
              <td>${escapeHtml(r.unit)}</td>
              <td>${r.contractQty}</td>
              <td>${r.measuredQty}</td>
              <td>${formatBDT(r.rate)}</td>
              <td>${formatBDT(r.amount)}</td>
            </tr>`).join("") : '<tr class="empty-row"><td colspan="7">No BOQ lines</td></tr>'}
        </tbody>
      </table>
    </div>
    <h4 class="r3-subhead">IPC summary (${escapeHtml(report.agency)} · WO ${escapeHtml(report.workOrder)})</h4>
    <div class="table-wrap">
      <table class="dash-table">
        <thead><tr><th>Bill no</th><th>Date</th><th>This bill</th><th>Net payable</th><th>Status</th></tr></thead>
        <tbody>
          ${ipcRows.length ? ipcRows.map((r) => `
            <tr>
              <td>${escapeHtml(r.billNo)}</td>
              <td>${escapeHtml(r.date)}</td>
              <td>${formatBDT(r.thisBill)}</td>
              <td>${formatBDT(r.netPayable)}</td>
              <td>${statusChip(r.status)}</td>
            </tr>`).join("") : '<tr class="empty-row"><td colspan="5">No IPC bills yet</td></tr>'}
        </tbody>
      </table>
    </div>
  `.replace(/<\/?motion/g, (m) => m.replace("motion", "div"));

  body.querySelector("#gov-dash-filter")?.addEventListener("submit", (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    state.dashboardDateFrom = fd.get("dateFrom") || "";
    state.dashboardDateTo = fd.get("dateTo") || "";
    opts.onRefresh?.();
  });
  body.querySelectorAll(".gov-kpi-card--link").forEach((btn) => {
    btn.onclick = () => opts.onNavigateTab?.(btn.dataset.tab);
  });
  return card;
}

export function computeNeedsAttention(state, project) {
  const pid = project.id;
  const openIpc = (state.ipcBills || []).filter(
    (b) =>
      (!b.projectId || b.projectId === pid) &&
      (b.status === "draft" || b.status === "submitted")
  ).length;

  const overdueMilestones = (state.milestones || []).filter((m) => {
    if (m.projectId && m.projectId !== pid) return false;
    return milestoneVariance(m).key === "delayed";
  }).length;

  const pendingApprovals = [
    ...(state.measurementEntries || []),
    ...(state.ipcBills || []),
  ].filter((r) => {
    if (r.projectId && r.projectId !== pid) return false;
    return r.status === "submitted";
  }).length;

  const draftBoq = (state.boqItems || []).filter(
    (b) => (!b.projectId || b.projectId === pid) && b.status === "draft"
  ).length;

  const items = [];
  if (openIpc) {
    items.push({
      label: `${openIpc} open IPC bill${openIpc > 1 ? "s" : ""}`,
      tab: "measurement",
    });
  }
  if (overdueMilestones) {
    items.push({
      label: `${overdueMilestones} overdue milestone${overdueMilestones > 1 ? "s" : ""}`,
      tab: "milestones",
    });
  }
  if (pendingApprovals) {
    items.push({
      label: `${pendingApprovals} pending approval${pendingApprovals > 1 ? "s" : ""}`,
      tab: "measurement",
    });
  }
  if (draftBoq) {
    items.push({
      label: `${draftBoq} draft BOQ line${draftBoq > 1 ? "s" : ""}`,
      tab: "boq",
    });
  }
  if (project.complianceStatus === "non_compliant") {
    items.push({
      label: "Regulatory compliance incomplete",
      tab: "compliance",
    });
  }

  return { openIpc, overdueMilestones, pendingApprovals, draftBoq, items };
}

export function renderGovHomeHealthStrip(state, onNavigateTab) {
  const project = state.projects.find((p) => p.id === state.selectedProjectId);
  if (!project) return null;

  const kpis = computeProjectKpis({
    project,
    boqItems: state.boqItems,
    measurements: state.measurementEntries,
    ipcBills: state.ipcBills,
    retentionLedger: state.retentionLedger,
    eotRequests: state.eotRequests,
    milestones: state.milestones,
  });

  const strip = document.createElement("div");
  strip.className = "proj-home-health-strip";
  const widgets = [
    { label: "Physical", value: `${kpis.physicalPct}%`, tab: "progress" },
    { label: "Financial", value: `${kpis.financialPct}%`, tab: "measurement" },
    { label: "Certified", value: formatBDT(kpis.certified), tab: "measurement" },
    { label: "Open IPC", value: String(kpis.openIpcs), tab: "measurement" },
  ];

  strip.innerHTML = widgets
    .map(
      (w) => `<button type="button" class="proj-home-widget" data-tab="${w.tab}">
      <span class="proj-home-widget-label">${escapeHtml(w.label)}</span>
      <span class="proj-home-widget-value">${escapeHtml(w.value)}</span>
    </button>`
    )
    .join("");

  strip.querySelectorAll("[data-tab]").forEach((btn) => {
    btn.addEventListener("click", () => onNavigateTab?.(btn.dataset.tab));
  });
  return strip;
}

export function renderNeedsAttentionBlock(state, project, onNavigateTab) {
  const { items } = computeNeedsAttention(state, project);
  if (!items.length) return null;

  const el = document.createElement("div");
  el.className = "proj-home-attention";
  el.innerHTML = `
    <h4 class="proj-home-section-title">Needs attention</h4>
    <ul class="proj-home-attention-list">
      ${items
        .map(
          (i) =>
            `<li><button type="button" class="proj-home-attention-item" data-tab="${i.tab}">${escapeHtml(i.label)}</button></li>`
        )
        .join("")}
    </ul>
  `;
  el.querySelectorAll("[data-tab]").forEach((btn) => {
    btn.addEventListener("click", () => onNavigateTab?.(btn.dataset.tab));
  });
  return el;
}

async function createIpcBill(state, project, { billType = "running" } = {}) {
  for (const bill of state.ipcBills || []) {
    bill._lines = (state.ipcBillLines || []).filter((l) => l.ipcBillId === bill.id);
  }
  const ld = computeLiquidatedDamages(project, state.eotRequests);
  const draft = computeIpcDraft({
    project,
    boqItems: state.boqItems,
    measurements: state.measurementEntries,
    previousIpcs: state.ipcBills,
    ldDays: ld.days,
  });
  if (billType === "running" && draft.thisBill <= 0) {
    const approvedMb = (state.measurementEntries || []).filter((m) => m.status === "approved").length;
    throw new Error(
      approvedMb
        ? "No new measurable quantity since last IPC — add approved measurements first"
        : "No billable quantity — approve measurement book entries before generating IPC"
    );
  }
  const runningCount = (state.ipcBills || []).filter((b) => (b.billType || "running") === "running").length;
  const prefix = billType === "final" ? "FINAL" : "IPC";
  const billNo =
    billType === "final"
      ? `FINAL-${runningCount + 1}`
      : `IPC-${runningCount + 1}`;
  const now = Date.now();
  const billId = await create(`${GOV_PATHS.ipcBills}/${state.selectedProjectId}`, {
    ...govBase(),
    billNo,
    billType,
    billDate: new Date().toISOString().slice(0, 10),
    prevCertified: draft.prevCertified,
    thisBill: billType === "final" ? draft.cumulativeCertified - draft.prevCertified : draft.thisBill,
    cumulativeCertified: draft.cumulativeCertified,
    grossAmount: draft.grossAmount,
    retentionAmount: draft.retentionAmount,
    ldAmount: draft.ldAmount,
    taxAmount: draft.taxAmount,
    otherDeductions: draft.otherDeductions,
    netPayable: draft.netPayable,
    certificationStage: "site_engineer",
  });
  if (billType !== "final") {
    for (const line of draft.lines) {
      await create(`${GOV_PATHS.ipcBillLines}/${state.selectedProjectId}`, {
        ipcBillId: billId,
        boqId: line.boqId,
        itemCode: line.itemCode,
        description: line.description,
        unit: line.unit,
        rate: line.rate,
        prevQty: line.prevQty,
        thisQty: line.thisQty,
        cumulativeQty: line.cumulativeQty,
        amount: line.amount,
        createdAt: now,
        updatedAt: now,
      });
    }
    await create(`${GOV_PATHS.retentionLedger}/${state.selectedProjectId}`, {
      ipcBillId: billId,
      entryType: "hold",
      amount: draft.retentionAmount,
      balance: draft.retentionAmount,
      entryDate: new Date().toISOString().slice(0, 10),
      status: "held",
      remarks: `Retention ${draft.retentionPct}% on ${billNo}`,
      createdBy: getCurrentUserId(),
      createdAt: now,
      updatedAt: now,
    });
  }
  if (billType === "final") {
    await updatePath(`projects/${project.id}`, {
      ...project,
      finalBillStatus: "submitted",
      updatedAt: now,
    });
  }
  await auditProject(state, {
    entityType: "ipcBill",
    entityId: billId,
    action: "create",
    diffSummary: `Generated ${billNo} (${billType}) — ${formatBDT(draft.netPayable)} net`,
  });
  return billId;
}

function boqSelectOptions(state) {
  return [
    { value: "", label: "Select BOQ item" },
    ...(state.boqItems || []).map((b) => ({
      value: b.id,
      label: `${b.itemCode || ""} ${b.item || b.description || ""}`.trim() || b.id,
    })),
  ];
}

function openAddMeasurementDialog(state, opts = {}) {
  if (!state.selectedProjectId) {
    showToast("Select a project first", "error");
    return;
  }
  openCustFormDialog({
    title: "Add measurement",
    subtitle: "Record a measurement book entry against a BOQ line.",
    submitLabel: "Add measurement",
    modalClass: "proj-measurement-modal",
    values: {
      boqId: "",
      qty: "",
      measureDate: new Date().toISOString().slice(0, 10),
      locationRef: "",
      remarks: "",
    },
    sections: [
      {
        title: "Measurement",
        fields: [
          {
            name: "boqId",
            label: "BOQ item *",
            type: "select",
            required: true,
            options: boqSelectOptions(state),
          },
          { name: "qty", label: "Measured qty *", type: "number", step: "0.01", required: true },
          { name: "measureDate", label: "Date", type: "date" },
          { name: "locationRef", label: "Chainage / location", type: "text" },
          { name: "remarks", label: "Remarks", type: "textarea", fullWidth: true },
        ],
      },
    ],
    onSave: async (data) => {
      if (!data.boqId) {
        showToast("Select a BOQ item", "error");
        throw new Error("validation");
      }
      try {
        const id = await create(`${GOV_PATHS.measurementEntries}/${state.selectedProjectId}`, {
          ...govBase(),
          boqId: data.boqId,
          qty: Number(data.qty) || 0,
          measureDate: data.measureDate || "",
          locationRef: String(data.locationRef || "").trim(),
          measuredBy: getCurrentUserId(),
          remarks: String(data.remarks || "").trim(),
        });
        await auditProject(state, {
          entityType: "measurementEntry",
          entityId: id,
          action: "create",
          diffSummary: `Measurement ${data.qty} on BOQ ${data.boqId}`,
        });
        showToast("Measurement recorded");
        opts.onRefresh?.();
      } catch (err) {
        showToast(err.message, "error");
        throw err;
      }
    },
  });
}

function buildBoqCompareTable(state) {
  const measured = cumulativeMeasuredByBoq(state.measurementEntries || []);
  const rows = (state.boqItems || []).map((b) => {
    const contractQty = Number(b.qty || b.quantity || 0);
    const executed = measured[b.id] || 0;
    const remaining = Math.max(0, contractQty - executed);
    const variance = contractQty > 0 ? Math.round((executed / contractQty) * 100) : 0;
    return { b, contractQty, executed, remaining, variance };
  });
  const countLabel =
    rows.length === 1
      ? "Showing 1 of 1 BOQ line"
      : `Showing ${rows.length} of ${rows.length} BOQ lines`;
  const wrap = document.createElement("div");
  wrap.className = "reports-table-wrap proj-measurement-table proj-measurement-boq-shell";
  wrap.innerHTML = `
    <div class="proj-measurement-boq-head-row">
      <h4 class="proj-boq-section-title proj-measurement-boq-head">Quantity executed vs BOQ</h4>
    </div>
    <table class="dash-table projects-table">
      <colgroup>
        <col class="proj-measurement-boq-col-item" />
        <col class="proj-measurement-boq-col-equal" />
        <col class="proj-measurement-boq-col-equal" />
        <col class="proj-measurement-boq-col-equal" />
        <col class="proj-measurement-boq-col-progress" />
      </colgroup>
      <thead>
        <tr>
          <th>BOQ item</th>
          <th>Contract qty</th>
          <th>Measured</th>
          <th>Remaining</th>
          <th>Progress</th>
        </tr>
      </thead>
      <tbody>
        ${
          rows.length
            ? rows
                .map(
                  ({ b, contractQty, executed, remaining, variance }) => `
          <tr>
            <td><strong>${escapeHtml(b.itemCode || "")}</strong> ${escapeHtml(b.item || b.description || "")}</td>
            <td>${contractQty}</td>
            <td>${executed}</td>
            <td>${remaining}</td>
            <td>${variance}%</td>
          </tr>`
                )
                .join("")
            : '<tr class="empty-row"><td colspan="5">Add BOQ lines first</td></tr>'
        }
      </tbody>
    </table>
    <div class="reports-widget-foot">
      <span class="reports-widget-foot-meta">${escapeHtml(countLabel)}</span>
    </div>
  `;
  return wrap;
}

export function buildGovBillingTab(state, opts = {}) {
  const root = document.createElement("div");
  root.className = "proj-billing-tab proj-billing-tab--gov";
  const project = state.projects.find((p) => p.id === state.selectedProjectId);
  if (!project) {
    root.innerHTML = `<p class="proj-empty">Select a project first</p>`;
    return root;
  }

  const ipcRows = [...(state.ipcBills || [])].sort(
    (a, b) => (b.createdAt || 0) - (a.createdAt || 0)
  );
  const totalNet = ipcRows.reduce((a, r) => a + (Number(r.netPayable) || 0), 0);
  const pendingCert = ipcRows.filter((r) => (r.status || "draft") !== "certified").length;

  const metricsSection = document.createElement("section");
  metricsSection.className = "proj-boq-metrics proj-boq-metrics--planning proj-billing-metrics";
  metricsSection.innerHTML = `<h4 class="proj-boq-section-title">Billing overview</h4>`;
  metricsSection.appendChild(
    renderBoqStatGrid([
      { label: "IPC bills", value: ipcRows.length },
      { label: "Pending certification", value: pendingCert, attention: pendingCert > 0 },
      { label: "Total net payable", value: formatBDT(totalNet) },
    ])
  );
  const statGrid = metricsSection.querySelector(".proj-boq-stat-grid");
  if (statGrid) statGrid.classList.add("proj-billing-stat-grid");

  const countLabel =
    ipcRows.length === 1
      ? "Showing 1 of 1 bill"
      : `Showing ${ipcRows.length} of ${ipcRows.length} bills`;

  const tableWrap = document.createElement("div");
  tableWrap.className = "reports-table-wrap proj-billing-table proj-billing-ipc-shell";
  tableWrap.innerHTML = `
    <div class="proj-billing-table-head-row">
      <h4 class="proj-boq-section-title proj-billing-table-head">IPC bills</h4>
    </div>
    <table class="dash-table projects-table">
      <colgroup>
        <col class="proj-billing-ipc-col-bill" />
        <col class="proj-billing-ipc-col-equal" />
        <col class="proj-billing-ipc-col-equal" />
        <col class="proj-billing-ipc-col-amount" />
        <col class="proj-billing-ipc-col-amount" />
        <col class="proj-billing-ipc-col-equal" />
        <col class="proj-billing-ipc-col-equal" />
      </colgroup>
      <thead>
        <tr>
          <th>Bill</th>
          <th>Type</th>
          <th>Date</th>
          <th class="text-right">This bill</th>
          <th class="text-right">Net payable</th>
          <th>Stage</th>
          <th>Status</th>
        </tr>
      </thead>
      <tbody>
        ${
          ipcRows.length
            ? ipcRows
                .map((r) => {
                  const stage =
                    CERT_STAGES.find((s) => s.id === r.certificationStage)?.label ||
                    r.certificationStage;
                  const typeLabel = (r.billType || "running") === "final" ? "Final" : "Running";
                  return `<tr>
            <td><strong class="proj-billing-desc">${escapeHtml(r.billNo || r.id)}</strong></td>
            <td>${escapeHtml(typeLabel)}</td>
            <td>${escapeHtml(r.billDate || "—")}</td>
            <td class="text-right">${formatBDT(r.thisBill)}</td>
            <td class="text-right">${formatBDT(r.netPayable)}</td>
            <td>${escapeHtml(stage || "—")}</td>
            <td>${statusChip(r.status)}</td>
          </tr>`;
                })
                .join("")
            : '<tr class="empty-row"><td colspan="7">No IPC bills — generate from Measurement tab</td></tr>'
        }
      </tbody>
    </table>
    <div class="reports-widget-foot proj-billing-ipc-foot">
      <span class="reports-widget-foot-meta">${escapeHtml(countLabel)}</span>
      <button type="button" class="btn btn-secondary btn-sm proj-billing-measurement-link">Open Measurement Book & IPC</button>
    </div>
  `;

  root.append(metricsSection, tableWrap);

  tableWrap.querySelector(".proj-billing-measurement-link")?.addEventListener("click", () => {
    opts.onNavigateTab?.("measurement");
  });

  return root;
}

export function buildMeasurementTab(state, opts = {}) {
  const root = document.createElement("div");
  root.className = "proj-measurement-tab";
  const project = state.projects.find((p) => p.id === state.selectedProjectId);
  if (!project) {
    root.innerHTML = `<p class="proj-empty">Select a project first</p>`;
    return root;
  }

  const mbRows = state.measurementEntries || [];
  const kpis = computeProjectKpis({
    project,
    boqItems: state.boqItems,
    measurements: mbRows,
    ipcBills: state.ipcBills,
    retentionLedger: state.retentionLedger,
    eotRequests: state.eotRequests,
    milestones: state.milestones,
  });
  const approvedMb = mbRows.filter((m) => m.status === "approved").length;

  const metricsSection = document.createElement("section");
  metricsSection.className = "proj-boq-metrics proj-boq-metrics--planning proj-measurement-metrics";
  metricsSection.innerHTML = `<h4 class="proj-boq-section-title">Measurement overview</h4>`;
  metricsSection.appendChild(
    renderBoqStatGrid([
      { label: "MB entries", value: mbRows.length },
      { label: "Approved MB", value: approvedMb },
      { label: "Open IPCs", value: kpis.openIpcs, attention: kpis.openIpcs > 0 },
      { label: "Financial progress", value: `${kpis.financialPct}%` },
    ])
  );
  const statGrid = metricsSection.querySelector(".proj-boq-stat-grid");
  if (statGrid) statGrid.classList.add("proj-measurement-stat-grid");

  const mbCountLabel =
    mbRows.length === 1
      ? "Showing 1 of 1 measurement"
      : `Showing ${mbRows.length} of ${mbRows.length} measurements`;

  const mbTable = document.createElement("div");
  mbTable.className = "reports-table-wrap proj-measurement-table proj-measurement-mb-shell";
  mbTable.innerHTML = `
    <div class="proj-measurement-mb-head-row">
      <h4 class="proj-boq-section-title proj-measurement-mb-head">Measurement book</h4>
      <button type="button" class="btn btn-primary btn-sm proj-measurement-add-btn">Add measurement</button>
    </div>
    <table class="dash-table projects-table">
      <colgroup>
        <col class="proj-measurement-mb-col-date" />
        <col class="proj-measurement-mb-col-boq" />
        <col class="proj-measurement-mb-col-qty" />
        <col class="proj-measurement-mb-col-loc" />
        <col class="proj-measurement-mb-col-status" />
        <col class="proj-measurement-mb-col-actions" />
      </colgroup>
      <thead>
        <tr>
          <th>Date</th>
          <th>BOQ</th>
          <th>Qty</th>
          <th>Location</th>
          <th class="rep-col-status">Status</th>
          <th class="rep-col-actions">Actions</th>
        </tr>
      </thead>
      <tbody>
        ${
          mbRows.length
            ? mbRows
                .map((r) => {
                  const boq = (state.boqItems || []).find((b) => b.id === r.boqId);
                  const path = `${GOV_PATHS.measurementEntries}/${state.selectedProjectId}/${r.id}`;
                  const editBtn =
                    (r.status || "draft") === "draft"
                      ? `<button type="button" class="btn btn-edit btn-sm mb-edit-btn" data-id="${escapeHtml(r.id)}">Edit</button>`
                      : "";
                  return `<tr data-measurement-id="${escapeHtml(r.id)}">
            <td>${escapeHtml(r.measureDate || "—")}</td>
            <td>${escapeHtml(boq?.item || r.boqId)}</td>
            <td>${escapeHtml(String(r.qty ?? "—"))}</td>
            <td>${escapeHtml(r.locationRef || "—")}</td>
            <td class="rep-col-status">${statusChip(r.status)}</td>
            <td class="rep-col-actions proj-row-actions-cell">
              <span class="proj-measurement-mb-actions">${workflowButtonsHtml(r, path, "measurementEntry")}${editBtn}</span>
            </td>
          </tr>`;
                })
                .join("")
            : '<tr class="empty-row"><td colspan="6">No measurements — click Add measurement</td></tr>'
        }
      </tbody>
    </table>
    <div class="reports-widget-foot">
      <span class="reports-widget-foot-meta">${escapeHtml(mbCountLabel)}</span>
    </div>
  `;

  const ipcFilter = state.ipcBillFilter || "all";
  const ipcRows = (state.ipcBills || []).filter((r) => {
    if (ipcFilter === "all") return true;
    return (r.billType || "running") === ipcFilter;
  });
  const ipcCountLabel =
    ipcRows.length === 1
      ? "Showing 1 of 1 bill"
      : `Showing ${ipcRows.length} of ${ipcRows.length} bills`;

  const ipcTable = document.createElement("div");
  ipcTable.className = "reports-table-wrap proj-measurement-table proj-measurement-ipc-shell";
  ipcTable.innerHTML = `
    <div class="proj-measurement-ipc-head-row">
      <h4 class="proj-boq-section-title proj-measurement-ipc-head">IPC / RA Bills</h4>
      <div class="proj-measurement-ipc-head-actions">
        <div class="portfolio-view-toggle proj-measurement-ipc-filter">
          <button type="button" class="portfolio-view-btn${ipcFilter === "all" ? " is-active" : ""}" data-filter="all">All</button>
          <button type="button" class="portfolio-view-btn${ipcFilter === "running" ? " is-active" : ""}" data-filter="running">Running</button>
          <button type="button" class="portfolio-view-btn${ipcFilter === "final" ? " is-active" : ""}" data-filter="final">Final</button>
        </div>
        <button type="button" class="btn btn-secondary btn-sm proj-measurement-gen-ipc-btn">Generate running bill (IPC)</button>
        <button type="button" class="btn btn-primary btn-sm proj-measurement-gen-final-btn">Generate final bill</button>
      </div>
    </div>
    <table class="dash-table projects-table">
      <colgroup>
        <col class="proj-measurement-ipc-col-bill" />
        <col class="proj-measurement-ipc-col-type" />
        <col class="proj-measurement-ipc-col-date" />
        <col class="proj-measurement-ipc-col-amount" />
        <col class="proj-measurement-ipc-col-amount" />
        <col class="proj-measurement-ipc-col-amount" />
        <col class="proj-measurement-ipc-col-amount" />
        <col class="proj-measurement-ipc-col-stage" />
        <col class="proj-measurement-ipc-col-status" />
        <col class="proj-measurement-ipc-col-actions" />
      </colgroup>
      <thead>
        <tr>
          <th>Bill</th>
          <th>Type</th>
          <th>Date</th>
          <th class="proj-measurement-amount-h">This bill</th>
          <th class="proj-measurement-amount-h">Retention</th>
          <th class="proj-measurement-amount-h">LD</th>
          <th class="proj-measurement-amount-h">Net</th>
          <th>Stage</th>
          <th class="rep-col-status">Status</th>
          <th class="rep-col-actions">Actions</th>
        </tr>
      </thead>
      <tbody>
        ${
          ipcRows.length
            ? ipcRows
                .map((r) => {
                  const path = `${GOV_PATHS.ipcBills}/${state.selectedProjectId}/${r.id}`;
                  const stage =
                    CERT_STAGES.find((s) => s.id === r.certificationStage)?.label ||
                    r.certificationStage;
                  const typeLabel = (r.billType || "running") === "final" ? "Final" : "Running";
                  return `<tr data-ipc-id="${escapeHtml(r.id)}">
            <td><strong class="proj-measurement-bill-no">${escapeHtml(r.billNo || r.id)}</strong></td>
            <td>${escapeHtml(typeLabel)}</td>
            <td>${escapeHtml(r.billDate || "—")}</td>
            <td class="proj-measurement-amount-cell">${formatBDT(r.thisBill)}</td>
            <td class="proj-measurement-amount-cell">${formatBDT(r.retentionAmount)}</td>
            <td class="proj-measurement-amount-cell">${formatBDT(r.ldAmount)}</td>
            <td class="proj-measurement-amount-cell">${formatBDT(r.netPayable)}</td>
            <td>${escapeHtml(stage || "—")}</td>
            <td class="rep-col-status">${statusChip(r.status)}</td>
            <td class="rep-col-actions proj-row-actions-cell">
              <span class="proj-measurement-ipc-actions">${workflowButtonsHtml(r, path, "ipcBill")}</span>
            </td>
          </tr>`;
                })
                .join("")
            : '<tr class="empty-row"><td colspan="10">No IPC bills</td></tr>'
        }
      </tbody>
    </table>
    <div class="reports-widget-foot">
      <span class="reports-widget-foot-meta">${escapeHtml(ipcCountLabel)}</span>
    </div>
  `;

  root.append(metricsSection, buildBoqCompareTable(state), mbTable, ipcTable);

  mbTable.querySelector(".proj-measurement-add-btn")?.addEventListener("click", () =>
    openAddMeasurementDialog(state, opts)
  );

  mbTable.querySelectorAll(".mb-edit-btn").forEach((btn) => {
    btn.onclick = () => {
      const row = mbRows.find((x) => x.id === btn.dataset.id);
      if (!row) return;
      openEditDialog(
        "Edit measurement",
        [
          { name: "qty", label: "Measured qty *", type: "number", step: "0.01", required: true },
          { name: "measureDate", label: "Date", type: "date" },
          { name: "locationRef", label: "Location" },
          { name: "remarks", label: "Remarks", type: "textarea" },
        ],
        row,
        async (vals) => {
          await updatePath(`${GOV_PATHS.measurementEntries}/${state.selectedProjectId}/${row.id}`, {
            ...row,
            qty: Number(vals.qty) || 0,
            measureDate: vals.measureDate || "",
            locationRef: String(vals.locationRef || "").trim(),
            remarks: String(vals.remarks || "").trim(),
            updatedAt: Date.now(),
          });
          showToast("Measurement updated");
        }
      );
    };
  });

  ipcTable.querySelectorAll("[data-filter]").forEach((btn) => {
    btn.onclick = () => {
      state.ipcBillFilter = btn.dataset.filter;
      opts.onRefresh?.();
    };
  });

  ipcTable.querySelector(".proj-measurement-gen-ipc-btn")?.addEventListener("click", async () => {
    try {
      await createIpcBill(state, project, { billType: "running" });
      showToast("Running IPC bill generated");
    } catch (err) {
      showToast(err.message, "error");
    }
  });

  ipcTable.querySelector(".proj-measurement-gen-final-btn")?.addEventListener("click", async () => {
    if (
      !(await confirmAction({
        title: "Generate final bill?",
        message: "Generate final bill for project close-out?",
        confirmLabel: "Generate",
      }))
    ) {
      return;
    }
    try {
      await createIpcBill(state, project, { billType: "final" });
      showToast("Final bill generated");
    } catch (err) {
      showToast(err.message, "error");
    }
  });

  wireWorkflowButtons(mbTable, (btn) => ({
    projectId: state.selectedProjectId,
    entityType: "measurementEntry",
    title: mbRows.find((x) => x.id === btn.dataset.id)?.qty,
  }));

  wireWorkflowButtons(ipcTable, (btn) => {
    const row = ipcRows.find((x) => x.id === btn.dataset.id);
    return {
      projectId: state.selectedProjectId,
      entityType: "ipcBill",
      title: row?.billNo,
      onApproved: async (ipc) => {
        const stages = ["site_engineer", "resident_engineer", "executive_engineer", "accounts"];
        const idx = stages.indexOf(ipc.certificationStage || "site_engineer");
        if (idx < stages.length - 1) {
          await updatePath(`${GOV_PATHS.ipcBills}/${state.selectedProjectId}/${row.id}`, {
            ...row,
            certificationStage: stages[idx + 1],
            status: "submitted",
            updatedAt: Date.now(),
          });
          return;
        }
        const voucherNo = await postIpcPaymentVoucher({
          projectId: state.selectedProjectId,
          ipcBill: { ...row, ...ipc },
          projectName: project.name,
        });
        await updatePath(`${GOV_PATHS.ipcBills}/${state.selectedProjectId}/${row.id}`, {
          ...row,
          ...ipc,
          status: "certified",
          voucherId: voucherNo,
          updatedAt: Date.now(),
        });
      },
    };
  });

  return root;
}

const FINAL_BILL_STATUS_OPTIONS = [
  { value: "pending", label: "Pending" },
  { value: "submitted", label: "Submitted" },
  { value: "certified", label: "Certified" },
  { value: "closed", label: "Closed" },
];

function openEditRetentionConditionsDialog(state, project, opts = {}) {
  openCustFormDialog({
    title: "Edit release conditions",
    subtitle: "Certificate, DLP, and defects liability requirements for retention release.",
    submitLabel: "Save conditions",
    modalClass: "proj-retention-conditions-modal",
    values: {
      retentionReleaseConditions: project.retentionReleaseConditions || "",
    },
    sections: [
      {
        title: "Release conditions",
        fields: [
          {
            name: "retentionReleaseConditions",
            label: "Conditions",
            type: "textarea",
            fullWidth: true,
            hint: "Retention release conditions (certificate, DLP, defects liability...)",
          },
        ],
      },
    ],
    onSave: async (data) => {
      try {
        await updatePath(`projects/${project.id}`, {
          ...project,
          retentionReleaseConditions: String(data.retentionReleaseConditions || "").trim(),
          updatedAt: Date.now(),
        });
        showToast("Release conditions saved");
        opts.onRefresh?.();
      } catch (err) {
        showToast(err.message, "error");
        throw err;
      }
    },
  });
}

function openRecordRetentionReleaseDialog(state, project, balance, opts = {}) {
  openCustFormDialog({
    title: "Record retention release",
    subtitle: `Available balance: ${formatBDT(balance)}`,
    submitLabel: "Record release",
    modalClass: "proj-retention-release-modal",
    values: {
      amount: "",
      releaseDate: new Date().toISOString().slice(0, 10),
      remarks: "",
    },
    sections: [
      {
        title: "Release details",
        fields: [
          { name: "amount", label: "Release amount (BDT) *", type: "number", step: "0.01", required: true },
          { name: "releaseDate", label: "Release date", type: "date" },
          { name: "remarks", label: "Certificate ref / remarks", type: "text", fullWidth: true },
        ],
      },
    ],
    onSave: async (data) => {
      const amount = Number(data.amount) || 0;
      if (amount <= 0) {
        showToast("Amount must be positive", "error");
        throw new Error("validation");
      }
      if (amount > balance) {
        showToast(`Release amount cannot exceed balance (${formatBDT(balance)})`, "error");
        throw new Error("validation");
      }
      if (
        !(await confirmAction({
          title: "Record retention release?",
          message: `Release ${formatBDT(amount)} from retention balance ${formatBDT(balance)}?`,
          confirmLabel: "Release",
        }))
      ) {
        throw new Error("cancelled");
      }
      const now = Date.now();
      try {
        await create(`${GOV_PATHS.retentionLedger}/${state.selectedProjectId}`, {
          entryType: "release",
          amount,
          balance: Math.max(0, balance - amount),
          releaseDate: data.releaseDate || "",
          entryDate: data.releaseDate || "",
          remarks: String(data.remarks || "").trim() || "Retention release",
          status: "released",
          createdBy: getCurrentUserId(),
          createdAt: now,
          updatedAt: now,
        });
        showToast("Retention release recorded");
        opts.onRefresh?.();
      } catch (err) {
        if (err.message !== "cancelled" && err.message !== "validation") {
          showToast(err.message, "error");
        }
        throw err;
      }
    },
  });
}

function openUpdateFinalBillDialog(state, project, opts = {}) {
  openCustFormDialog({
    title: "Update DLP / final bill",
    subtitle: "Defects liability period end date and final bill workflow status.",
    submitLabel: "Save updates",
    modalClass: "proj-retention-final-modal",
    values: {
      dlpEndDate: project.dlpEndDate || "",
      finalBillStatus: project.finalBillStatus || "pending",
    },
    sections: [
      {
        title: "Close-out",
        fields: [
          { name: "dlpEndDate", label: "DLP end date", type: "date" },
          {
            name: "finalBillStatus",
            label: "Final bill status",
            type: "select",
            options: FINAL_BILL_STATUS_OPTIONS,
          },
        ],
      },
    ],
    onSave: async (data) => {
      try {
        await updatePath(`projects/${project.id}`, {
          ...project,
          dlpEndDate: data.dlpEndDate || null,
          finalBillStatus: data.finalBillStatus || "pending",
          updatedAt: Date.now(),
        });
        showToast("Final bill status updated");
        opts.onRefresh?.();
      } catch (err) {
        showToast(err.message, "error");
        throw err;
      }
    },
  });
}

export function buildRetentionTab(state, opts = {}) {
  const root = document.createElement("div");
  root.className = "proj-retention-tab";
  const project = state.projects.find((p) => p.id === state.selectedProjectId);
  if (!project) {
    root.innerHTML = `<p class="proj-empty">Select a project first</p>`;
    return root;
  }

  const { held, released, balance } = computeRetentionBalance(state.retentionLedger);
  const dlpEnd = project.dlpEndDate || project.completionDate || "—";
  const finalBillLabel =
    FINAL_BILL_STATUS_OPTIONS.find((o) => o.value === (project.finalBillStatus || "pending"))?.label ||
    project.finalBillStatus ||
    "Pending";

  const metricsSection = document.createElement("section");
  metricsSection.className = "proj-boq-metrics proj-boq-metrics--planning proj-retention-metrics";
  metricsSection.innerHTML = `<h4 class="proj-boq-section-title">Retention overview</h4>`;
  metricsSection.appendChild(
    renderBoqStatGrid([
      { label: "Retention held", value: formatBDT(balance) },
      { label: "Total held", value: formatBDT(held) },
      { label: "Released", value: formatBDT(released) },
      { label: "DLP end", value: String(dlpEnd) },
    ])
  );
  const statGrid = metricsSection.querySelector(".proj-boq-stat-grid");
  if (statGrid) statGrid.classList.add("proj-retention-stat-grid");

  const conditionsText = project.retentionReleaseConditions?.trim()
    ? escapeHtml(project.retentionReleaseConditions)
    : `<span class="text-muted">No conditions set — click Edit conditions to add release requirements.</span>`;

  const conditionsShell = document.createElement("div");
  conditionsShell.className = "reports-table-wrap proj-retention-conditions-shell";
  conditionsShell.innerHTML = `
    <div class="proj-retention-conditions-head-row">
      <h4 class="proj-boq-section-title proj-retention-conditions-head">Release conditions</h4>
      <button type="button" class="btn btn-edit btn-sm proj-retention-edit-conditions-btn">Edit conditions</button>
    </div>
    <p class="proj-retention-conditions-text">${conditionsText}</p>
    <div class="proj-retention-final-bill-meta">
      <span class="text-muted">Final bill:</span> ${statusChip(project.finalBillStatus || "pending")}
      <span class="proj-retention-final-bill-label text-muted">${escapeHtml(finalBillLabel)}</span>
    </div>
  `;

  const ledgerRows = state.retentionLedger || [];
  const countLabel =
    ledgerRows.length === 1
      ? "Showing 1 of 1 entry"
      : `Showing ${ledgerRows.length} of ${ledgerRows.length} entries`;

  const ledgerShell = document.createElement("div");
  ledgerShell.className = "reports-table-wrap proj-retention-table proj-retention-ledger-shell";
  ledgerShell.innerHTML = `
    <div class="proj-retention-ledger-head-row">
      <h4 class="proj-boq-section-title proj-retention-ledger-head">Retention ledger</h4>
      <div class="proj-retention-ledger-head-actions">
        <button type="button" class="btn btn-primary btn-sm proj-retention-release-btn">Record retention release</button>
        <button type="button" class="btn btn-secondary btn-sm proj-retention-final-btn">Update DLP / final bill</button>
      </div>
    </div>
    <table class="dash-table projects-table">
      <colgroup>
        <col class="proj-retention-col-type" />
        <col class="proj-retention-col-date" />
        <col class="proj-retention-col-amount" />
        <col class="proj-retention-col-amount" />
        <col class="proj-retention-col-remarks" />
        <col class="proj-retention-col-status" />
      </colgroup>
      <thead>
        <tr>
          <th>Type</th>
          <th>Date</th>
          <th class="proj-retention-amount-h">Amount</th>
          <th class="proj-retention-amount-h">Balance</th>
          <th>Remarks</th>
          <th class="rep-col-status">Status</th>
        </tr>
      </thead>
      <tbody>
        ${
          ledgerRows.length
            ? ledgerRows
                .map(
                  (r) => `
          <tr>
            <td>${escapeHtml(r.entryType || "—")}</td>
            <td>${escapeHtml(r.entryDate || r.releaseDate || "—")}</td>
            <td class="proj-retention-amount-cell">${formatBDT(r.amount)}</td>
            <td class="proj-retention-amount-cell">${formatBDT(r.balance)}</td>
            <td>${escapeHtml(r.remarks || "—")}</td>
            <td class="rep-col-status">${statusChip(r.status || "held")}</td>
          </tr>`
                )
                .join("")
            : '<tr class="empty-row"><td colspan="6">No retention entries — record a release when eligible</td></tr>'
        }
      </tbody>
    </table>
    <div class="reports-widget-foot">
      <span class="reports-widget-foot-meta">${escapeHtml(countLabel)}</span>
    </div>
  `;

  root.append(metricsSection, conditionsShell, ledgerShell);

  conditionsShell.querySelector(".proj-retention-edit-conditions-btn")?.addEventListener("click", () =>
    openEditRetentionConditionsDialog(state, project, opts)
  );
  ledgerShell.querySelector(".proj-retention-release-btn")?.addEventListener("click", () =>
    openRecordRetentionReleaseDialog(state, project, balance, opts)
  );
  ledgerShell.querySelector(".proj-retention-final-btn")?.addEventListener("click", () =>
    openUpdateFinalBillDialog(state, project, opts)
  );

  return root;
}

function checklistStatusChip(status) {
  const s = String(status || "pending").toLowerCase();
  if (s === "done") return `<span class="chip chip-success">Done</span>`;
  if (s === "na") return `<span class="chip chip-muted">N/A</span>`;
  return `<span class="chip chip-warning">Pending</span>`;
}

async function syncProjectComplianceStatus(state, project) {
  const status = computeComplianceStatus(state.govComplianceChecklist || []);
  if (status === (project.complianceStatus || "pending")) return;
  await updatePath(`projects/${project.id}`, {
    ...project,
    complianceStatus: status,
    updatedAt: Date.now(),
  });
}

export function buildComplianceTab(state, opts = {}) {
  const root = document.createElement("div");
  root.className = "proj-compliance-tab";
  const project = state.projects.find((p) => p.id === state.selectedProjectId);
  if (!project) {
    root.innerHTML = `<p class="proj-empty">Select a project first</p>`;
    return root;
  }

  const items = state.govComplianceChecklist || [];
  const overallStatus = project.complianceStatus || computeComplianceStatus(items);
  const doneCount = items.filter((i) => i.status === "done").length;
  const pendingCount = items.filter((i) => i.status === "pending").length;
  const agencyTemplate = project.employerAgency || items[0]?.agency || "—";
  const countLabel =
    items.length === 1
      ? "Showing 1 of 1 requirement"
      : `Showing ${items.length} of ${items.length} requirements`;

  const metricsSection = document.createElement("section");
  metricsSection.className = "proj-boq-metrics proj-boq-metrics--planning proj-compliance-metrics";
  metricsSection.innerHTML = `<h4 class="proj-boq-section-title">Compliance overview</h4>`;
  metricsSection.appendChild(
    renderBoqStatGrid([
      { label: "Checklist items", value: items.length },
      { label: "Completed", value: doneCount },
      { label: "Pending", value: pendingCount, attention: pendingCount > 0 },
      { label: "Overall status", value: complianceStatusLabel(overallStatus) },
    ])
  );
  const statGrid = metricsSection.querySelector(".proj-boq-stat-grid");
  if (statGrid) statGrid.classList.add("proj-compliance-stat-grid");

  const checklistShell = document.createElement("div");
  checklistShell.className = "reports-table-wrap proj-compliance-table proj-compliance-checklist-shell";
  checklistShell.innerHTML = `
    <div class="proj-compliance-checklist-head-row">
      <h4 class="proj-boq-section-title proj-compliance-checklist-head">Regulatory checklist</h4>
      <label class="proj-compliance-override">
        Override status
        <select class="toolbar-select" id="gov-compliance-override">
          <option value="pending" ${project.complianceStatus === "pending" ? "selected" : ""}>Pending</option>
          <option value="compliant" ${project.complianceStatus === "compliant" ? "selected" : ""}>Compliant</option>
          <option value="non_compliant" ${project.complianceStatus === "non_compliant" ? "selected" : ""}>Non-compliant</option>
        </select>
      </label>
    </div>
    <div class="proj-compliance-overall-meta">
      <span>Overall:</span> ${complianceChip(overallStatus)}
      <span class="text-muted">Agency template: ${escapeHtml(agencyTemplate)}</span>
    </div>
    <table class="dash-table projects-table">
      <colgroup>
        <col class="proj-compliance-col-req">
        <col class="proj-compliance-col-agency">
        <col class="proj-compliance-col-status">
        <col class="proj-compliance-col-actions">
      </colgroup>
      <thead>
        <tr>
          <th>Requirement</th>
          <th class="proj-compliance-agency-h">Agency</th>
          <th class="rep-col-status">Status</th>
          <th class="rep-col-actions">Update status</th>
        </tr>
      </thead>
      <tbody>
        ${
          items.length
            ? items
                .map(
                  (item) => `
          <tr data-id="${escapeHtml(item.id)}">
            <td class="proj-compliance-req-cell">${escapeHtml(item.label || item.title || "")}</td>
            <td class="proj-compliance-agency-cell">${escapeHtml(item.agency || project.employerAgency || "—")}</td>
            <td class="rep-col-status"><span class="proj-compliance-status-wrap">${checklistStatusChip(item.status || "pending")}</span></td>
            <td class="rep-col-actions">
              <select class="toolbar-select gov-checklist-status" data-id="${escapeHtml(item.id)}">
                <option value="pending" ${item.status === "pending" ? "selected" : ""}>Pending</option>
                <option value="done" ${item.status === "done" ? "selected" : ""}>Done</option>
                <option value="na" ${item.status === "na" ? "selected" : ""}>N/A</option>
              </select>
            </td>
          </tr>`
                )
                .join("")
            : '<tr class="empty-row"><td colspan="4">No checklist items — re-save project profile to seed</td></tr>'
        }
      </tbody>
    </table>
    <div class="reports-widget-foot">
      <span class="reports-widget-foot-meta">${escapeHtml(countLabel)}</span>
    </div>
  `;

  checklistShell.querySelectorAll(".gov-checklist-status").forEach((sel) => {
    sel.onchange = async () => {
      const item = items.find((i) => i.id === sel.dataset.id);
      if (!item) return;
      try {
        await updatePath(`${GOV_PATHS.govComplianceChecklist}/${state.selectedProjectId}/${item.id}`, {
          ...item,
          status: sel.value,
          updatedAt: Date.now(),
        });
        item.status = sel.value;
        await syncProjectComplianceStatus(state, project);
        showToast("Checklist updated");
        opts.onRefresh?.();
      } catch (err) {
        showToast(err.message, "error");
      }
    };
  });

  checklistShell.querySelector("#gov-compliance-override")?.addEventListener("change", async (e) => {
    try {
      await updatePath(`projects/${project.id}`, {
        ...project,
        complianceStatus: e.target.value,
        updatedAt: Date.now(),
      });
      showToast("Compliance status updated");
      opts.onRefresh?.();
    } catch (err) {
      showToast(err.message, "error");
    }
  });

  root.append(metricsSection, checklistShell);
  return root;
}
