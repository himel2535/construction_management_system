/**
 * Quality, Safety, Contracts & Claims tab builders
 */
import { create, updatePath } from "./svc_data.js";

import { getCurrentUserId } from "./svc_auth.js";
import { auditProject, openCustFormDialog, openEditDialog, validateUrl } from "./cmp_projectTab.js";
import { renderBoqStatGrid } from "./page_projects_r2.js";
import {
  R3_PATHS,
  guardAction,
  getCurrentRole,
  workflowButtonsHtml,
  wireWorkflowButtons,
  postChangeOrderExpense,
} from "./svc_governance.js";
import { formatBDT, formatDate } from "./util_format.js";
import { showToast } from "./cmp_toast.js";
import { confirmAction } from "./cmp_confirm.js";
import { sectionCard, statusChip } from "./cmp_ui.js";
import { isGovProject, GOV_PATHS } from "./util_govProject.js";
import { computeLiquidatedDamages } from "./svc_govProject.js";
import { computeRevisedContractValue } from "./util_privateProject.js";
import { syncMilestoneAmounts } from "./svc_privateProject.js";
import { createNcr, updateNcrResolution } from "./svc_ncr.js";
import { ncrResolutionLabel, NCR_SEVERITIES } from "./util_ncr.js";
import { COST_CATEGORIES } from "./util_projectCost.js";

export const R3_TABS = [
  { id: "quality", label: "Quality" },
  { id: "safety", label: "Safety" },
  { id: "contracts", label: "Contracts & Claims" },
];

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function bindR3Subs(state, listenProjectSub, onUpdate) {
  getCurrentRole();
  const pid = state.selectedProjectId;
  const tabs = ["quality", "safety", "contracts"];
  if (!pid) {
    state.qualityChecks = [];
    state.safetyIncidents = [];
    state.changeOrders = [];
    state.contractClaims = [];
    state.ncrReports = [];
    return () => {};
  }
  const u1 = listenProjectSub(pid, R3_PATHS.qualityChecks, (list) => {
    state.qualityChecks = list;
    if (tabs.includes(state.activeTab)) onUpdate();
  });
  const u2 = listenProjectSub(pid, R3_PATHS.safetyIncidents, (list) => {
    state.safetyIncidents = list;
    if (tabs.includes(state.activeTab)) onUpdate();
  });
  const u3 = listenProjectSub(pid, R3_PATHS.changeOrders, (list) => {
    state.changeOrders = list;
    if (state.activeTab === "contracts") onUpdate();
  });
  const u4 = listenProjectSub(pid, R3_PATHS.contractClaims, (list) => {
    state.contractClaims = list;
    if (state.activeTab === "contracts") onUpdate();
  });
  const u5 = listenProjectSub(pid, R3_PATHS.ncrReports, (list) => {
    state.ncrReports = list;
    if (state.activeTab === "safety") onUpdate();
  });
  return () => {
    u1();
    u2();
    u3();
    u4();
    u5();
  };
}

function governanceBase(projectId) {
  const now = Date.now();
  return {
    projectId,
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

function parseChecklist(text) {
  return String(text || "")
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean)
    .map((text) => ({ text, passed: null, notes: "" }));
}

function normalizeChecklistItems(items) {
  return (items || []).map((i) => {
    if (typeof i === "string") return { text: i, passed: null, notes: "" };
    return { text: i.text || "", passed: i.passed ?? null, notes: i.notes || "" };
  });
}

function checklistPreviewHtml(items, editable, rowId) {
  const list = normalizeChecklistItems(items);
  if (!list.length) return "—";
  return `<ul class="qc-checklist-preview">${list
    .map((i, idx) => {
      const passCls = i.passed === true ? "qc-pass" : i.passed === false ? "qc-fail" : "qc-pending";
      const toggles = editable
        ? `<span class="qc-toggle-group">
            <button type="button" class="btn btn-ghost btn-xs qc-pass-btn" data-id="${rowId}" data-idx="${idx}" data-val="true">Pass</button>
            <button type="button" class="btn btn-ghost btn-xs qc-fail-btn" data-id="${rowId}" data-idx="${idx}" data-val="false">Fail</button>
          </span>`
        : "";
      return `<li class="${passCls}">${escapeHtml(i.text)} ${toggles}</li>`;
    })
    .join("")}</ul>`;
}

const QUALITY_CHECK_TYPES = [
  { value: "structural", label: "Structural" },
  { value: "finishing", label: "Finishing" },
  { value: "mep", label: "MEP" },
  { value: "material", label: "Material" },
];

function phaseSelectOptions(state) {
  return [
    { value: "", label: "WBS phase" },
    ...(state.phases || []).map((ph) => ({ value: ph.id, label: ph.name })),
  ];
}

function milestoneSelectOptions(state) {
  return [
    { value: "", label: "Milestone" },
    ...(state.milestones || []).map((m) => ({ value: m.id, label: m.title })),
  ];
}

function openAddQualityCheckDialog(state) {
  if (!state.selectedProjectId) {
    showToast("Select a project first", "error");
    return;
  }
  openCustFormDialog({
    title: "Add quality check",
    subtitle: "Create an inspection checklist linked to phase or milestone.",
    submitLabel: "Add quality check",
    modalClass: "proj-qc-modal",
    values: {
      title: "",
      checkType: "structural",
      phaseId: "",
      milestoneId: "",
      checklistItems: "",
      dueDate: "",
      assignee: "",
      evidenceUrl: "",
    },
    sections: [
      {
        title: "Check details",
        fields: [
          { name: "title", label: "Title *", type: "text", required: true },
          { name: "checkType", label: "Type", type: "select", options: QUALITY_CHECK_TYPES },
          { name: "phaseId", label: "WBS phase", type: "select", options: phaseSelectOptions(state) },
          { name: "milestoneId", label: "Milestone", type: "select", options: milestoneSelectOptions(state) },
        ],
      },
      {
        title: "Checklist & evidence",
        fields: [
          {
            name: "checklistItems",
            label: "Checklist items * (one per line)",
            type: "textarea",
            fullWidth: true,
            required: true,
          },
          { name: "dueDate", label: "Due date", type: "date" },
          { name: "assignee", label: "Assignee", type: "text" },
          { name: "evidenceUrl", label: "Evidence URL", type: "text" },
        ],
      },
    ],
    onSave: async (data) => {
      try {
        guardAction("create_quality");
        const items = parseChecklist(data.checklistItems);
        if (!items.length) {
          showToast("Add at least one checklist item", "error");
          throw new Error("validation");
        }
        const urlCheck = validateUrl(data.evidenceUrl);
        if (!urlCheck.ok) {
          showToast(urlCheck.message, "error");
          throw new Error("validation");
        }
        const id = await create(`${R3_PATHS.qualityChecks}/${state.selectedProjectId}`, {
          ...governanceBase(state.selectedProjectId),
          title: data.title,
          checkType: data.checkType,
          phaseId: data.phaseId || "",
          milestoneId: data.milestoneId || "",
          checklistItems: items,
          dueDate: data.dueDate || null,
          assignee: data.assignee || "",
          evidenceUrl: data.evidenceUrl || "",
        });
        await auditProject(state, {
          entityType: "qualityCheck",
          entityId: id,
          action: "create",
          diffSummary: `Quality check: ${data.title} (${items.length} items)`,
        });
        showToast("Quality check added");
      } catch (err) {
        if (err?.message !== "validation") showToast(err.message, "error");
        throw err;
      }
    },
  });
}

export function buildQualityTab(state) {
  const root = document.createElement("div");
  root.className = "proj-quality-tab";
  if (!state.selectedProjectId) {
    root.innerHTML = `<p class="proj-empty">Select a project first</p>`;
    return root;
  }

  const rows = state.qualityChecks || [];
  const isOpen = (q) => q.status !== "approved" && q.status !== "closed";
  const openCount = rows.filter(isOpen).length;
  const approvedCount = rows.filter((q) => q.status === "approved").length;
  const closedCount = rows.filter((q) => q.status === "closed").length;

  const openByPhase = {};
  rows.forEach((q) => {
    if (q.status === "approved" || q.status === "closed") return;
    const key = q.phaseId
      ? (state.phases || []).find((p) => p.id === q.phaseId)?.name || "Phase"
      : "Unassigned";
    openByPhase[key] = (openByPhase[key] || 0) + 1;
  });

  const metricsSection = document.createElement("section");
  metricsSection.className = "proj-boq-metrics proj-boq-metrics--planning proj-quality-metrics";
  metricsSection.innerHTML = `<h4 class="proj-boq-section-title">Quality overview</h4>`;
  metricsSection.appendChild(
    renderBoqStatGrid([
      { label: "Total checks", value: rows.length },
      {
        label: "Open",
        value: openCount,
        attention: openCount > 0,
      },
      { label: "Approved", value: approvedCount },
      { label: "Closed", value: closedCount },
    ])
  );
  const statGrid = metricsSection.querySelector(".proj-boq-stat-grid");
  if (statGrid) statGrid.classList.add("proj-quality-stat-grid");

  let phaseBanner = null;
  if (Object.keys(openByPhase).length) {
    phaseBanner = document.createElement("div");
    phaseBanner.className = "proj-quality-open-banner";
    phaseBanner.innerHTML = `<div class="qc-phase-summary">${Object.entries(openByPhase)
      .map(([name, n]) => `<span class="qc-phase-link">${escapeHtml(name)}: <strong>${n}</strong> open</span>`)
      .join("")}</div>`;
  }

  const phaseName = (id) => (state.phases || []).find((p) => p.id === id)?.name || "—";
  const msName = (id) => (state.milestones || []).find((m) => m.id === id)?.title || "—";

  const countLabel =
    rows.length === 1
      ? "Showing 1 of 1 check"
      : `Showing ${rows.length} of ${rows.length} checks`;

  const tableWrap = document.createElement("div");
  tableWrap.className = "reports-table-wrap proj-quality-table proj-quality-table-shell";
  tableWrap.innerHTML = `
    <div class="proj-quality-table-head-row">
      <h4 class="proj-boq-section-title proj-quality-table-head">Quality checks</h4>
      <button type="button" class="btn btn-primary btn-sm proj-qc-add-btn">Add quality check</button>
    </div>
    <table class="dash-table projects-table">
      <colgroup>
        <col class="proj-quality-col-item" />
        <col class="proj-quality-col-equal" />
        <col class="proj-quality-col-equal" />
        <col class="proj-quality-col-equal" />
        <col class="proj-quality-col-checklist" />
        <col class="proj-quality-col-equal" />
        <col class="proj-quality-col-equal" />
        <col class="proj-quality-col-equal" />
      </colgroup>
      <thead>
        <tr>
          <th>Item</th>
          <th>Phase</th>
          <th>Milestone</th>
          <th>Type</th>
          <th>Checklist</th>
          <th>Due</th>
          <th>Status</th>
          <th class="rep-col-actions">Actions</th>
        </tr>
      </thead>
      <tbody>
        ${
          rows.length
            ? rows
                .map((r) => {
                  const path = `${R3_PATHS.qualityChecks}/${state.selectedProjectId}/${r.id}`;
                  const editable = (r.status || "draft") === "draft";
                  const checklistHtml = checklistPreviewHtml(
                    r.checklistItems || [r.title],
                    editable,
                    r.id
                  );
                  return `<tr data-id="${escapeHtml(r.id)}">
              <td><strong class="proj-quality-item-main">${escapeHtml(r.title)}</strong></td>
              <td>${escapeHtml(phaseName(r.phaseId))}</td>
              <td>${escapeHtml(msName(r.milestoneId))}</td>
              <td>${escapeHtml(r.checkType || "—")}</td>
              <td class="proj-quality-checklist-cell">${checklistHtml}</td>
              <td>${r.dueDate ? formatDate(r.dueDate) : "—"}</td>
              <td>${statusChip(r.status)}</td>
              <td class="rep-col-actions proj-row-actions-cell">
                ${workflowButtonsHtml(r, path, "qualityCheck")}
                <button type="button" class="btn btn-ghost btn-sm qc-edit-btn" data-id="${escapeHtml(r.id)}">Edit</button>
              </td>
            </tr>`;
                })
                .join("")
            : '<tr class="empty-row"><td colspan="8">No quality checks — click Add quality check</td></tr>'
        }
      </tbody>
    </table>
    <div class="reports-widget-foot">
      <span class="reports-widget-foot-meta">${escapeHtml(countLabel)}</span>
    </div>
  `;

  if (phaseBanner) root.append(metricsSection, phaseBanner, tableWrap);
  else root.append(metricsSection, tableWrap);

  tableWrap.querySelector(".proj-qc-add-btn")?.addEventListener("click", () =>
    openAddQualityCheckDialog(state)
  );

  wireWorkflowButtons(tableWrap, (btn) => ({
    projectId: state.selectedProjectId,
    entityType: "qualityCheck",
    title: rows.find((x) => x.id === btn.dataset.id)?.title,
  }));

  tableWrap.querySelectorAll(".qc-pass-btn, .qc-fail-btn").forEach((btn) => {
    btn.onclick = async () => {
      const row = rows.find((x) => x.id === btn.dataset.id);
      if (!row || (row.status || "draft") !== "draft") return;
      const idx = Number(btn.dataset.idx);
      const items = normalizeChecklistItems(row.checklistItems);
      if (!items[idx]) return;
      items[idx].passed = btn.dataset.val === "true";
      await updatePath(`${R3_PATHS.qualityChecks}/${state.selectedProjectId}/${row.id}`, {
        ...row,
        checklistItems: items,
        updatedAt: Date.now(),
      });
    };
  });

  tableWrap.querySelectorAll(".qc-edit-btn").forEach((btn) => {
    btn.onclick = () => {
      const r = rows.find((x) => x.id === btn.dataset.id);
      if (!r) return;
      const items = normalizeChecklistItems(r.checklistItems)
        .map((i) => i.text)
        .join("\n");
      openEditDialog(
        "Edit quality check",
        [
          { name: "title", label: "Title *", required: true },
          { name: "checklistItems", label: "Checklist items (one per line)", type: "textarea", required: true },
          { name: "dueDate", label: "Due date", type: "date" },
          { name: "assignee", label: "Assignee" },
        ],
        { ...r, checklistItems: items },
        async (vals) => {
          const nextItems = parseChecklist(vals.checklistItems);
          await updatePath(`${R3_PATHS.qualityChecks}/${state.selectedProjectId}/${r.id}`, {
            ...r,
            title: String(vals.title).trim(),
            checklistItems: nextItems.length ? nextItems : parseChecklist(String(vals.title)),
            dueDate: vals.dueDate || "",
            assignee: String(vals.assignee || "").trim(),
            updatedAt: Date.now(),
          });
          showToast("Quality check updated");
        }
      );
    };
  });

  return root;
}

const INCIDENT_SEVERITIES = [
  { value: "low", label: "Low" },
  { value: "medium", label: "Medium" },
  { value: "high", label: "High" },
  { value: "critical", label: "Critical" },
];

const NCR_SEVERITY_OPTIONS = NCR_SEVERITIES.map((s) => ({
  value: s,
  label: s.charAt(0).toUpperCase() + s.slice(1),
}));

function isHighCriticalSeverity(severity) {
  return severity === "high" || severity === "critical";
}

function openLogIncidentDialog(state) {
  if (!state.selectedProjectId) {
    showToast("Select a project first", "error");
    return;
  }
  openCustFormDialog({
    title: "Log incident",
    subtitle: "Record a safety incident with severity and corrective follow-up.",
    submitLabel: "Log incident",
    modalClass: "proj-safety-incident-modal",
    values: {
      title: "",
      severity: "low",
      incidentDate: "",
      rootCause: "",
      correctiveAction: "",
    },
    sections: [
      {
        title: "Incident details",
        fields: [
          { name: "title", label: "Summary *", type: "text", required: true },
          { name: "severity", label: "Severity", type: "select", options: INCIDENT_SEVERITIES },
          { name: "incidentDate", label: "Incident date", type: "date" },
        ],
      },
      {
        title: "Follow-up",
        fields: [
          { name: "rootCause", label: "Root cause", type: "textarea", fullWidth: true },
          { name: "correctiveAction", label: "Corrective action", type: "textarea", fullWidth: true },
        ],
      },
    ],
    onSave: async (data) => {
      try {
        guardAction("create_safety");
        const id = await create(`${R3_PATHS.safetyIncidents}/${state.selectedProjectId}`, {
          ...governanceBase(state.selectedProjectId),
          title: data.title,
          severity: data.severity,
          incidentDate: data.incidentDate || null,
          rootCause: data.rootCause || "",
          correctiveAction: data.correctiveAction || "",
          closureStatus: "open",
        });
        await auditProject(state, {
          entityType: "safetyIncident",
          entityId: id,
          action: "create",
          diffSummary: `Safety incident: ${data.title} (${data.severity})`,
        });
        showToast("Incident logged");
      } catch (err) {
        showToast(err.message, "error");
        throw err;
      }
    },
  });
}

function openLogNcrDialog(state) {
  if (!state.selectedProjectId) {
    showToast("Select a project first", "error");
    return;
  }
  openCustFormDialog({
    title: "Log NCR",
    subtitle: "Document non-conformance and planned corrective action.",
    submitLabel: "Log NCR",
    modalClass: "proj-ncr-modal",
    values: {
      title: "",
      severity: "low",
      phaseId: "",
      description: "",
      correctiveAction: "",
    },
    sections: [
      {
        title: "NCR details",
        fields: [
          { name: "title", label: "Title *", type: "text", required: true },
          { name: "severity", label: "Severity", type: "select", options: NCR_SEVERITY_OPTIONS },
          { name: "phaseId", label: "WBS phase", type: "select", options: phaseSelectOptions(state) },
        ],
      },
      {
        title: "Resolution plan",
        fields: [
          {
            name: "description",
            label: "Description / non-conformance",
            type: "textarea",
            fullWidth: true,
          },
          { name: "correctiveAction", label: "Corrective action", type: "textarea", fullWidth: true },
        ],
      },
    ],
    onSave: async (data) => {
      try {
        await createNcr(state.selectedProjectId, {
          title: data.title,
          severity: data.severity,
          phaseId: data.phaseId,
          description: data.description,
          correctiveAction: data.correctiveAction,
        });
        showToast("NCR logged");
      } catch (err) {
        showToast(err.message, "error");
        throw err;
      }
    },
  });
}

export function buildSafetyTab(state) {
  const root = document.createElement("div");
  root.className = "proj-safety-tab";
  if (!state.selectedProjectId) {
    root.innerHTML = `<p class="proj-empty">Select a project first</p>`;
    return root;
  }

  const rows = state.safetyIncidents || [];
  const ncrRows = state.ncrReports || [];
  const openIncidents = rows.filter((r) => r.closureStatus !== "closed").length;
  const openNcrs = ncrRows.filter((r) => {
    const st = r.resolutionStatus || "open";
    return st === "open" || st === "in_progress";
  }).length;
  const highCriticalCount =
    rows.filter((r) => isHighCriticalSeverity(r.severity)).length +
    ncrRows.filter((r) => isHighCriticalSeverity(r.severity)).length;

  const metricsSection = document.createElement("section");
  metricsSection.className = "proj-boq-metrics proj-boq-metrics--planning proj-safety-metrics";
  metricsSection.innerHTML = `<h4 class="proj-boq-section-title">Safety overview</h4>`;
  metricsSection.appendChild(
    renderBoqStatGrid([
      { label: "Total incidents", value: rows.length },
      { label: "Open incidents", value: openIncidents, attention: openIncidents > 0 },
      { label: "Open NCRs", value: openNcrs, attention: openNcrs > 0 },
      {
        label: "High / critical",
        value: highCriticalCount,
        attention: highCriticalCount > 0,
      },
    ])
  );
  const statGrid = metricsSection.querySelector(".proj-boq-stat-grid");
  if (statGrid) statGrid.classList.add("proj-safety-stat-grid");

  const incidentCountLabel =
    rows.length === 1
      ? "Showing 1 of 1 incident"
      : `Showing ${rows.length} of ${rows.length} incidents`;

  const incidentTableWrap = document.createElement("div");
  incidentTableWrap.className =
    "reports-table-wrap proj-safety-table proj-safety-incidents-shell";
  incidentTableWrap.innerHTML = `
    <div class="proj-safety-table-head-row">
      <h4 class="proj-boq-section-title proj-safety-table-head">Incidents</h4>
      <button type="button" class="btn btn-primary btn-sm proj-safety-log-incident-btn">Log incident</button>
    </div>
    <table class="dash-table projects-table">
      <colgroup>
        <col class="proj-safety-inc-col-summary" />
        <col class="proj-safety-inc-col-equal" />
        <col class="proj-safety-inc-col-equal" />
        <col class="proj-safety-inc-col-equal" />
        <col class="proj-safety-inc-col-equal" />
        <col class="proj-safety-inc-col-equal" />
      </colgroup>
      <thead>
        <tr>
          <th>Summary</th>
          <th>Severity</th>
          <th>Date</th>
          <th>Closure</th>
          <th>Status</th>
          <th class="rep-col-actions">Actions</th>
        </tr>
      </thead>
      <tbody>
        ${
          rows.length
            ? rows
                .map((r) => {
                  const path = `${R3_PATHS.safetyIncidents}/${state.selectedProjectId}/${r.id}`;
                  const closeBtn =
                    r.closureStatus !== "closed"
                      ? `<button type="button" class="btn btn-ghost btn-sm safety-close-btn" data-id="${escapeHtml(r.id)}">Mark closed</button>`
                      : "";
                  return `<tr data-id="${escapeHtml(r.id)}">
              <td><strong class="proj-safety-summary-main">${escapeHtml(r.title)}</strong></td>
              <td>${statusChip(isHighCriticalSeverity(r.severity) ? "delayed" : "on_time", r.severity)}</td>
              <td>${r.incidentDate ? formatDate(r.incidentDate) : "—"}</td>
              <td>${escapeHtml(r.closureStatus || "open")}</td>
              <td>${statusChip(r.status)}</td>
              <td class="rep-col-actions proj-row-actions-cell">
                ${workflowButtonsHtml(r, path, "safetyIncident")}
                <button type="button" class="btn btn-ghost btn-sm safety-edit-btn" data-id="${escapeHtml(r.id)}">Edit</button>
                ${closeBtn}
              </td>
            </tr>`;
                })
                .join("")
            : '<tr class="empty-row"><td colspan="6">No incidents — click Log incident</td></tr>'
        }
      </tbody>
    </table>
    <div class="reports-widget-foot">
      <span class="reports-widget-foot-meta">${escapeHtml(incidentCountLabel)}</span>
    </div>
  `;

  const ncrCountLabel =
    ncrRows.length === 1
      ? "Showing 1 of 1 NCR"
      : `Showing ${ncrRows.length} of ${ncrRows.length} NCRs`;

  const ncrTableWrap = document.createElement("div");
  ncrTableWrap.className = "reports-table-wrap proj-safety-table proj-safety-ncr-shell";
  ncrTableWrap.innerHTML = `
    <div class="proj-safety-table-head-row">
      <h4 class="proj-boq-section-title proj-safety-table-head">Non-conformance reports (NCR)</h4>
      <button type="button" class="btn btn-primary btn-sm proj-safety-log-ncr-btn">Log NCR</button>
    </div>
    <table class="dash-table projects-table">
      <colgroup>
        <col class="proj-safety-ncr-col-title" />
        <col class="proj-safety-ncr-col-equal" />
        <col class="proj-safety-ncr-col-equal" />
        <col class="proj-safety-ncr-col-equal" />
        <col class="proj-safety-ncr-col-equal" />
      </colgroup>
      <thead>
        <tr>
          <th>Title</th>
          <th>Severity</th>
          <th>Resolution</th>
          <th>Corrective action</th>
          <th class="rep-col-actions">Actions</th>
        </tr>
      </thead>
      <tbody>
        ${
          ncrRows.length
            ? ncrRows
                .map((r) => {
                  const st = r.resolutionStatus || "open";
                  const progBtn =
                    st === "open"
                      ? `<button type="button" class="btn btn-ghost btn-sm ncr-act" data-id="${escapeHtml(r.id)}" data-to="in_progress">In progress</button>`
                      : "";
                  const resolveBtn =
                    st === "in_progress"
                      ? `<button type="button" class="btn btn-primary btn-sm ncr-act" data-id="${escapeHtml(r.id)}" data-to="resolved">Resolve</button>`
                      : "";
                  const closeBtn =
                    st === "resolved"
                      ? `<button type="button" class="btn btn-ghost btn-sm ncr-act" data-id="${escapeHtml(r.id)}" data-to="closed">Close</button>`
                      : "";
                  const desc = r.description
                    ? `<div class="proj-safety-ncr-desc text-muted">${escapeHtml(r.description)}</div>`
                    : "";
                  return `<tr data-ncr-id="${escapeHtml(r.id)}">
              <td>
                <strong class="proj-safety-summary-main">${escapeHtml(r.title)}</strong>
                ${desc}
              </td>
              <td>${statusChip(isHighCriticalSeverity(r.severity) ? "delayed" : "on_time", r.severity)}</td>
              <td>${escapeHtml(ncrResolutionLabel(st))}</td>
              <td class="proj-safety-ncr-corrective">${escapeHtml(r.correctiveAction || "—")}</td>
              <td class="rep-col-actions proj-row-actions-cell proj-safety-ncr-actions">${progBtn}${resolveBtn}${closeBtn}</td>
            </tr>`;
                })
                .join("")
            : '<tr class="empty-row"><td colspan="5">No NCR records — click Log NCR</td></tr>'
        }
      </tbody>
    </table>
    <div class="reports-widget-foot">
      <span class="reports-widget-foot-meta">${escapeHtml(ncrCountLabel)}</span>
    </div>
  `;

  root.append(metricsSection, incidentTableWrap, ncrTableWrap);

  incidentTableWrap.querySelector(".proj-safety-log-incident-btn")?.addEventListener("click", () =>
    openLogIncidentDialog(state)
  );
  ncrTableWrap.querySelector(".proj-safety-log-ncr-btn")?.addEventListener("click", () =>
    openLogNcrDialog(state)
  );

  wireWorkflowButtons(incidentTableWrap, (btn) => ({
    projectId: state.selectedProjectId,
    entityType: "safetyIncident",
    title: rows.find((x) => x.id === btn.dataset.id)?.title,
  }));

  incidentTableWrap.querySelectorAll(".safety-edit-btn").forEach((btn) => {
    btn.onclick = () => {
      const r = rows.find((x) => x.id === btn.dataset.id);
      if (!r) return;
      openEditDialog(
        "Edit incident",
        [
          { name: "title", label: "Summary *", required: true },
          {
            name: "severity",
            label: "Severity",
            type: "select",
            options: INCIDENT_SEVERITIES,
          },
          { name: "rootCause", label: "Root cause", type: "textarea" },
          { name: "correctiveAction", label: "Corrective action", type: "textarea" },
        ],
        r,
        async (vals) => {
          await updatePath(`${R3_PATHS.safetyIncidents}/${state.selectedProjectId}/${r.id}`, {
            ...r,
            title: String(vals.title).trim(),
            severity: vals.severity,
            rootCause: String(vals.rootCause || "").trim(),
            correctiveAction: String(vals.correctiveAction || "").trim(),
            updatedAt: Date.now(),
          });
          showToast("Incident updated");
        }
      );
    };
  });

  incidentTableWrap.querySelectorAll(".safety-close-btn").forEach((btn) => {
    btn.onclick = async () => {
      const r = rows.find((x) => x.id === btn.dataset.id);
      if (
        !r ||
        !(await confirmAction({
          title: "Close incident?",
          message: "Mark this incident as closed?",
          confirmLabel: "Mark closed",
        }))
      )
        return;
      try {
        await updatePath(`${R3_PATHS.safetyIncidents}/${state.selectedProjectId}/${r.id}`, {
          ...r,
          closureStatus: "closed",
          status: "closed",
          updatedAt: Date.now(),
        });
        await auditProject(state, {
          entityType: "safetyIncident",
          entityId: r.id,
          action: "status_change",
          diffSummary: `${r.title}: incident closed`,
        });
        showToast("Incident closed");
      } catch (err) {
        showToast(err.message, "error");
      }
    };
  });

  ncrTableWrap.querySelectorAll(".ncr-act").forEach((btn) => {
    btn.onclick = async () => {
      try {
        await updateNcrResolution(state.selectedProjectId, btn.dataset.id, btn.dataset.to);
        showToast(`NCR ${btn.dataset.to.replace("_", " ")}`);
      } catch (err) {
        showToast(err.message, "error");
      }
    };
  });

  return root;
}

function costCategoryOptions() {
  return COST_CATEGORIES.map((c) => ({ value: c, label: c }));
}

function boqSelectOptions(state) {
  return [
    { value: "", label: "Impacted BOQ item" },
    ...(state.boqItems || []).map((b) => ({
      value: b.id,
      label: `${b.itemCode || ""} ${b.item}`.trim(),
    })),
  ];
}

function isWorkflowOpen(status) {
  const st = status || "draft";
  return st !== "approved" && st !== "closed";
}

function openAddChangeOrderDialog(state, gov) {
  if (!state.selectedProjectId) {
    showToast("Select a project first", "error");
    return;
  }
  const privateValues = {
    title: "",
    variationNo: "",
    financialImpact: "",
    costCategory: "material",
  };
  const govValues = {
    title: "",
    voNumber: "",
    variationNo: "",
    clauseRef: "",
    boqId: "",
    qtyChange: "",
    financialImpact: "",
    costCategory: "material",
  };
  openCustFormDialog({
    title: gov ? "Add variation order" : "Add change order",
    subtitle: gov
      ? "Record a VO with BOQ impact and financial effect."
      : "Record a contract variation and cost category.",
    submitLabel: gov ? "Add variation order" : "Add change order",
    modalClass: "proj-co-modal",
    values: gov ? govValues : privateValues,
    sections: gov
      ? [
          {
            title: "Variation",
            fields: [
              { name: "title", label: "Variation title *", type: "text", required: true },
              { name: "voNumber", label: "VO number", type: "text" },
              { name: "variationNo", label: "Variation #", type: "text" },
              { name: "clauseRef", label: "Contract clause ref", type: "text" },
              { name: "boqId", label: "Impacted BOQ item", type: "select", options: boqSelectOptions(state) },
              { name: "qtyChange", label: "Qty change", type: "number", step: "0.01" },
            ],
          },
          {
            title: "Commercial",
            fields: [
              { name: "financialImpact", label: "Financial impact (BDT)", type: "number" },
              { name: "costCategory", label: "Cost category", type: "select", options: costCategoryOptions() },
            ],
          },
        ]
      : [
          {
            title: "Change order",
            fields: [
              { name: "title", label: "Change order title *", type: "text", required: true },
              { name: "variationNo", label: "Variation #", type: "text" },
              { name: "financialImpact", label: "Financial impact (BDT)", type: "number" },
              { name: "costCategory", label: "Cost category", type: "select", options: costCategoryOptions() },
            ],
          },
        ],
    onSave: async (data) => {
      try {
        guardAction("create_change_order");
        const id = await create(`${R3_PATHS.changeOrders}/${state.selectedProjectId}`, {
          ...governanceBase(state.selectedProjectId),
          title: data.title,
          voNumber: data.voNumber || "",
          variationNo: data.variationNo || "",
          clauseRef: data.clauseRef || "",
          boqId: data.boqId || "",
          qtyChange: Number(data.qtyChange) || 0,
          financialImpact: Number(data.financialImpact) || 0,
          costCategory: data.costCategory,
        });
        await auditProject(state, {
          entityType: "changeOrder",
          entityId: id,
          action: "create",
          diffSummary: `Change order: ${data.title}`,
        });
        showToast(gov ? "Variation order created" : "Change order created");
      } catch (err) {
        showToast(err.message, "error");
        throw err;
      }
    },
  });
}

function openAddClaimDialog(state) {
  if (!state.selectedProjectId) {
    showToast("Select a project first", "error");
    return;
  }
  openCustFormDialog({
    title: "Add contract claim",
    subtitle: "Log a claim amount with basis and optional attachment.",
    submitLabel: "Add claim",
    modalClass: "proj-claim-modal",
    values: {
      title: "",
      amount: "",
      basis: "",
      attachmentUrl: "",
    },
    sections: [
      {
        title: "Claim",
        fields: [
          { name: "title", label: "Claim title *", type: "text", required: true },
          { name: "amount", label: "Claim amount (BDT) *", type: "number", required: true },
          { name: "basis", label: "Basis / description", type: "textarea", fullWidth: true },
          { name: "attachmentUrl", label: "Attachment URL", type: "text" },
        ],
      },
    ],
    onSave: async (data) => {
      try {
        guardAction("create_claim");
        const urlCheck = validateUrl(data.attachmentUrl);
        if (!urlCheck.ok) {
          showToast(urlCheck.message, "error");
          throw new Error("validation");
        }
        const id = await create(`${R3_PATHS.contractClaims}/${state.selectedProjectId}`, {
          ...governanceBase(state.selectedProjectId),
          title: data.title,
          amount: Number(data.amount) || 0,
          basis: data.basis || "",
          attachmentUrl: data.attachmentUrl || "",
          settlementStatus: "open",
        });
        await auditProject(state, {
          entityType: "contractClaim",
          entityId: id,
          action: "create",
          diffSummary: `Contract claim: ${data.title}`,
        });
        showToast("Claim added");
      } catch (err) {
        if (err?.message !== "validation") showToast(err.message, "error");
        throw err;
      }
    },
  });
}

function openAddEotDialog(state, project) {
  if (!state.selectedProjectId) {
    showToast("Select a project first", "error");
    return;
  }
  openCustFormDialog({
    title: "Submit EOT request",
    subtitle: "Request an extension of time with supporting documentation.",
    submitLabel: "Submit EOT request",
    modalClass: "proj-eot-modal",
    values: {
      title: "",
      daysRequested: "",
      reason: "",
      supportingDocUrl: "",
    },
    sections: [
      {
        title: "Extension request",
        fields: [
          { name: "title", label: "EOT request title *", type: "text", required: true },
          { name: "daysRequested", label: "Days requested *", type: "number", required: true },
          { name: "reason", label: "Reason / justification", type: "textarea", fullWidth: true },
          { name: "supportingDocUrl", label: "Supporting document URL", type: "text" },
        ],
      },
    ],
    onSave: async (data) => {
      try {
        const urlCheck = validateUrl(data.supportingDocUrl);
        if (!urlCheck.ok) {
          showToast(urlCheck.message, "error");
          throw new Error("validation");
        }
        const id = await create(`${GOV_PATHS.eotRequests}/${state.selectedProjectId}`, {
          ...governanceBase(state.selectedProjectId),
          title: data.title,
          daysRequested: Number(data.daysRequested) || 0,
          reason: data.reason || "",
          supportingDocUrl: data.supportingDocUrl || "",
          originalCompletion: project?.completionDate || null,
        });
        await auditProject(state, {
          entityType: "eotRequest",
          entityId: id,
          action: "create",
          diffSummary: `EOT: ${data.title} (${data.daysRequested} days)`,
        });
        showToast("EOT request created");
      } catch (err) {
        if (err?.message !== "validation") showToast(err.message, "error");
        throw err;
      }
    },
  });
}

export function buildContractsTab(state) {
  const root = document.createElement("div");
  root.className = "proj-contracts-tab";
  const project = state.projects.find((p) => p.id === state.selectedProjectId);
  const gov = isGovProject(project);
  if (!state.selectedProjectId) {
    root.innerHTML = `<p class="proj-empty">Select a project first</p>`;
    return root;
  }

  const coRows = state.changeOrders || [];
  const claimRows = state.contractClaims || [];
  const eotRows = state.eotRequests || [];
  const openCos = coRows.filter((r) => isWorkflowOpen(r.status)).length;
  const openClaims = claimRows.filter((r) => (r.settlementStatus || "open") !== "settled").length;

  const metricsSection = document.createElement("section");
  metricsSection.className = "proj-boq-metrics proj-boq-metrics--planning proj-contracts-metrics";
  metricsSection.innerHTML = `<h4 class="proj-boq-section-title">Variations & claims overview</h4>`;

  if (gov) {
    const ld = computeLiquidatedDamages(project, eotRows);
    const pendingEot = eotRows.filter((r) => isWorkflowOpen(r.status)).length;
    metricsSection.appendChild(
      renderBoqStatGrid([
        {
          label: "LD exposure",
          value: `${formatBDT(ld.amount)} · ${ld.days}d`,
          attention: ld.amount > 0,
        },
        { label: "Pending EOT", value: pendingEot, attention: pendingEot > 0 },
        { label: "Open VOs", value: openCos, attention: openCos > 0 },
        { label: "Open claims", value: openClaims, attention: openClaims > 0 },
      ])
    );
  } else {
    const { variations, revised } = computeRevisedContractValue(project, coRows);
    metricsSection.appendChild(
      renderBoqStatGrid([
        { label: "Revised contract", value: formatBDT(revised) },
        { label: "Open change orders", value: openCos, attention: openCos > 0 },
        { label: "Open claims", value: openClaims, attention: openClaims > 0 },
        { label: "Variation total", value: formatBDT(variations) },
      ])
    );
  }
  const statGrid = metricsSection.querySelector(".proj-boq-stat-grid");
  if (statGrid) statGrid.classList.add("proj-contracts-stat-grid");

  const coTitle = gov ? "Variation orders" : "Change orders";
  const coAddLabel = gov ? "Add variation order" : "Add change order";
  const coCountLabel =
    coRows.length === 1
      ? "Showing 1 of 1 order"
      : `Showing ${coRows.length} of ${coRows.length} orders`;
  const coEmpty = gov
    ? "No variation orders — click Add variation order"
    : "No change orders — click Add change order";

  const coTableWrap = document.createElement("div");
  coTableWrap.className = "reports-table-wrap proj-contracts-table proj-contracts-co-shell";
  coTableWrap.innerHTML = `
    <div class="proj-contracts-table-head-row">
      <h4 class="proj-boq-section-title proj-contracts-table-head">${escapeHtml(coTitle)}</h4>
      <button type="button" class="btn btn-primary btn-sm proj-co-add-btn">${escapeHtml(coAddLabel)}</button>
    </div>
    <table class="dash-table projects-table">
      <colgroup>
        <col class="proj-contracts-co-col-title" />
        <col class="proj-contracts-co-col-equal" />
        <col class="proj-contracts-co-col-equal" />
        <col class="proj-contracts-co-col-equal" />
        <col class="proj-contracts-co-col-actions" />
      </colgroup>
      <thead>
        <tr>
          <th>Title</th>
          <th>${gov ? "VO #" : "Var #"}</th>
          <th>Impact</th>
          <th>Status</th>
          <th class="rep-col-actions">Actions</th>
        </tr>
      </thead>
      <tbody>
        ${
          coRows.length
            ? coRows
                .map((r) => {
                  const path = `${R3_PATHS.changeOrders}/${state.selectedProjectId}/${r.id}`;
                  return `<tr data-co-id="${escapeHtml(r.id)}">
              <td><strong class="proj-contracts-co-title">${escapeHtml(r.title)}</strong></td>
              <td>${escapeHtml(r.voNumber || r.variationNo || "—")}</td>
              <td>${formatBDT(r.financialImpact || 0)}</td>
              <td>${statusChip(r.status)}</td>
              <td class="rep-col-actions proj-row-actions-cell">${workflowButtonsHtml(r, path, "changeOrder")}</td>
            </tr>`;
                })
                .join("")
            : `<tr class="empty-row"><td colspan="5">${escapeHtml(coEmpty)}</td></tr>`
        }
      </tbody>
    </table>
    <div class="reports-widget-foot">
      <span class="reports-widget-foot-meta">${escapeHtml(coCountLabel)}</span>
    </div>
  `;

  root.append(metricsSection, coTableWrap);

  coTableWrap.querySelector(".proj-co-add-btn")?.addEventListener("click", () =>
    openAddChangeOrderDialog(state, gov)
  );

  wireWorkflowButtons(coTableWrap, (btn) => {
    const row = coRows.find((x) => x.id === btn.dataset.id);
    return {
      projectId: state.selectedProjectId,
      entityType: "changeOrder",
      title: row?.title,
      skipQueue: !gov,
      onApproved: async (co) => {
        await postChangeOrderExpense(state.selectedProjectId, { ...row, ...co });
        if (!gov) await syncMilestoneAmounts(state.selectedProjectId);
      },
    };
  });

  let eotTableWrap = null;
  if (gov) {
    const eotCountLabel =
      eotRows.length === 1
        ? "Showing 1 of 1 request"
        : `Showing ${eotRows.length} of ${eotRows.length} requests`;
    eotTableWrap = document.createElement("div");
    eotTableWrap.className = "reports-table-wrap proj-contracts-table proj-contracts-eot-shell";
    eotTableWrap.innerHTML = `
      <div class="proj-contracts-table-head-row">
        <h4 class="proj-boq-section-title proj-contracts-table-head">Time extension (EOT)</h4>
        <button type="button" class="btn btn-primary btn-sm proj-eot-add-btn">Submit EOT request</button>
      </div>
      <table class="dash-table projects-table">
        <colgroup>
          <col class="proj-contracts-eot-col-title" />
          <col class="proj-contracts-eot-col-equal" />
          <col class="proj-contracts-eot-col-equal" />
          <col class="proj-contracts-eot-col-equal" />
          <col class="proj-contracts-eot-col-equal" />
          <col class="proj-contracts-eot-col-actions" />
        </colgroup>
        <thead>
          <tr>
            <th>Title</th>
            <th>Requested</th>
            <th>Approved</th>
            <th>Revised date</th>
            <th>Status</th>
            <th class="rep-col-actions">Actions</th>
          </tr>
        </thead>
        <tbody>
          ${
            eotRows.length
              ? eotRows
                  .map((r) => {
                    const path = `${GOV_PATHS.eotRequests}/${state.selectedProjectId}/${r.id}`;
                    return `<tr data-eot-id="${escapeHtml(r.id)}">
              <td><strong class="proj-contracts-co-title">${escapeHtml(r.title)}</strong></td>
              <td>${r.daysRequested || 0}</td>
              <td>${r.daysApproved || 0}</td>
              <td>${escapeHtml(r.revisedCompletion || "—")}</td>
              <td>${statusChip(r.status)}</td>
              <td class="rep-col-actions proj-row-actions-cell">${workflowButtonsHtml(r, path, "eotRequest")}</td>
            </tr>`;
                  })
                  .join("")
              : '<tr class="empty-row"><td colspan="6">No EOT requests — click Submit EOT request</td></tr>'
          }
        </tbody>
      </table>
      <div class="reports-widget-foot">
        <span class="reports-widget-foot-meta">${escapeHtml(eotCountLabel)}</span>
      </div>
    `;
    root.appendChild(eotTableWrap);
    eotTableWrap.querySelector(".proj-eot-add-btn")?.addEventListener("click", () =>
      openAddEotDialog(state, project)
    );
    wireWorkflowButtons(eotTableWrap, (btn) => {
      const row = eotRows.find((x) => x.id === btn.dataset.id);
      return {
        projectId: state.selectedProjectId,
        entityType: "eotRequest",
        title: row?.title,
        onApproved: async () => {
          await new Promise((resolve) => {
            openEditDialog(
              "Approve EOT — days granted",
              [
                {
                  name: "daysApproved",
                  label: "Approved days *",
                  type: "number",
                  required: true,
                  hint: `Requested: ${row?.daysRequested || 0} days`,
                },
              ],
              { daysApproved: row?.daysRequested || 0 },
              async (vals) => {
                const requested = Number(row?.daysRequested || 0);
                let days = Number(vals.daysApproved) || 0;
                if (days < 0) days = 0;
                if (days > requested) days = requested;
                let revisedDate = project?.completionDate;
                if (revisedDate && days) {
                  const d = new Date(revisedDate);
                  d.setDate(d.getDate() + days);
                  revisedDate = d.toISOString().slice(0, 10);
                }
                await updatePath(`${GOV_PATHS.eotRequests}/${state.selectedProjectId}/${row.id}`, {
                  ...row,
                  daysApproved: days,
                  revisedCompletion: revisedDate,
                  updatedAt: Date.now(),
                });
                if (revisedDate && project) {
                  await updatePath(`projects/${project.id}`, {
                    ...project,
                    completionDate: revisedDate,
                    updatedAt: Date.now(),
                  });
                }
                showToast(`EOT approved for ${days} days`);
                resolve();
              }
            );
          });
        },
      };
    });
  }

  const claimCountLabel =
    claimRows.length === 1
      ? "Showing 1 of 1 claim"
      : `Showing ${claimRows.length} of ${claimRows.length} claims`;

  const claimTableWrap = document.createElement("div");
  claimTableWrap.className = "reports-table-wrap proj-contracts-table proj-contracts-claims-shell";
  claimTableWrap.innerHTML = `
    <div class="proj-contracts-table-head-row">
      <h4 class="proj-boq-section-title proj-contracts-table-head">Contract claims</h4>
      <button type="button" class="btn btn-primary btn-sm proj-claim-add-btn">Add claim</button>
    </div>
    <table class="dash-table projects-table">
      <colgroup>
        <col class="proj-contracts-claim-col-title" />
        <col class="proj-contracts-claim-col-equal" />
        <col class="proj-contracts-claim-col-equal" />
        <col class="proj-contracts-claim-col-equal" />
        <col class="proj-contracts-claim-col-actions" />
      </colgroup>
      <thead>
        <tr>
          <th>Title</th>
          <th>Amount</th>
          <th>Settlement</th>
          <th>Status</th>
          <th class="rep-col-actions">Actions</th>
        </tr>
      </thead>
      <tbody>
        ${
          claimRows.length
            ? claimRows
                .map((r) => {
                  const path = `${R3_PATHS.contractClaims}/${state.selectedProjectId}/${r.id}`;
                  const settleBtn =
                    r.settlementStatus !== "settled"
                      ? `<button type="button" class="btn btn-ghost btn-sm claim-settle-btn" data-id="${escapeHtml(r.id)}">Settle</button>`
                      : "";
                  return `<tr data-claim-id="${escapeHtml(r.id)}">
              <td><strong class="proj-contracts-co-title">${escapeHtml(r.title)}</strong></td>
              <td>${formatBDT(r.amount || 0)}</td>
              <td>${escapeHtml(r.settlementStatus || "open")}</td>
              <td>${statusChip(r.status)}</td>
              <td class="rep-col-actions proj-row-actions-cell">
                ${workflowButtonsHtml(r, path, "contractClaim")}
                ${settleBtn}
              </td>
            </tr>`;
                })
                .join("")
            : '<tr class="empty-row"><td colspan="5">No claims — click Add claim</td></tr>'
        }
      </tbody>
    </table>
    <div class="reports-widget-foot">
      <span class="reports-widget-foot-meta">${escapeHtml(claimCountLabel)}</span>
    </div>
  `;

  root.appendChild(claimTableWrap);

  claimTableWrap.querySelector(".proj-claim-add-btn")?.addEventListener("click", () =>
    openAddClaimDialog(state)
  );

  claimTableWrap.querySelectorAll(".claim-settle-btn").forEach((btn) => {
    btn.onclick = async () => {
      const row = claimRows.find((x) => x.id === btn.dataset.id);
      if (!row) return;
      try {
        await updatePath(`${R3_PATHS.contractClaims}/${state.selectedProjectId}/${row.id}`, {
          ...row,
          settlementStatus: "settled",
          status: "closed",
          updatedAt: Date.now(),
        });
        showToast("Claim marked settled");
      } catch (err) {
        showToast(err.message, "error");
      }
    };
  });

  wireWorkflowButtons(claimTableWrap, (btn) => ({
    projectId: state.selectedProjectId,
    entityType: "contractClaim",
    title: claimRows.find((x) => x.id === btn.dataset.id)?.title,
  }));

  return root;
}
