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
import { auditProject, openEditDialog } from "./cmp_projectTab.js";

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

export function buildContractTab(state, opts = {}) {
  const project = state.projects.find((p) => p.id === state.selectedProjectId);
  const card = sectionCard("Contract", "Read-only contract summary — edit details in project profile");
  const body = card.querySelector(".section-card-body");
  if (!project) {
    body.innerHTML = `<p class="proj-empty">Select a project first</p>`;
    return card;
  }

  const certified = (state.ipcBills || [])
    .filter((b) => b.status === "approved" || b.status === "certified")
    .reduce((max, b) => Math.max(max, Number(b.cumulativeCertified || 0)), 0);
  const cv = Number(project.contractValue || 0);
  const { balance: retentionBalance } = computeRetentionBalance(state.retentionLedger || []);
  const tenderDoc = project.tenderDocUrl
    ? `<a href="${escapeHtml(project.tenderDocUrl)}" target="_blank" rel="noopener">Open tender document</a>`
    : "—";

  const tenderBlock = document.createElement("div");
  tenderBlock.className = "gov-tender-block";
  tenderBlock.innerHTML = `
    <h4 class="r3-subhead">Tender / e-GP</h4>
    <div class="r2-budget-summary gov-contract-summary">
      <div class="r2-stat"><span class="cust-detail-label">Tender ref</span><strong>${escapeHtml(project.tenderRef || "—")}</strong></div>
      <div class="r2-stat"><span class="cust-detail-label">Notice date</span><strong>${escapeHtml(project.tenderNoticeDate || "—")}</strong></div>
      <div class="r2-stat"><span class="cust-detail-label">Submission deadline</span><strong>${escapeHtml(project.tenderSubmissionDeadline || "—")}</strong></div>
      <div class="r2-stat"><span class="cust-detail-label">Document</span><strong>${tenderDoc}</strong></div>
    </div>
  `;

  const woBlock = document.createElement("div");
  woBlock.className = "gov-wo-block";
  woBlock.innerHTML = `
    <h4 class="r3-subhead">Work order (কার্যাদেশ)</h4>
    <div class="r2-budget-summary gov-contract-summary">
      <div class="r2-stat"><span class="cust-detail-label">Reference</span><strong>${escapeHtml(project.workOrderNo || "—")}</strong></div>
      <div class="r2-stat"><span class="cust-detail-label">Issue date</span><strong>${escapeHtml(project.workOrderIssueDate || "—")}</strong></div>
    </div>
    ${project.workOrderScope ? `<p class="gov-wo-scope">${escapeHtml(project.workOrderScope)}</p>` : ""}
  `;

  const summaryFixed = document.createElement("div");
  summaryFixed.className = "r2-budget-summary gov-contract-summary";
  summaryFixed.innerHTML = `
    <div class="r2-stat"><span class="cust-detail-label">Employer agency</span><strong>${escapeHtml(project.employerAgency || "—")}</strong></div>
    <div class="r2-stat"><span class="cust-detail-label">Contract value</span><strong>${formatBDT(cv)}</strong></div>
    <div class="r2-stat"><span class="cust-detail-label">Certified to date</span><strong>${formatBDT(certified)}</strong></div>
    <div class="r2-stat"><span class="cust-detail-label">Certified %</span><strong>${cv > 0 ? Math.round((certified / cv) * 100) : 0}%</strong></div>
    <div class="r2-stat"><span class="cust-detail-label">Retention held</span><strong>${formatBDT(retentionBalance)}</strong></div>
    <div class="r2-stat"><span class="cust-detail-label">Compliance</span><strong>${complianceChip(project.complianceStatus)}</strong></div>
    <div class="r2-stat"><span class="cust-detail-label">Completion</span><strong>${escapeHtml(project.completionDate || "—")}</strong></div>
  `.replace(/<\/?motion/g, (m) => m.replace("motion", "div"));

  const pgBlock = document.createElement("div");
  pgBlock.className = "gov-pg-block";
  pgBlock.innerHTML = `
    <h4 class="r3-subhead">Performance guarantee</h4>
    <div class="r2-budget-summary gov-contract-summary">
      <div class="r2-stat"><span class="cust-detail-label">Amount</span><strong>${formatBDT(project.performanceGuaranteeAmount || 0)}</strong></div>
    </div>
  `;

  const bgLabel = BG_TYPES.find((t) => t.id === project.bgType)?.label || project.bgType || "—";
  const bgBlock = document.createElement("div");
  bgBlock.className = "gov-bg-block";
  bgBlock.innerHTML = `
    <h4 class="r3-subhead">Bank guarantee</h4>
    <div class="r2-budget-summary gov-contract-summary">
      <div class="r2-stat"><span class="cust-detail-label">Type</span><strong>${escapeHtml(bgLabel)}</strong></div>
      <div class="r2-stat"><span class="cust-detail-label">Amount</span><strong>${formatBDT(project.bgAmount || 0)}</strong></div>
      <div class="r2-stat"><span class="cust-detail-label">Bank</span><strong>${escapeHtml(project.bgBank || "—")}</strong></div>
      <div class="r2-stat"><span class="cust-detail-label">Expiry</span><strong>${escapeHtml(project.bgExpiryDate || "—")}</strong></div>
      <div class="r2-stat"><span class="cust-detail-label">Status</span><strong>${statusChip(project.bgStatus || "active")}</strong></div>
    </div>
  `.replace(/<\/?motion/g, (m) => m.replace("motion", "div"));

  const note = document.createElement("p");
  note.className = "text-muted proj-contract-note";
  note.textContent = "Contract fields are maintained in the project profile to avoid duplicate entry.";

  const editBtn = document.createElement("button");
  editBtn.type = "button";
  editBtn.className = "btn btn-primary btn-sm";
  editBtn.textContent = "Edit profile";
  editBtn.onclick = () => opts.onEditMaster?.();

  const complianceBtn = document.createElement("button");
  complianceBtn.type = "button";
  complianceBtn.className = "btn btn-ghost btn-sm";
  complianceBtn.textContent = "View compliance checklist →";
  complianceBtn.onclick = () => opts.onNavigateTab?.("compliance");

  body.innerHTML = "";
  body.append(tenderBlock, woBlock, summaryFixed, pgBlock, bgBlock, note, editBtn, complianceBtn);
  return card;
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
      <button type="submit" class="btn btn-ghost btn-sm">Apply filter</button>
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

function buildBoqCompareTable(state) {
  const measured = cumulativeMeasuredByBoq(state.measurementEntries || []);
  const rows = (state.boqItems || []).map((b) => {
    const contractQty = Number(b.qty || b.quantity || 0);
    const executed = measured[b.id] || 0;
    const remaining = Math.max(0, contractQty - executed);
    const variance = contractQty > 0 ? Math.round((executed / contractQty) * 100) : 0;
    return { b, contractQty, executed, remaining, variance };
  });
  const wrap = document.createElement("div");
  wrap.className = "table-wrap gov-boq-compare";
  wrap.innerHTML = `
    <h4 class="r3-subhead">Quantity executed vs BOQ</h4>
    <table class="dash-table">
      <thead><tr><th>BOQ item</th><th>Contract qty</th><th>Measured</th><th>Remaining</th><th>Progress</th></tr></thead>
      <tbody>
        ${rows.length ? rows.map(({ b, contractQty, executed, remaining, variance }) => `
          <tr>
            <td><strong>${escapeHtml(b.itemCode || "")}</strong> ${escapeHtml(b.item || b.description || "")}</td>
            <td>${contractQty}</td>
            <td>${executed}</td>
            <td>${remaining}</td>
            <td>${variance}%</td>
          </tr>`).join("") : '<tr class="empty-row"><td colspan="5">Add BOQ lines first</td></tr>'}
      </tbody>
    </table>
  `;
  return wrap;
}

export function buildGovBillingTab(state, opts = {}) {
  const project = state.projects.find((p) => p.id === state.selectedProjectId);
  const card = sectionCard(
    "Government billing (IPC)",
    "Running account bills from Measurement Book — certify on Measurement tab"
  );
  const body = card.querySelector(".section-card-body");
  if (!project) {
    body.innerHTML = `<p class="proj-empty">Select a project first</p>`;
    return card;
  }

  const ipcRows = [...(state.ipcBills || [])].sort(
    (a, b) => (b.createdAt || 0) - (a.createdAt || 0)
  );
  const totalNet = ipcRows.reduce((a, r) => a + (Number(r.netPayable) || 0), 0);
  const pendingCert = ipcRows.filter((r) => (r.status || "draft") !== "certified").length;

  const summary = document.createElement("div");
  summary.className = "gov-billing-summary r2-budget-summary";
  summary.innerHTML = `
    <div class="r2-stat"><span class="cust-detail-label">IPC bills</span><strong>${ipcRows.length}</strong></div>
    <div class="r2-stat"><span class="cust-detail-label">Pending certification</span><strong>${pendingCert}</strong></div>
    <div class="r2-stat"><span class="cust-detail-label">Total net payable</span><strong>${formatBDT(totalNet)}</strong></div>
  `;

  const navBtn = document.createElement("button");
  navBtn.type = "button";
  navBtn.className = "btn btn-secondary btn-sm";
  navBtn.textContent = "Open Measurement Book & IPC";
  navBtn.onclick = () => opts.onNavigateTab?.("measurement");

  const table = document.createElement("div");
  table.className = "table-wrap gov-billing-table";
  table.innerHTML = `
    <table class="dash-table">
      <thead><tr><th>Bill</th><th>Type</th><th>Date</th><th class="text-right">This bill</th><th class="text-right">Net payable</th><th>Stage</th><th>Status</th></tr></thead>
      <tbody>
        ${ipcRows.length ? ipcRows.map((r) => {
          const stage = CERT_STAGES.find((s) => s.id === r.certificationStage)?.label || r.certificationStage;
          const typeLabel = (r.billType || "running") === "final" ? "Final" : "Running";
          return `<tr>
            <td><strong>${escapeHtml(r.billNo || r.id)}</strong></td>
            <td>${typeLabel}</td>
            <td>${r.billDate || "—"}</td>
            <td class="text-right">${formatBDT(r.thisBill)}</td>
            <td class="text-right">${formatBDT(r.netPayable)}</td>
            <td>${escapeHtml(stage || "—")}</td>
            <td>${statusChip(r.status)}</td>
          </tr>`;
        }).join("") : '<tr class="empty-row"><td colspan="7">No IPC bills — generate from Measurement tab</td></tr>'}
      </tbody>
    </table>
  `;

  body.append(summary, navBtn, table);
  return card;
}

export function buildMeasurementTab(state, opts = {}) {
  const project = state.projects.find((p) => p.id === state.selectedProjectId);
  const card = sectionCard("Measurement Book (MB) & IPC", "Measurement Book (MB) → certification → RA Bill");
  const body = card.querySelector(".section-card-body");
  if (!project) {
    body.innerHTML = `<p class="proj-empty">Select a project first</p>`;
    return card;
  }

  const boqOpts = (state.boqItems || [])
    .map((b) => `<option value="${b.id}">${escapeHtml(b.itemCode || "")} ${escapeHtml(b.item)}</option>`)
    .join("");

  const mbForm = document.createElement("form");
  mbForm.className = "form-grid proj-form";
  mbForm.innerHTML = `
    <select name="boqId" required><option value="">BOQ item *</option>${boqOpts}</select>
    <input name="qty" type="number" step="0.01" placeholder="Measured qty *" required />
    <input name="measureDate" type="date" value="${new Date().toISOString().slice(0, 10)}" />
    <input name="locationRef" placeholder="Chainage / location" />
    <input name="remarks" placeholder="Remarks" />
    <button type="submit" class="btn btn-primary btn-sm">Add measurement</button>
  `;

  mbForm.onsubmit = async (e) => {
    e.preventDefault();
    const fd = new FormData(mbForm);
    try {
      const id = await create(`${GOV_PATHS.measurementEntries}/${state.selectedProjectId}`, {
        ...govBase(),
        boqId: fd.get("boqId"),
        qty: Number(fd.get("qty")) || 0,
        measureDate: fd.get("measureDate"),
        locationRef: fd.get("locationRef") || "",
        measuredBy: getCurrentUserId(),
        remarks: fd.get("remarks") || "",
      });
      await auditProject(state, {
        entityType: "measurementEntry",
        entityId: id,
        action: "create",
        diffSummary: `Measurement ${fd.get("qty")} on BOQ ${fd.get("boqId")}`,
      });
      mbForm.reset();
      showToast("Measurement recorded");
    } catch (err) {
      showToast(err.message, "error");
    }
  };

  const mbRows = state.measurementEntries || [];
  const mbTable = document.createElement("div");
  mbTable.className = "table-wrap";
  mbTable.innerHTML = `
    <h4 class="r3-subhead">Measurement book</h4>
    <table class="dash-table">
      <thead><tr><th>Date</th><th>BOQ</th><th>Qty</th><th>Location</th><th>Status</th><th>Actions</th></tr></thead>
      <tbody>
        ${mbRows.length ? mbRows.map((r) => {
          const boq = (state.boqItems || []).find((b) => b.id === r.boqId);
          const path = `${GOV_PATHS.measurementEntries}/${state.selectedProjectId}/${r.id}`;
          return `<tr>
            <td>${r.measureDate || "—"}</td>
            <td>${escapeHtml(boq?.item || r.boqId)}</td>
            <td>${r.qty}</td>
            <td>${escapeHtml(r.locationRef || "—")}</td>
            <td>${statusChip(r.status)}</td>
            <td class="proj-row-actions-cell">${workflowButtonsHtml(r, path, "measurementEntry")} ${(r.status || "draft") === "draft" ? `<button type="button" class="btn btn-ghost btn-sm mb-edit-btn" data-id="${r.id}">Edit</button>` : ""}</td>
          </tr>`;
        }).join("") : '<tr class="empty-row"><td colspan="6">No measurements</td></tr>'}
      </tbody>
    </table>
  `;

  const ipcFilter = state.ipcBillFilter || "all";

  const ipcToolbar = document.createElement("div");
  ipcToolbar.className = "form-actions gov-ipc-toolbar";
  const genBtn = document.createElement("button");
  genBtn.type = "button";
  genBtn.className = "btn btn-secondary btn-sm";
  genBtn.textContent = "Generate running bill (IPC)";
  genBtn.onclick = async () => {
    try {
      await createIpcBill(state, project, { billType: "running" });
      showToast("Running IPC bill generated");
    } catch (err) {
      showToast(err.message, "error");
    }
  };
  const finalBtn = document.createElement("button");
  finalBtn.type = "button";
  finalBtn.className = "btn btn-primary btn-sm";
  finalBtn.textContent = "Generate final bill";
  finalBtn.onclick = async () => {
    if (!(await confirmAction({ title: "Generate final bill?", message: "Generate final bill for project close-out?", confirmLabel: "Generate" }))) return;
    try {
      await createIpcBill(state, project, { billType: "final" });
      showToast("Final bill generated");
    } catch (err) {
      showToast(err.message, "error");
    }
  };
  ipcToolbar.append(genBtn, finalBtn);

  const filterWrap = document.createElement("div");
  filterWrap.className = "portfolio-view-toggle gov-ipc-filter";
  filterWrap.innerHTML = `
    <button type="button" class="portfolio-view-btn${ipcFilter === "all" ? " is-active" : ""}" data-filter="all">All</button>
    <button type="button" class="portfolio-view-btn${ipcFilter === "running" ? " is-active" : ""}" data-filter="running">Running</button>
    <button type="button" class="portfolio-view-btn${ipcFilter === "final" ? " is-active" : ""}" data-filter="final">Final</button>
  `;
  filterWrap.querySelectorAll("[data-filter]").forEach((btn) => {
    btn.onclick = () => {
      state.ipcBillFilter = btn.dataset.filter;
      opts.onRefresh?.();
    };
  });

  const ipcRows = (state.ipcBills || []).filter((r) => {
    if (ipcFilter === "all") return true;
    return (r.billType || "running") === ipcFilter;
  });
  const ipcTable = document.createElement("div");
  ipcTable.className = "table-wrap";
  ipcTable.innerHTML = `
    <h4 class="r3-subhead">IPC / RA Bills</h4>
    <table class="dash-table">
      <thead><tr><th>Bill</th><th>Type</th><th>Date</th><th>This bill</th><th>Retention</th><th>LD</th><th>Net</th><th>Stage</th><th>Status</th><th>Actions</th></tr></thead>
      <tbody>
        ${ipcRows.length ? ipcRows.map((r) => {
          const path = `${GOV_PATHS.ipcBills}/${state.selectedProjectId}/${r.id}`;
          const stage = CERT_STAGES.find((s) => s.id === r.certificationStage)?.label || r.certificationStage;
          const typeLabel = (r.billType || "running") === "final" ? "Final" : "Running";
          return `<tr>
            <td><strong>${escapeHtml(r.billNo || r.id)}</strong></td>
            <td>${typeLabel}</td>
            <td>${r.billDate || "—"}</td>
            <td>${formatBDT(r.thisBill)}</td>
            <td>${formatBDT(r.retentionAmount)}</td>
            <td>${formatBDT(r.ldAmount)}</td>
            <td>${formatBDT(r.netPayable)}</td>
            <td>${escapeHtml(stage || "—")}</td>
            <td>${statusChip(r.status)}</td>
            <td>${workflowButtonsHtml(r, path, "ipcBill")}</td>
          </tr>`;
        }).join("") : '<tr class="empty-row"><td colspan="10">No IPC bills</td></tr>'}
      </tbody>
    </table>
  `;

  body.append(buildBoqCompareTable(state), mbForm, mbTable, filterWrap, ipcToolbar, ipcTable);

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

  return card;
}

export function buildRetentionTab(state) {
  const project = state.projects.find((p) => p.id === state.selectedProjectId);
  const card = sectionCard("Retention & Final Bill", "Retention ledger, DLP tracker, project close-out");
  const body = card.querySelector(".section-card-body");
  if (!project) {
    body.innerHTML = `<p class="proj-empty">Select a project first</p>`;
    return card;
  }

  const { held, released, balance } = computeRetentionBalance(state.retentionLedger);
  const dlpEnd = project.dlpEndDate || project.completionDate || "—";

  const conditionsForm = document.createElement("form");
  conditionsForm.className = "form-grid proj-form";
  conditionsForm.innerHTML = `
    <textarea name="retentionReleaseConditions" rows="2" placeholder="Retention release conditions (certificate, DLP, defects liability...)">${escapeHtml(project.retentionReleaseConditions || "")}</textarea>
    <button type="submit" class="btn btn-ghost btn-sm">Save release conditions</button>
  `;
  conditionsForm.onsubmit = async (e) => {
    e.preventDefault();
    const fd = new FormData(conditionsForm);
    try {
      await updatePath(`projects/${project.id}`, {
        ...project,
        retentionReleaseConditions: String(fd.get("retentionReleaseConditions") || "").trim(),
        updatedAt: Date.now(),
      });
      showToast("Release conditions saved");
    } catch (err) {
      showToast(err.message, "error");
    }
  };

  const releaseForm = document.createElement("form");
  releaseForm.className = "form-grid proj-form";
  releaseForm.innerHTML = `
    <input name="amount" type="number" step="0.01" placeholder="Release amount (BDT) *" required />
    <input name="releaseDate" type="date" value="${new Date().toISOString().slice(0, 10)}" />
    <input name="remarks" placeholder="Certificate ref / remarks" />
    <button type="submit" class="btn btn-primary btn-sm">Record retention release</button>
  `;
  releaseForm.onsubmit = async (e) => {
    e.preventDefault();
    const fd = new FormData(releaseForm);
    const amount = Number(fd.get("amount")) || 0;
    if (amount <= 0) {
      showToast("Amount must be positive", "error");
      return;
    }
    if (amount > balance) {
      showToast(`Release amount cannot exceed balance (${formatBDT(balance)})`, "error");
      return;
    }
    if (!(await confirmAction({
      title: "Record retention release?",
      message: `Release ${formatBDT(amount)} from retention balance ${formatBDT(balance)}?`,
      confirmLabel: "Release",
    }))) return;
    const now = Date.now();
    try {
      await create(`${GOV_PATHS.retentionLedger}/${state.selectedProjectId}`, {
        entryType: "release",
        amount,
        balance: Math.max(0, balance - amount),
        releaseDate: fd.get("releaseDate"),
        entryDate: fd.get("releaseDate"),
        remarks: fd.get("remarks") || "Retention release",
        status: "released",
        createdBy: getCurrentUserId(),
        createdAt: now,
        updatedAt: now,
      });
      releaseForm.reset();
      showToast("Retention release recorded");
    } catch (err) {
      showToast(err.message, "error");
    }
  };

  const finalForm = document.createElement("form");
  finalForm.className = "form-grid proj-form";
  finalForm.innerHTML = `
    <input name="dlpEndDate" type="date" value="${project.dlpEndDate || ""}" />
    <select name="finalBillStatus">
      <option value="pending" ${project.finalBillStatus === "pending" ? "selected" : ""}>pending</option>
      <option value="submitted" ${project.finalBillStatus === "submitted" ? "selected" : ""}>submitted</option>
      <option value="certified" ${project.finalBillStatus === "certified" ? "selected" : ""}>certified</option>
      <option value="closed" ${project.finalBillStatus === "closed" ? "selected" : ""}>closed</option>
    </select>
    <button type="submit" class="btn btn-secondary btn-sm">Update final bill / DLP</button>
  `;
  finalForm.onsubmit = async (e) => {
    e.preventDefault();
    const fd = new FormData(finalForm);
    try {
      await updatePath(`projects/${project.id}`, {
        ...project,
        dlpEndDate: fd.get("dlpEndDate") || null,
        finalBillStatus: fd.get("finalBillStatus"),
        updatedAt: Date.now(),
      });
      showToast("Final bill status updated");
    } catch (err) {
      showToast(err.message, "error");
    }
  };

  const ledgerRows = state.retentionLedger || [];
  body.innerHTML = `
    <div class="r2-budget-summary gov-contract-summary">
      <div class="r2-stat"><span class="cust-detail-label">Retention amount (held)</span><strong>${formatBDT(balance)}</strong></div>
      <div class="r2-stat"><span class="cust-detail-label">Total held</span><strong>${formatBDT(held)}</strong></div>
      <div class="r2-stat"><span class="cust-detail-label">Released</span><strong>${formatBDT(released)}</strong></div>
      <div class="r2-stat"><span class="cust-detail-label">DLP end</span><strong>${escapeHtml(String(dlpEnd))}</strong></div>
      <div class="r2-stat"><span class="cust-detail-label">Final bill</span>${statusChip(project.finalBillStatus || "pending")}</div>
    </div>
    <div class="table-wrap">
      <table class="dash-table">
        <thead><tr><th>Type</th><th>Date</th><th>Amount</th><th>Balance</th><th>Remarks</th><th>Status</th></tr></thead>
        <tbody>
          ${ledgerRows.length ? ledgerRows.map((r) => `
            <tr>
              <td>${escapeHtml(r.entryType)}</td>
              <td>${r.entryDate || r.releaseDate || "—"}</td>
              <td>${formatBDT(r.amount)}</td>
              <td>${formatBDT(r.balance)}</td>
              <td>${escapeHtml(r.remarks || "—")}</td>
              <td>${statusChip(r.status || "held")}</td>
            </tr>`).join("") : '<tr class="empty-row"><td colspan="6">No retention entries</td></tr>'}
        </tbody>
      </table>
    </div>
  `;
  body.prepend(finalForm);
  body.insertBefore(conditionsForm, body.firstChild);
  body.insertBefore(releaseForm, body.children[2]);

  return card;
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
  const project = state.projects.find((p) => p.id === state.selectedProjectId);
  const card = sectionCard("Regulatory compliance", "PWD / LGED / RAJUK checklist for audit readiness");
  const body = card.querySelector(".section-card-body");
  if (!project) {
    body.innerHTML = `<p class="proj-empty">Select a project first</p>`;
    return card;
  }

  const items = state.govComplianceChecklist || [];
  const statusRow = document.createElement("div");
  statusRow.className = "gov-compliance-head";
  statusRow.innerHTML = `
    <span>Overall status: ${complianceChip(project.complianceStatus || computeComplianceStatus(items))}</span>
    <label class="gov-compliance-override">Override
      <select id="gov-compliance-override">
        <option value="pending" ${project.complianceStatus === "pending" ? "selected" : ""}>Pending</option>
        <option value="compliant" ${project.complianceStatus === "compliant" ? "selected" : ""}>Compliant</option>
        <option value="non_compliant" ${project.complianceStatus === "non_compliant" ? "selected" : ""}>Non-compliant</option>
      </select>
    </label>
  `;

  const tableWrap = document.createElement("div");
  tableWrap.className = "table-wrap gov-compliance-table";
  tableWrap.innerHTML = `
    <table class="dash-table">
      <thead><tr><th>Requirement</th><th>Agency</th><th>Status</th><th></th></tr></thead>
      <tbody>
        ${items.length ? items.map((item) => `
          <tr data-id="${escapeHtml(item.id)}">
            <td>${escapeHtml(item.label || item.title || "")}</td>
            <td>${escapeHtml(item.agency || project.employerAgency || "—")}</td>
            <td>${statusChip(item.status || "pending")}</td>
            <td>
              <select class="gov-checklist-status" data-id="${escapeHtml(item.id)}">
                <option value="pending" ${item.status === "pending" ? "selected" : ""}>Pending</option>
                <option value="done" ${item.status === "done" ? "selected" : ""}>Done</option>
                <option value="na" ${item.status === "na" ? "selected" : ""}>N/A</option>
              </select>
            </td>
          </tr>`).join("") : '<tr class="empty-row"><td colspan="4">No checklist items — re-save project profile to seed</td></tr>'}
      </tbody>
    </table>
  `;

  tableWrap.querySelectorAll(".gov-checklist-status").forEach((sel) => {
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

  statusRow.querySelector("#gov-compliance-override")?.addEventListener("change", async (e) => {
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

  body.append(statusRow, tableWrap);
  return card;
}
