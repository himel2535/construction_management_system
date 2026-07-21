/**
 * Quality, Safety, Contracts & Claims tab builders
 */
import { create, updatePath } from "./svc_data.js";

import { getCurrentUserId } from "./svc_auth.js";
import { auditProject, openEditDialog, validateUrl } from "./cmp_projectTab.js";
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

export function buildQualityTab(state) {
  const card = sectionCard("Quality Checks", "Inspection checklists per phase/milestone with approval workflow (§2.9)");
  const body = card.querySelector(".section-card-body");
  if (!state.selectedProjectId) {
    body.innerHTML = `<p class="proj-empty">Select a project first</p>`;
    return card;
  }

  const phaseOpts = (state.phases || [])
    .map((ph) => `<option value="${ph.id}">${escapeHtml(ph.name)}</option>`)
    .join("");
  const msOpts = (state.milestones || [])
    .map((m) => `<option value="${m.id}">${escapeHtml(m.title)}</option>`)
    .join("");

  const openByPhase = {};
  (state.qualityChecks || []).forEach((q) => {
    if (q.status === "approved" || q.status === "closed") return;
    const key = q.phaseId
      ? (state.phases || []).find((p) => p.id === q.phaseId)?.name || "Phase"
      : "Unassigned";
    openByPhase[key] = (openByPhase[key] || 0) + 1;
  });
  const summaryStrip = document.createElement("div");
  summaryStrip.className = "qc-phase-summary";
  summaryStrip.innerHTML = Object.keys(openByPhase).length
    ? Object.entries(openByPhase)
        .map(([name, n]) => `<span class="qc-phase-link">${escapeHtml(name)}: <strong>${n}</strong> open</span>`)
        .join("")
    : `<span class="text-muted">No open quality checks</span>`;

  const form = document.createElement("form");
  form.className = "form-grid proj-form";
  form.innerHTML = `
    <input name="title" placeholder="Checklist title *" required />
    <select name="checkType">
      <option value="structural">Structural</option>
      <option value="finishing">Finishing</option>
      <option value="mep">MEP</option>
      <option value="material">Material</option>
    </select>
    <select name="phaseId"><option value="">WBS phase</option>${phaseOpts}</select>
    <select name="milestoneId"><option value="">Milestone</option>${msOpts}</select>
    <textarea name="checklistItems" rows="4" placeholder="Checklist items (one per line) *" required></textarea>
    <input name="dueDate" type="date" />
    <input name="assignee" placeholder="Assignee" />
    <input name="evidenceUrl" placeholder="Evidence URL" />
    <button type="submit" class="btn btn-primary btn-sm">Add quality check</button>
  `;
  form.onsubmit = async (e) => {
    e.preventDefault();
    try {
      guardAction("create_quality");
      const fd = new FormData(form);
      const items = parseChecklist(fd.get("checklistItems"));
      if (!items.length) {
        showToast("Add at least one checklist item", "error");
        return;
      }
      const urlCheck = validateUrl(fd.get("evidenceUrl"));
      if (!urlCheck.ok) {
        showToast(urlCheck.message, "error");
        return;
      }
      const id = await create(`${R3_PATHS.qualityChecks}/${state.selectedProjectId}`, {
        ...governanceBase(state.selectedProjectId),
        title: fd.get("title"),
        checkType: fd.get("checkType"),
        phaseId: fd.get("phaseId") || "",
        milestoneId: fd.get("milestoneId") || "",
        checklistItems: items,
        dueDate: fd.get("dueDate") || null,
        assignee: fd.get("assignee") || "",
        evidenceUrl: fd.get("evidenceUrl") || "",
      });
      await auditProject(state, {
        entityType: "qualityCheck",
        entityId: id,
        action: "create",
        diffSummary: `Quality check: ${fd.get("title")} (${items.length} items)`,
      });
      form.reset();
      showToast("Quality check added");
    } catch (err) {
      showToast(err.message, "error");
    }
  };

  const list = document.createElement("div");
  list.className = "table-wrap";
  const rows = state.qualityChecks || [];
  const phaseName = (id) => (state.phases || []).find((p) => p.id === id)?.name || "—";
  const msName = (id) => (state.milestones || []).find((m) => m.id === id)?.title || "—";
  list.innerHTML = `
    <table class="dash-table">
      <thead><tr><th>Item</th><th>Phase</th><th>Milestone</th><th>Type</th><th>Checklist</th><th>Due</th><th>Status</th><th>Actions</th></tr></thead>
      <tbody>
        ${rows
          .map((r) => {
            const path = `${R3_PATHS.qualityChecks}/${state.selectedProjectId}/${r.id}`;
            const editable = (r.status || "draft") === "draft";
            const checklistHtml = checklistPreviewHtml(r.checklistItems || [r.title], editable, r.id);
            return `<tr data-id="${r.id}">
              <td><strong>${escapeHtml(r.title)}</strong></td>
              <td>${escapeHtml(phaseName(r.phaseId))}</td>
              <td>${escapeHtml(msName(r.milestoneId))}</td>
              <td>${escapeHtml(r.checkType || "—")}</td>
              <td>${checklistHtml}</td>
              <td>${r.dueDate ? formatDate(r.dueDate) : "—"}</td>
              <td>${statusChip(r.status)}</td>
              <td class="proj-row-actions-cell">
                ${workflowButtonsHtml(r, path, "qualityCheck")}
                <button type="button" class="btn btn-ghost btn-sm qc-edit-btn" data-id="${r.id}">Edit</button>
              </td>
            </tr>`;
          })
          .join("") || `<tr><td colspan="8" class="proj-empty">No quality checks</td></tr>`}
      </tbody>
    </table>
  `;

  body.append(summaryStrip, form, list);
  wireWorkflowButtons(list, (btn) => ({
    projectId: state.selectedProjectId,
    entityType: "qualityCheck",
    title: rows.find((x) => x.id === btn.dataset.id)?.title,
  }));

  list.querySelectorAll(".qc-pass-btn, .qc-fail-btn").forEach((btn) => {
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

  list.querySelectorAll(".qc-edit-btn").forEach((btn) => {
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

  return card;
}

export function buildSafetyTab(state) {
  const card = sectionCard("Safety Incidents", "Incident log with corrective actions");
  const body = card.querySelector(".section-card-body");
  if (!state.selectedProjectId) {
    body.innerHTML = `<p class="proj-empty">Select a project first</p>`;
    return card;
  }

  const form = document.createElement("form");
  form.className = "form-grid proj-form";
  form.innerHTML = `
    <input name="title" placeholder="Incident summary *" required />
    <select name="severity">
      <option value="low">Low</option>
      <option value="medium">Medium</option>
      <option value="high">High</option>
      <option value="critical">Critical</option>
    </select>
    <input name="incidentDate" type="date" />
    <input name="rootCause" placeholder="Root cause" />
    <input name="correctiveAction" placeholder="Corrective action" />
    <button type="submit" class="btn btn-primary btn-sm">Log incident</button>
  `;
  form.onsubmit = async (e) => {
    e.preventDefault();
    try {
      guardAction("create_safety");
      const fd = new FormData(form);
      const id = await create(`${R3_PATHS.safetyIncidents}/${state.selectedProjectId}`, {
        ...governanceBase(state.selectedProjectId),
        title: fd.get("title"),
        severity: fd.get("severity"),
        incidentDate: fd.get("incidentDate") || null,
        rootCause: fd.get("rootCause") || "",
        correctiveAction: fd.get("correctiveAction") || "",
        closureStatus: "open",
      });
      await auditProject(state, {
        entityType: "safetyIncident",
        entityId: id,
        action: "create",
        diffSummary: `Safety incident: ${fd.get("title")} (${fd.get("severity")})`,
      });
      form.reset();
      showToast("Incident logged");
    } catch (err) {
      showToast(err.message, "error");
    }
  };

  const list = document.createElement("div");
  list.className = "table-wrap";
  const rows = state.safetyIncidents || [];
  list.innerHTML = `
    <table class="dash-table">
      <thead><tr><th>Summary</th><th>Severity</th><th>Date</th><th>Closure</th><th>Status</th><th>Actions</th></tr></thead>
      <tbody>
        ${rows
          .map((r) => {
            const path = `${R3_PATHS.safetyIncidents}/${state.selectedProjectId}/${r.id}`;
            const closeBtn =
              r.closureStatus !== "closed"
                ? `<button type="button" class="btn btn-ghost btn-sm safety-close-btn" data-id="${r.id}">Close</button>`
                : "";
            return `<tr>
              <td>${escapeHtml(r.title)}</td>
              <td>${statusChip(r.severity === "critical" || r.severity === "high" ? "delayed" : "on_time", r.severity)}</td>
              <td>${r.incidentDate ? formatDate(r.incidentDate) : "—"}</td>
              <td>${escapeHtml(r.closureStatus || "open")}</td>
              <td>${statusChip(r.status)}</td>
              <td class="proj-row-actions-cell">
                ${workflowButtonsHtml(r, path, "safetyIncident")}
                <button type="button" class="btn btn-ghost btn-sm safety-edit-btn" data-id="${r.id}">Edit</button>
                ${closeBtn}
              </td>
            </tr>`;
          })
          .join("") || `<tr><td colspan="6" class="proj-empty">No incidents</td></tr>`}
      </tbody>
    </table>
  `;

  body.append(form, list);
  wireWorkflowButtons(list, (btn) => ({
    projectId: state.selectedProjectId,
    entityType: "safetyIncident",
    title: rows.find((x) => x.id === btn.dataset.id)?.title,
  }));

  list.querySelectorAll(".safety-edit-btn").forEach((btn) => {
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
            options: [
              { value: "low", label: "Low" },
              { value: "medium", label: "Medium" },
              { value: "high", label: "High" },
              { value: "critical", label: "Critical" },
            ],
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

  list.querySelectorAll(".safety-close-btn").forEach((btn) => {
    btn.onclick = async () => {
      const r = rows.find((x) => x.id === btn.dataset.id);
      if (!r || !(await confirmAction({ title: "Close incident?", message: "Mark this incident as closed?", confirmLabel: "Mark closed" }))) return;
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

  const ncrSection = document.createElement("div");
  ncrSection.className = "ncr-section";
  const phaseOpts = (state.phases || [])
    .map((ph) => `<option value="${ph.id}">${escapeHtml(ph.name)}</option>`)
    .join("");
  ncrSection.innerHTML = `<h4 class="r3-subhead">Non-Conformance Reports (NCR)</h4>`;

  const ncrForm = document.createElement("form");
  ncrForm.className = "form-grid proj-form";
  ncrForm.innerHTML = `
    <input name="title" placeholder="NCR title *" required />
    <select name="severity">
      ${NCR_SEVERITIES.map((s) => `<option value="${s}">${s}</option>`).join("")}
    </select>
    <select name="phaseId"><option value="">Phase (optional)</option>${phaseOpts}</select>
    <input name="description" placeholder="Description / non-conformance detail" />
    <input name="correctiveAction" placeholder="Corrective action" />
    <button type="submit" class="btn btn-secondary btn-sm">Log NCR</button>
  `;
  ncrForm.onsubmit = async (e) => {
    e.preventDefault();
    try {
      const fd = new FormData(ncrForm);
      await createNcr(state.selectedProjectId, {
        title: fd.get("title"),
        severity: fd.get("severity"),
        phaseId: fd.get("phaseId"),
        description: fd.get("description"),
        correctiveAction: fd.get("correctiveAction"),
      });
      ncrForm.reset();
      showToast("NCR logged");
    } catch (err) {
      showToast(err.message, "error");
    }
  };

  const ncrRows = state.ncrReports || [];
  const ncrTable = document.createElement("div");
  ncrTable.className = "table-wrap";
  ncrTable.innerHTML = `
    <table class="dash-table">
      <thead><tr><th>Title</th><th>Severity</th><th>Resolution</th><th>Corrective action</th><th>Actions</th></tr></thead>
      <tbody>
        ${ncrRows.length ? ncrRows.map((r) => {
          const st = r.resolutionStatus || "open";
          const progBtn = st === "open" ? `<button type="button" class="btn btn-ghost btn-sm ncr-act" data-id="${r.id}" data-to="in_progress">In progress</button>` : "";
          const resolveBtn = st === "in_progress" ? `<button type="button" class="btn btn-primary btn-sm ncr-act" data-id="${r.id}" data-to="resolved">Resolve</button>` : "";
          const closeBtn = st === "resolved" ? `<button type="button" class="btn btn-ghost btn-sm ncr-act" data-id="${r.id}" data-to="closed">Close</button>` : "";
          return `<tr>
            <td><strong>${escapeHtml(r.title)}</strong><br><small class="text-muted">${escapeHtml(r.description || "")}</small></td>
            <td>${statusChip(r.severity === "critical" || r.severity === "high" ? "delayed" : "on_time", r.severity)}</td>
            <td>${escapeHtml(ncrResolutionLabel(st))}</td>
            <td>${escapeHtml(r.correctiveAction || "—")}</td>
            <td>${progBtn}${resolveBtn}${closeBtn}</td>
          </tr>`;
        }).join("") : '<tr class="empty-row"><td colspan="5">No NCR records</td></tr>'}
      </tbody>
    </table>
  `;

  ncrTable.querySelectorAll(".ncr-act").forEach((btn) => {
    btn.onclick = async () => {
      try {
        await updateNcrResolution(state.selectedProjectId, btn.dataset.id, btn.dataset.to);
        showToast(`NCR ${btn.dataset.to.replace("_", " ")}`);
      } catch (err) {
        showToast(err.message, "error");
      }
    };
  });

  ncrSection.append(ncrForm, ncrTable);
  body.append(ncrSection);

  return card;
}

export function buildContractsTab(state) {
  const project = state.projects.find((p) => p.id === state.selectedProjectId);
  const gov = isGovProject(project);
  const card = sectionCard(
    gov ? "VO, Claims & EOT" : "Contracts & Claims",
    gov ? "Variation orders, time extension, liquidated damages" : "Change orders and contract claims"
  );
  const body = card.querySelector(".section-card-body");
  if (!state.selectedProjectId) {
    body.innerHTML = `<p class="proj-empty">Select a project first</p>`;
    return card;
  }

  const boqOpts = (state.boqItems || [])
    .map((b) => `<option value="${b.id}">${escapeHtml(b.itemCode || "")} ${escapeHtml(b.item)}</option>`)
    .join("");

  const ld = gov ? computeLiquidatedDamages(project, state.eotRequests) : { days: 0, amount: 0 };
  const ldBanner = gov
    ? `<p class="gov-ld-banner">LD exposure: <strong>${formatBDT(ld.amount)}</strong> (${ld.days} days beyond contract + approved EOT)</p>`
    : "";

  const revisedBanner = !gov
    ? (() => {
        const { base, variations, revised } = computeRevisedContractValue(project, state.changeOrders || []);
        return `<p class="private-revised-banner">Revised contract value: <strong>${formatBDT(revised)}</strong> (base ${formatBDT(base)}${variations ? ` + variations ${formatBDT(variations)}` : ""})</p>`;
      })()
    : "";

  const coForm = document.createElement("form");
  coForm.className = "form-grid proj-form";
  coForm.innerHTML = gov
    ? `
    <input name="title" placeholder="Variation title *" required />
    <input name="voNumber" placeholder="VO number" />
    <input name="variationNo" placeholder="Variation #" />
    <input name="clauseRef" placeholder="Contract clause ref" />
    <select name="boqId"><option value="">Impacted BOQ item</option>${boqOpts}</select>
    <input name="qtyChange" type="number" step="0.01" placeholder="Qty change" />
    <input name="financialImpact" type="number" placeholder="Financial impact (BDT)" />
    <select name="costCategory">
      <option value="material">material</option>
      <option value="labor">labor</option>
      <option value="subcontract">subcontract</option>
      <option value="equipment">equipment</option>
      <option value="overhead">overhead</option>
    </select>
    <button type="submit" class="btn btn-primary btn-sm">Add variation order</button>
  `
    : `
    <input name="title" placeholder="Change order title *" required />
    <input name="variationNo" placeholder="Variation #" />
    <input name="financialImpact" type="number" placeholder="Financial impact (BDT)" />
    <select name="costCategory">
      <option value="material">material</option>
      <option value="labor">labor</option>
      <option value="subcontract">subcontract</option>
      <option value="equipment">equipment</option>
      <option value="overhead">overhead</option>
    </select>
    <button type="submit" class="btn btn-primary btn-sm">Add change order</button>
  `;
  coForm.onsubmit = async (e) => {
    e.preventDefault();
    try {
      guardAction("create_change_order");
      const fd = new FormData(coForm);
      const id = await create(`${R3_PATHS.changeOrders}/${state.selectedProjectId}`, {
        ...governanceBase(state.selectedProjectId),
        title: fd.get("title"),
        voNumber: fd.get("voNumber") || "",
        variationNo: fd.get("variationNo") || "",
        clauseRef: fd.get("clauseRef") || "",
        boqId: fd.get("boqId") || "",
        qtyChange: Number(fd.get("qtyChange")) || 0,
        financialImpact: Number(fd.get("financialImpact")) || 0,
        costCategory: fd.get("costCategory"),
      });
      await auditProject(state, {
        entityType: "changeOrder",
        entityId: id,
        action: "create",
        diffSummary: `Change order: ${fd.get("title")}`,
      });
      coForm.reset();
      showToast(gov ? "Variation order created" : "Change order created");
    } catch (err) {
      showToast(err.message, "error");
    }
  };

  let eotForm = null;
  if (gov) {
    eotForm = document.createElement("form");
    eotForm.className = "form-grid proj-form";
    eotForm.innerHTML = `
      <input name="title" placeholder="EOT request title *" required />
      <input name="daysRequested" type="number" placeholder="Days requested *" required />
      <input name="reason" placeholder="Reason / justification" />
      <input name="supportingDocUrl" placeholder="Supporting document URL" />
      <button type="submit" class="btn btn-secondary btn-sm">Submit EOT request</button>
    `;
    eotForm.onsubmit = async (e) => {
      e.preventDefault();
      const fd = new FormData(eotForm);
      try {
        const urlCheck = validateUrl(fd.get("supportingDocUrl"));
        if (!urlCheck.ok) {
          showToast(urlCheck.message, "error");
          return;
        }
        const id = await create(`${GOV_PATHS.eotRequests}/${state.selectedProjectId}`, {
          ...governanceBase(state.selectedProjectId),
          title: fd.get("title"),
          daysRequested: Number(fd.get("daysRequested")) || 0,
          reason: fd.get("reason") || "",
          supportingDocUrl: fd.get("supportingDocUrl") || "",
          originalCompletion: project?.completionDate || null,
        });
        await auditProject(state, {
          entityType: "eotRequest",
          entityId: id,
          action: "create",
          diffSummary: `EOT: ${fd.get("title")} (${fd.get("daysRequested")} days)`,
        });
        eotForm.reset();
        showToast("EOT request created");
      } catch (err) {
        showToast(err.message, "error");
      }
    };
  }

  let eotTable = null;
  if (gov) {
    const eotRows = state.eotRequests || [];
    eotTable = document.createElement("div");
    eotTable.className = "table-wrap";
    eotTable.innerHTML = `
      <h4 class="r3-subhead">Time extension (EOT)</h4>
      <table class="dash-table">
        <thead><tr><th>Title</th><th>Requested</th><th>Approved</th><th>Revised date</th><th>Status</th><th>Actions</th></tr></thead>
        <tbody>
          ${eotRows.length ? eotRows.map((r) => {
            const path = `${GOV_PATHS.eotRequests}/${state.selectedProjectId}/${r.id}`;
            return `<tr>
              <td>${escapeHtml(r.title)}</td>
              <td>${r.daysRequested || 0}</td>
              <td>${r.daysApproved || 0}</td>
              <td>${r.revisedCompletion || "-"}</td>
              <td>${statusChip(r.status)}</td>
              <td>${workflowButtonsHtml(r, path, "eotRequest")}</td>
            </tr>`;
          }).join("") : '<tr class="empty-row"><td colspan="6">No EOT requests</td></tr>'}
        </tbody>
      </table>
    `;
  }

  const claimForm = document.createElement("form");
  claimForm.className = "form-grid proj-form";
  claimForm.innerHTML = `
    <input name="title" placeholder="Claim title *" required />
    <input name="amount" type="number" placeholder="Claim amount (BDT) *" required />
    <input name="basis" placeholder="Basis / description" />
    <input name="attachmentUrl" placeholder="Attachment URL" />
    <button type="submit" class="btn btn-secondary btn-sm">Add claim</button>
  `;
  claimForm.onsubmit = async (e) => {
    e.preventDefault();
    try {
      guardAction("create_claim");
      const fd = new FormData(claimForm);
      const urlCheck = validateUrl(fd.get("attachmentUrl"));
      if (!urlCheck.ok) {
        showToast(urlCheck.message, "error");
        return;
      }
      const id = await create(`${R3_PATHS.contractClaims}/${state.selectedProjectId}`, {
        ...governanceBase(state.selectedProjectId),
        title: fd.get("title"),
        amount: Number(fd.get("amount")) || 0,
        basis: fd.get("basis") || "",
        attachmentUrl: fd.get("attachmentUrl") || "",
        settlementStatus: "open",
      });
      await auditProject(state, {
        entityType: "contractClaim",
        entityId: id,
        action: "create",
        diffSummary: `Contract claim: ${fd.get("title")}`,
      });
      claimForm.reset();
      showToast("Claim added");
    } catch (err) {
      showToast(err.message, "error");
    }
  };

  const coRows = state.changeOrders || [];
  const coTable = document.createElement("div");
  coTable.className = "table-wrap";
  coTable.innerHTML = `
    <h4 class="r3-subhead">${gov ? "Variation orders" : "Change orders"}</h4>
    <table class="dash-table">
      <thead><tr><th>Title</th><th>${gov ? "VO #" : "Var #"}</th><th>Impact</th><th>Status</th><th>Actions</th></tr></thead>
      <tbody>
        ${coRows
          .map((r) => {
            const path = `${R3_PATHS.changeOrders}/${state.selectedProjectId}/${r.id}`;
            return `<tr>
              <td>${escapeHtml(r.title)}</td>
              <td>${escapeHtml(r.voNumber || r.variationNo || "-")}</td>
              <td>${formatBDT(r.financialImpact || 0)}</td>
              <td>${statusChip(r.status)}</td>
              <td>${workflowButtonsHtml(r, path, "changeOrder")}</td>
            </tr>`;
          })
          .join("") || `<tr><td colspan="5" class="proj-empty">No change orders</td></tr>`}
      </tbody>
    </table>
  `;

  const claimRows = state.contractClaims || [];
  const claimTable = document.createElement("div");
  claimTable.className = "table-wrap";
  claimTable.innerHTML = `
    <h4 class="r3-subhead">Contract claims</h4>
    <table class="dash-table">
      <thead><tr><th>Title</th><th>Amount</th><th>Settlement</th><th>Status</th><th>Actions</th></tr></thead>
      <tbody>
        ${claimRows
          .map((r) => {
            const path = `${R3_PATHS.contractClaims}/${state.selectedProjectId}/${r.id}`;
            return `<tr data-claim-id="${r.id}">
              <td>${escapeHtml(r.title)}</td>
              <td>${formatBDT(r.amount || 0)}</td>
              <td>${escapeHtml(r.settlementStatus || "open")}</td>
              <td>${statusChip(r.status)}</td>
              <td>${workflowButtonsHtml(r, path, "contractClaim")} ${r.settlementStatus !== "settled" ? `<button type="button" class="btn btn-ghost btn-sm claim-settle-btn" data-id="${r.id}">Settle</button>` : ""}</td>
            </tr>`;
          })
          .join("") || `<tr><td colspan="5" class="proj-empty">No claims</td></tr>`}
      </tbody>
    </table>
  `;

  if (ldBanner) body.insertAdjacentHTML("afterbegin", ldBanner);
  if (revisedBanner) body.insertAdjacentHTML("afterbegin", revisedBanner);
  body.append(coForm, coTable, claimForm, claimTable);
  if (eotForm) body.insertBefore(eotForm, claimForm);
  if (eotTable) body.insertBefore(eotTable, claimForm);

  claimTable.querySelectorAll(".claim-settle-btn").forEach((btn) => {
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

  if (eotTable) {
    wireWorkflowButtons(eotTable, (btn) => {
      const row = (state.eotRequests || []).find((x) => x.id === btn.dataset.id);
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
                let revised = project?.completionDate;
                if (revised && days) {
                  const d = new Date(revised);
                  d.setDate(d.getDate() + days);
                  revised = d.toISOString().slice(0, 10);
                }
                await updatePath(`${GOV_PATHS.eotRequests}/${state.selectedProjectId}/${row.id}`, {
                  ...row,
                  daysApproved: days,
                  revisedCompletion: revised,
                  updatedAt: Date.now(),
                });
                if (revised && project) {
                  await updatePath(`projects/${project.id}`, {
                    ...project,
                    completionDate: revised,
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

  wireWorkflowButtons(coTable, (btn) => {
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
  wireWorkflowButtons(claimTable, (btn) => ({
    projectId: state.selectedProjectId,
    entityType: "contractClaim",
    title: claimRows.find((x) => x.id === btn.dataset.id)?.title,
  }));
  return card;
}
