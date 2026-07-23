/**
 * Projects page tab builders — BOQ, Progress, Resources
 */
import { create, updatePath, removePath } from "./svc_data.js";

import { getCurrentUserId } from "./svc_auth.js";
import {
  computeProjectBudgetSummary,
  computeProjectPhaseBudgetSummary,
  checkBudgetForApproval,
  postProjectExpense,
  boqLineAmount,
} from "./svc_projectCost.js";
import { COST_CATEGORIES } from "./util_projectCost.js";
import { cumulativeMeasuredByBoq } from "./svc_govProject.js";
import { formatBDT, formatDate } from "./util_format.js";
import { showToast } from "./cmp_toast.js";
import { confirmAction } from "./cmp_confirm.js";
import { statusChip, varianceChip } from "./cmp_ui.js";
import { isGovProject } from "./util_govProject.js";
import { parseBoqCsv } from "./svc_govProject.js";
import {
  auditProject,
  openCustFormDialog,
  openEditDialog,
  validatePositiveNumber,
  escapeHtml,
} from "./cmp_projectTab.js";
import { createSupplierBill } from "./svc_supplier.js";

export const R2_TABS = [
  { id: "boq", label: "BOQ & Budget" },
  { id: "progress", label: "Progress" },
  { id: "resources", label: "Resources" },
];

export function bindR2Subs(state, listenProjectSub, onUpdate) {
  const pid = state.selectedProjectId;
  const tabs = ["home", "boq", "progress", "resources"];
  if (!pid) {
    state.boqItems = [];
    state.projectProgress = [];
    state.subcontracts = [];
    state.equipmentLogs = [];
    state.siteDiaries = [];
    return () => {};
  }
  const u1 = listenProjectSub(pid, "boqItems", (list) => {
    state.boqItems = list;
    if (tabs.includes(state.activeTab)) onUpdate();
  });
  const u2 = listenProjectSub(pid, "projectProgress", (list) => {
    state.projectProgress = list;
    if (state.activeTab === "progress") onUpdate();
  });
  const u3 = listenProjectSub(pid, "subcontracts", (list) => {
    state.subcontracts = list;
    if (state.activeTab === "resources") onUpdate();
  });
  const u4 = listenProjectSub(pid, "equipmentLogs", (list) => {
    state.equipmentLogs = list;
    if (state.activeTab === "resources") onUpdate();
  });
  const u5 = listenProjectSub(pid, "siteDiaries", (list) => {
    state.siteDiaries = list;
    if (state.activeTab === "progress") onUpdate();
  });
  return () => {
    u1();
    u2();
    u3();
    u4();
    u5();
  };
}

function boqEditFields(gov) {
  const fields = [
    { name: "item", label: "Description *", required: true },
    { name: "unit", label: "Unit" },
    { name: "qty", label: "Qty *", type: "number", step: "0.01", required: true },
    { name: "rate", label: "Rate (BDT) *", type: "number", step: "0.01", required: true },
    {
      name: "costCategory",
      label: "Category",
      type: "select",
      options: COST_CATEGORIES.map((c) => ({ value: c, label: c })),
    },
  ];
  if (gov) {
    fields.unshift({ name: "itemCode", label: "CSR item code" });
    fields.splice(3, 0, { name: "revision", label: "Revision" });
  }
  return fields;
}

export function renderBoqStatGrid(cards) {
  const grid = document.createElement("div");
  grid.className = "proj-boq-stat-grid";
  grid.innerHTML = (cards || [])
    .map(
      (c) =>
        `<div class="proj-boq-stat-tile${c.attention ? " proj-boq-stat-tile--attention" : ""}${c.review ? " proj-boq-stat-tile--review" : ""}">
          <span class="proj-boq-stat-tile-value">${escapeHtml(String(c.value ?? "—"))}</span>
          <span class="proj-boq-stat-tile-label">${escapeHtml(c.label)}</span>
        </div>`
    )
    .join("");
  return grid;
}

function costCategoryFieldOptions() {
  return COST_CATEGORIES.map((c) => ({ value: c, label: c }));
}

function boqLinesHeadHtml(gov) {
  const title = gov ? "BOQ & CSR lines" : "BOQ lines";
  const csvBlock = gov
    ? `
      <div class="gov-csv-import proj-boq-csv-import">
        <label class="btn btn-ghost btn-sm">Import CSV
          <input type="file" accept=".csv,text/csv" hidden id="boq-csv-input" />
        </label>
        <span class="text-muted">Columns: item_code, description, unit, qty, rate, phase_id, revision</span>
      </div>`
    : "";
  return `
    <div class="proj-boq-lines-head-row">
      <h4 class="proj-boq-section-title proj-boq-lines-head">${escapeHtml(title)}</h4>
      <div class="proj-boq-lines-actions">
        ${csvBlock}
        <button type="button" class="btn btn-primary btn-sm proj-boq-add-btn">Add BOQ line</button>
      </div>
    </div>`;
}

function wireBoqCsvImport(tableWrap, state) {
  tableWrap.querySelector("#boq-csv-input")?.addEventListener("change", async (ev) => {
    const file = ev.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const rows = parseBoqCsv(text);
      if (!rows.length) throw new Error("No rows found in CSV");
      const now = Date.now();
      for (const row of rows) {
        const qty = row.qty || 0;
        const rate = row.rate || 0;
        await create(`boqItems/${state.selectedProjectId}`, {
          itemCode: row.itemCode,
          item: row.item,
          phaseId: row.phaseId,
          unit: row.unit,
          qty,
          contractQty: qty,
          rate,
          amount: qty * rate,
          revision: row.revision || "R0",
          costCategory: "material",
          createdAt: now,
          updatedAt: now,
          createdBy: getCurrentUserId(),
        });
      }
      showToast(`Imported ${rows.length} BOQ lines`);
      ev.target.value = "";
    } catch (err) {
      showToast(err.message, "error");
    }
  });
}

function openAddBoqLineDialog(state) {
  if (!state.selectedProjectId) {
    showToast("Select a project first", "error");
    return;
  }
  const project = state.projects.find((p) => p.id === state.selectedProjectId);
  const gov = isGovProject(project);
  const categoryOptions = costCategoryFieldOptions();
  const phaseOptions = [
    { value: "", label: "WBS phase" },
    ...(state.phases || []).map((ph) => ({ value: ph.id, label: ph.name })),
  ];

  const sections = gov
    ? [
        {
          title: "CSR line",
          fields: [
            { name: "itemCode", label: "CSR item code", type: "text" },
            { name: "item", label: "Description *", type: "text", required: true },
            { name: "phaseId", label: "WBS phase", type: "select", options: phaseOptions },
            { name: "unit", label: "Unit", type: "text" },
            {
              name: "qty",
              label: "Contract qty *",
              type: "number",
              step: "0.01",
              required: true,
            },
            {
              name: "rate",
              label: "Scheduled rate (BDT) *",
              type: "number",
              step: "0.01",
              required: true,
            },
            { name: "revision", label: "Revision", type: "text" },
            {
              name: "costCategory",
              label: "Cost category",
              type: "select",
              options: categoryOptions,
            },
          ],
        },
      ]
    : [
        {
          title: "Line item",
          fields: [
            { name: "item", label: "Item description *", type: "text", required: true },
            { name: "unit", label: "Unit", type: "text" },
            { name: "qty", label: "Qty *", type: "number", step: "0.01", required: true },
            { name: "rate", label: "Rate (BDT) *", type: "number", step: "0.01", required: true },
            {
              name: "costCategory",
              label: "Cost category",
              type: "select",
              options: categoryOptions,
            },
          ],
        },
      ];

  openCustFormDialog({
    title: gov ? "Add BOQ / CSR line" : "Add BOQ line",
    subtitle: gov
      ? "Add a scheduled rate line linked to a WBS phase when applicable."
      : "Quantity and rate update the project budget total.",
    submitLabel: "Add BOQ line",
    modalClass: "proj-boq-modal",
    values: gov
      ? {
          itemCode: "",
          item: "",
          phaseId: "",
          unit: "",
          qty: "",
          rate: "",
          revision: "R0",
          costCategory: categoryOptions[0]?.value || "material",
        }
      : {
          item: "",
          unit: "",
          qty: "",
          rate: "",
          costCategory: categoryOptions[0]?.value || "material",
        },
    sections,
    onSave: async (data) => {
      const qtyLabel = gov ? "Contract qty" : "Qty";
      const qtyCheck = validatePositiveNumber(data.qty, qtyLabel);
      const rateCheck = validatePositiveNumber(data.rate, "Rate");
      if (!qtyCheck.ok) {
        showToast(qtyCheck.message, "error");
        throw new Error("validation");
      }
      if (!rateCheck.ok) {
        showToast(rateCheck.message, "error");
        throw new Error("validation");
      }
      const item = String(data.item || "").trim();
      if (!item) {
        showToast("Description is required", "error");
        throw new Error("validation");
      }
      const qty = qtyCheck.value;
      const rate = rateCheck.value;
      const now = Date.now();
      try {
        const payload = gov
          ? {
              itemCode: String(data.itemCode || "").trim(),
              item,
              phaseId: data.phaseId || "",
              unit: String(data.unit || "").trim(),
              qty,
              contractQty: qty,
              rate,
              amount: qty * rate,
              revision: String(data.revision || "").trim() || "R0",
              costCategory: data.costCategory || "material",
            }
          : {
              item,
              unit: String(data.unit || "").trim(),
              qty,
              rate,
              amount: qty * rate,
              costCategory: data.costCategory || "material",
            };
        const id = await create(`boqItems/${state.selectedProjectId}`, {
          ...payload,
          createdAt: now,
          updatedAt: now,
          createdBy: getCurrentUserId(),
        });
        await auditProject(state, {
          entityType: "boq",
          entityId: id,
          action: "create",
          diffSummary: `BOQ line ${payload.item}`,
        });
        showToast("BOQ line added");
      } catch (err) {
        if (err?.message !== "validation") showToast(err.message, "error");
        throw err;
      }
    },
  });
}

export function buildBoqTab(state) {
  const project = state.projects.find((p) => p.id === state.selectedProjectId);
  const gov = isGovProject(project);
  const root = document.createElement("div");
  root.className = "proj-boq-tab";
  if (!state.selectedProjectId) {
    root.innerHTML = `<p class="proj-empty">Select a project first</p>`;
    return root;
  }

  const summary = computeProjectBudgetSummary(state.selectedProjectId);

  const footLink = document.createElement("div");
  footLink.className = "proj-boq-footlink";
  footLink.innerHTML = `<a href="/accounting" class="text-link">Manage expenses →</a>`;

  const metricsSection = document.createElement("section");
  metricsSection.className = "proj-boq-metrics proj-boq-metrics--planning";
  metricsSection.innerHTML = `<h4 class="proj-boq-section-title">Budget summary</h4>`;
  metricsSection.appendChild(
    renderBoqStatGrid([
      { label: "Budget", value: formatBDT(summary.budgetTotal) },
      { label: "Committed", value: formatBDT(summary.committed) },
      { label: "Actual", value: formatBDT(summary.actual) },
      { label: "Approved expenses", value: formatBDT(summary.approvedExpenseTotal || 0) },
      {
        label: "Remaining",
        value: formatBDT(summary.remaining),
        attention: summary.overBudget,
      },
      {
        label: "Utilization",
        value: `${summary.utilization}%`,
        attention: summary.utilization > 90,
      },
    ])
  );
  metricsSection.appendChild(footLink);

  const phaseRows = computeProjectPhaseBudgetSummary(state.selectedProjectId, state.phases || []);
  const phaseTable = document.createElement("div");
  if (phaseRows.length) {
    phaseTable.className = "reports-table-wrap proj-boq-phase-table";
    phaseTable.innerHTML = `
      <h4 class="proj-boq-section-title proj-boq-phase-head">Budget vs actual by phase</h4>
      <table class="dash-table projects-table">
        <thead><tr><th>Phase</th><th class="rep-col-money">Budget (BDT)</th><th class="rep-col-money">Committed (BDT)</th><th class="rep-col-money">Actual (BDT)</th><th class="rep-col-money">Remaining (BDT)</th></tr></thead>
        <tbody>
          ${phaseRows.map((r) => `
            <tr>
              <td>${escapeHtml(r.name)}</td>
              <td class="rep-col-money">${formatBDT(r.budget)}</td>
              <td class="rep-col-money">${formatBDT(r.committed)}</td>
              <td class="rep-col-money">${formatBDT(r.actual)}</td>
              <td class="rep-col-money">${formatBDT(r.remaining)}</td>
            </tr>`).join("")}
        </tbody>
      </table>
    `;
  }

  const lines = state.boqItems || [];
  const phaseName = (id) => (state.phases || []).find((p) => p.id === id)?.name || "-";
  const measuredByBoq = gov ? cumulativeMeasuredByBoq(state.measurementEntries || []) : {};
  const lineCountLabel =
    lines.length === 1 ? "Showing 1 of 1 line" : `Showing ${lines.length} of ${lines.length} lines`;
  const headHtml = boqLinesHeadHtml(gov);

  const tableWrap = document.createElement("div");
  tableWrap.className = gov
    ? "reports-table-wrap proj-boq-lines-table proj-boq-lines-table--gov"
    : "reports-table-wrap proj-boq-lines-table";
  tableWrap.innerHTML = gov
    ? `
    ${headHtml}
    <table class="dash-table projects-table">
      <colgroup>
        <col class="proj-boq-col-code" />
        <col class="proj-boq-col-item-gov" />
        <col class="proj-boq-col-equal-gov" />
        <col class="proj-boq-col-equal-gov" />
        <col class="proj-boq-col-equal-gov" />
        <col class="proj-boq-col-equal-gov" />
        <col class="proj-boq-col-equal-gov" />
        <col class="proj-boq-col-equal-gov" />
        <col class="proj-boq-col-equal-gov" />
        <col class="proj-boq-col-equal-gov" />
      </colgroup>
      <thead><tr><th>Code</th><th>Item</th><th>Phase</th><th>Unit</th><th>Qty</th><th>Measured</th><th class="rep-col-amount">Rate (BDT)</th><th class="rep-col-amount">Amount (BDT)</th><th>Rev</th><th class="rep-col-actions">Actions</th></tr></thead>
      <tbody>
        ${lines.length ? lines.map((l) => `
          <tr>
            <td>${escapeHtml(l.itemCode || "-")}</td>
            <td>${escapeHtml(l.item)}</td>
            <td>${escapeHtml(phaseName(l.phaseId))}</td>
            <td>${escapeHtml(l.unit || "-")}</td>
            <td>${l.contractQty ?? l.qty}</td>
            <td>${measuredByBoq[l.id] || 0}</td>
            <td class="rep-col-amount">${formatBDT(l.rate)}</td>
            <td class="rep-col-amount">${formatBDT(boqLineAmount(l))}</td>
            <td>${escapeHtml(l.revision || "R0")}</td>
            <td class="rep-col-actions proj-row-actions-cell">
              <button type="button" class="btn btn-ghost btn-sm boq-edit-btn" data-id="${l.id}">Edit</button>
              <button type="button" class="btn btn-ghost btn-sm boq-del-btn" data-id="${l.id}">Delete</button>
            </td>
          </tr>`).join("") : '<tr class="empty-row"><td colspan="10">No BOQ lines — click Add BOQ line</td></tr>'}
      </tbody>
    </table>
    <div class="reports-widget-foot">
      <span class="reports-widget-foot-meta">${escapeHtml(lineCountLabel)}</span>
    </div>
  `
    : `
    ${headHtml}
    <table class="dash-table projects-table">
      <colgroup>
        <col class="proj-boq-col-item" />
        <col class="proj-boq-col-equal" />
        <col class="proj-boq-col-equal" />
        <col class="proj-boq-col-equal" />
        <col class="proj-boq-col-equal" />
        <col class="proj-boq-col-equal" />
        <col class="proj-boq-col-equal" />
      </colgroup>
      <thead><tr><th>Item</th><th>Unit</th><th>Qty</th><th class="rep-col-amount">Rate (BDT)</th><th class="rep-col-amount">Amount (BDT)</th><th>Category</th><th class="rep-col-actions">Actions</th></tr></thead>
      <tbody>
        ${lines.length ? lines.map((l) => `
          <tr>
            <td>${escapeHtml(l.item)}</td>
            <td>${escapeHtml(l.unit || "-")}</td>
            <td>${l.qty}</td>
            <td class="rep-col-amount">${formatBDT(l.rate)}</td>
            <td class="rep-col-amount">${formatBDT(boqLineAmount(l))}</td>
            <td>${statusChip(l.costCategory || "material")}</td>
            <td class="rep-col-actions proj-row-actions-cell">
              <button type="button" class="btn btn-ghost btn-sm boq-edit-btn" data-id="${l.id}">Edit</button>
              <button type="button" class="btn btn-ghost btn-sm boq-del-btn" data-id="${l.id}">Delete</button>
            </td>
          </tr>`).join("") : '<tr class="empty-row"><td colspan="7">No BOQ lines — click Add BOQ line</td></tr>'}
      </tbody>
    </table>
    <div class="reports-widget-foot">
      <span class="reports-widget-foot-meta">${escapeHtml(lineCountLabel)}</span>
    </div>
  `;
  const table = tableWrap;

  root.append(metricsSection);
  if (phaseRows.length) root.appendChild(phaseTable);
  root.append(tableWrap);

  tableWrap.querySelector(".proj-boq-add-btn")?.addEventListener("click", () => openAddBoqLineDialog(state));
  if (gov) wireBoqCsvImport(tableWrap, state);

  const wireBoqEdit = (btn) => {
    const row = lines.find((l) => l.id === btn.dataset.id);
    if (!row) return;
    openEditDialog(
      "Edit BOQ line",
      boqEditFields(gov),
      { ...row, qty: row.contractQty ?? row.qty },
      async (vals) => {
        const qtyCheck = validatePositiveNumber(vals.qty, "Qty");
        const rateCheck = validatePositiveNumber(vals.rate, "Rate");
        if (!qtyCheck.ok || !rateCheck.ok) {
          showToast(qtyCheck.message || rateCheck.message, "error");
          throw new Error("validation");
        }
        const qty = qtyCheck.value;
        const rate = rateCheck.value;
        await updatePath(`boqItems/${state.selectedProjectId}/${row.id}`, {
          ...row,
          item: String(vals.item).trim(),
          itemCode: vals.itemCode?.trim?.() || row.itemCode || "",
          revision: vals.revision?.trim?.() || row.revision || "R0",
          unit: String(vals.unit || "").trim(),
          qty,
          contractQty: qty,
          rate,
          amount: qty * rate,
          costCategory: vals.costCategory,
          updatedAt: Date.now(),
        });
        showToast("BOQ line updated");
      }
    );
  };

  table.querySelectorAll(".boq-edit-btn").forEach((btn) => {
    btn.onclick = () => wireBoqEdit(btn);
  });

  table.querySelectorAll(".boq-del-btn").forEach((btn) => {
    btn.onclick = async () => {
      if (!(await confirmAction({ title: "Delete BOQ line?", message: "Delete this BOQ line?", confirmLabel: "Delete", variant: "danger" }))) return;
      try {
        await removePath(`boqItems/${state.selectedProjectId}/${btn.dataset.id}`);
        showToast("BOQ line removed");
      } catch (err) {
        showToast(err.message, "error");
      }
    };
  });

  return root;
}

function enrichProgressRows(state) {
  return (state.projectProgress || []).map((p) => {
    const boq = (state.boqItems || []).find((b) => b.id === p.boqId);
    const planned = Number(p.plannedQty) || 0;
    const executed = Number(p.executedQty) || 0;
    const pct = planned > 0 ? Math.min(100, Math.round((executed / planned) * 100)) : 0;
    const vKey = pct >= 100 ? "on_time" : pct >= 50 ? "pending" : "delayed";
    return { ...p, _boq: boq?.item || "—", _pct: pct, _vKey: vKey };
  });
}

function openLogProgressDialog(state) {
  if (!state.selectedProjectId) {
    showToast("Select a project first", "error");
    return;
  }
  const today = new Date().toISOString().slice(0, 10);
  const boqOptions = [
    { value: "", label: "BOQ line (optional)" },
    ...(state.boqItems || []).map((b) => ({ value: b.id, label: b.item })),
  ];

  openCustFormDialog({
    title: "Log progress",
    subtitle: "Link to a BOQ line and record executed quantity for this project.",
    submitLabel: "Log progress",
    modalClass: "proj-progress-modal",
    values: {
      boqId: "",
      activity: "",
      plannedQty: "",
      executedQty: "",
      progressDate: today,
      remarks: "",
    },
    sections: [
      {
        title: "Work item",
        fields: [
          { name: "boqId", label: "BOQ line", type: "select", options: boqOptions },
          { name: "activity", label: "Activity *", type: "text", required: true },
          { name: "plannedQty", label: "Planned qty", type: "number", step: "0.01" },
          {
            name: "executedQty",
            label: "Executed qty *",
            type: "number",
            step: "0.01",
            required: true,
          },
        ],
      },
      {
        title: "Log details",
        fields: [
          { name: "progressDate", label: "Date", type: "date" },
          { name: "remarks", label: "Remarks", type: "textarea", fullWidth: true },
        ],
      },
    ],
    onSave: async (data) => {
      const activity = String(data.activity || "").trim();
      if (!activity) {
        showToast("Activity is required", "error");
        throw new Error("validation");
      }
      const execCheck = validatePositiveNumber(data.executedQty, "Executed qty");
      if (!execCheck.ok) {
        showToast(execCheck.message, "error");
        throw new Error("validation");
      }
      const now = Date.now();
      try {
        const id = await create(`projectProgress/${state.selectedProjectId}`, {
          boqId: data.boqId || "",
          activity,
          plannedQty: Number(data.plannedQty) || 0,
          executedQty: execCheck.value,
          progressDate: data.progressDate || today,
          remarks: String(data.remarks || "").trim(),
          createdAt: now,
          updatedAt: now,
          createdBy: getCurrentUserId(),
        });
        await auditProject(state, {
          entityType: "progress",
          entityId: id,
          action: "create",
          diffSummary: `Progress: ${activity}`,
        });
        showToast("Progress logged");
      } catch (err) {
        if (err?.message !== "validation") showToast(err.message, "error");
        throw err;
      }
    },
  });
}

export function buildProgressTab(state) {
  const root = document.createElement("div");
  root.className = "proj-progress-tab";
  if (!state.selectedProjectId) {
    root.innerHTML = `<p class="proj-empty">Select a project first</p>`;
    return root;
  }

  const rows = enrichProgressRows(state);
  const diaryCount = rows.filter((p) => p.refType === "siteDiary").length;
  const behindCount = rows.filter((p) => p._vKey === "delayed").length;
  const onTrackCount = rows.filter((p) => p._pct >= 50).length;

  const metricsSection = document.createElement("section");
  metricsSection.className = "proj-boq-metrics proj-boq-metrics--planning proj-progress-metrics";
  metricsSection.innerHTML = `<h4 class="proj-boq-section-title">Execution overview</h4>`;
  metricsSection.appendChild(
    renderBoqStatGrid([
      { label: "Total logs", value: rows.length },
      { label: "On track", value: onTrackCount },
      {
        label: "Behind",
        value: behindCount,
        attention: behindCount > 0,
      },
      { label: "Field diary", value: diaryCount },
    ])
  );
  const statGrid = metricsSection.querySelector(".proj-boq-stat-grid");
  if (statGrid) statGrid.classList.add("proj-progress-stat-grid");

  const approvedDiaries = (state.siteDiaries || [])
    .filter((d) => d.status === "approved")
    .sort((a, b) => (b.logDate || "").localeCompare(a.logDate || ""));
  const lastDiary = approvedDiaries[0];
  const proj = state.projects?.find((p) => p.id === state.selectedProjectId);

  let fieldBanner = null;
  if (lastDiary) {
    fieldBanner = document.createElement("div");
    fieldBanner.className = "proj-progress-field-banner";
    fieldBanner.innerHTML = `<p class="field-progress-strip">Last field report: <strong>${escapeHtml(lastDiary.logDate)}</strong>${lastDiary.weather ? ` — ${escapeHtml(lastDiary.weather)}` : ""}</p>`;
  } else if (proj?.lastFieldReportDate) {
    fieldBanner = document.createElement("div");
    fieldBanner.className = "proj-progress-field-banner";
    fieldBanner.innerHTML = `<p class="field-progress-strip">Last field report: <strong>${escapeHtml(proj.lastFieldReportDate)}</strong></p>`;
  }

  const countLabel =
    rows.length === 1
      ? "Showing 1 of 1 entry"
      : `Showing ${rows.length} of ${rows.length} entries`;

  const tableWrap = document.createElement("div");
  tableWrap.className = "reports-table-wrap proj-progress-table proj-progress-table-shell";
  tableWrap.innerHTML = `
    <div class="proj-progress-table-head-row">
      <h4 class="proj-boq-section-title proj-progress-table-head">Progress log</h4>
      <button type="button" class="btn btn-primary btn-sm proj-progress-log-btn">Log progress</button>
    </div>
    <table class="dash-table projects-table">
      <colgroup>
        <col class="proj-progress-col-activity" />
        <col class="proj-progress-col-equal" />
        <col class="proj-progress-col-equal" />
        <col class="proj-progress-col-equal" />
        <col class="proj-progress-col-equal" />
        <col class="proj-progress-col-equal" />
      </colgroup>
      <thead>
        <tr>
          <th>Activity</th>
          <th>BOQ line</th>
          <th>Qty</th>
          <th>Progress</th>
          <th>Date</th>
          <th class="rep-col-actions">Actions</th>
        </tr>
      </thead>
      <tbody>
        ${
          rows.length
            ? rows
                .map((p) => {
                  const remarksSub = p.remarks
                    ? `<div class="proj-progress-activity-sub text-muted">${escapeHtml(p.remarks)}</div>`
                    : "";
                  const diaryBadge =
                    p.refType === "siteDiary"
                      ? ' <span class="field-progress-badge">Field diary</span>'
                      : "";
                  const dateLabel = p.progressDate ? formatDate(p.progressDate) : "—";
                  return `
            <tr data-progress-id="${escapeHtml(p.id)}">
              <td>
                <strong>${escapeHtml(p.activity)}</strong>${diaryBadge}
                ${remarksSub}
              </td>
              <td>${escapeHtml(p._boq)}</td>
              <td class="proj-progress-qty">${escapeHtml(String(p.executedQty))} / ${escapeHtml(String(p.plannedQty || "—"))}</td>
              <td>${varianceChip(p._vKey, `${p._pct}%`)}</td>
              <td class="text-muted proj-progress-date">${escapeHtml(dateLabel)}</td>
              <td class="rep-col-actions proj-row-actions-cell">
                <button type="button" class="btn btn-ghost btn-sm prog-edit-btn" data-id="${p.id}">Edit</button>
                <button type="button" class="btn btn-ghost btn-sm prog-del-btn" data-id="${p.id}">Delete</button>
              </td>
            </tr>`;
                })
                .join("")
            : '<tr class="empty-row"><td colspan="6">No progress entries — click Log progress</td></tr>'
        }
      </tbody>
    </table>
    <div class="reports-widget-foot">
      <span class="reports-widget-foot-meta">${escapeHtml(countLabel)}</span>
    </div>
  `;

  if (fieldBanner) root.append(metricsSection, fieldBanner, tableWrap);
  else root.append(metricsSection, tableWrap);

  tableWrap.querySelector(".proj-progress-log-btn")?.addEventListener("click", () =>
    openLogProgressDialog(state)
  );

  tableWrap.querySelectorAll(".prog-edit-btn").forEach((btn) => {
    btn.onclick = () => {
      const p = rows.find((x) => x.id === btn.dataset.id);
      if (!p) return;
      openEditDialog(
        "Edit progress entry",
        [
          { name: "activity", label: "Activity *", required: true },
          { name: "plannedQty", label: "Planned qty", type: "number" },
          { name: "executedQty", label: "Executed qty *", type: "number", required: true },
          { name: "progressDate", label: "Date", type: "date" },
          { name: "remarks", label: "Remarks", type: "textarea" },
        ],
        p,
        async (vals) => {
          const execCheck = validatePositiveNumber(vals.executedQty, "Executed qty");
          if (!execCheck.ok) {
            showToast(execCheck.message, "error");
            throw new Error("validation");
          }
          await updatePath(`projectProgress/${state.selectedProjectId}/${p.id}`, {
            ...p,
            activity: String(vals.activity).trim(),
            plannedQty: Number(vals.plannedQty) || 0,
            executedQty: execCheck.value,
            progressDate: vals.progressDate || "",
            remarks: String(vals.remarks || "").trim(),
            updatedAt: Date.now(),
          });
          showToast("Progress updated");
        }
      );
    };
  });

  tableWrap.querySelectorAll(".prog-del-btn").forEach((btn) => {
    btn.onclick = async () => {
      if (
        !(await confirmAction({
          title: "Delete progress entry?",
          message: "Delete this progress entry?",
          confirmLabel: "Delete",
          variant: "danger",
        }))
      )
        return;
      try {
        await removePath(`projectProgress/${state.selectedProjectId}/${btn.dataset.id}`);
        showToast("Progress entry removed");
      } catch (err) {
        showToast(err.message, "error");
      }
    };
  });

  return root;
}

function subcontractSupplierOptions(state) {
  return [
    { value: "", label: "Subcontractor" },
    ...(state.suppliers || [])
      .filter((s) => s.type === "subcontract" || s.type === "material" || !s.type)
      .map((s) => ({ value: s.id, label: s.name })),
  ];
}

function equipmentSupplierOptions(state) {
  return [
    { value: "", label: "Rental supplier" },
    ...(state.suppliers || [])
      .filter((s) => s.type === "equipment" || s.type === "material" || !s.type)
      .map((s) => ({ value: s.id, label: s.name })),
  ];
}

function boqSelectOptions(state) {
  return [
    { value: "", label: "BOQ line" },
    ...(state.boqItems || []).map((b) => ({ value: b.id, label: b.item })),
  ];
}

function openAddSubcontractDialog(state) {
  if (!state.selectedProjectId) {
    showToast("Select a project first", "error");
    return;
  }
  openCustFormDialog({
    title: "Add subcontract",
    subtitle: "Link a subcontractor to BOQ scope and record contract billing.",
    submitLabel: "Add subcontract",
    modalClass: "proj-sub-modal",
    values: {
      supplierId: "",
      contractorName: "",
      scope: "",
      boqId: "",
      amount: "",
      paymentTermsDays: "30",
      performanceRating: "",
      billedAmount: "",
    },
    sections: [
      {
        title: "Contractor",
        fields: [
          { name: "supplierId", label: "Subcontractor", type: "select", options: subcontractSupplierOptions(state) },
          { name: "contractorName", label: "Or name", type: "text" },
          { name: "scope", label: "Scope", type: "text" },
          { name: "boqId", label: "BOQ line", type: "select", options: boqSelectOptions(state) },
        ],
      },
      {
        title: "Commercial",
        fields: [
          { name: "amount", label: "Contract amount (BDT)", type: "number", step: "0.01" },
          { name: "paymentTermsDays", label: "Payment terms (days)", type: "number" },
          { name: "performanceRating", label: "Rating 1–5", type: "number", step: "1" },
          { name: "billedAmount", label: "Bill now (BDT)", type: "number", step: "0.01" },
        ],
      },
    ],
    onSave: async (data) => {
      const now = Date.now();
      const billed = Number(data.billedAmount) || 0;
      const supplierId = data.supplierId || "";
      const supplier = (state.suppliers || []).find((s) => s.id === supplierId);
      const contractorName = String(data.contractorName || "").trim() || supplier?.name || "";
      if (!contractorName) {
        showToast("Select supplier or enter name", "error");
        throw new Error("validation");
      }
      try {
        const id = await create(`subcontracts/${state.selectedProjectId}`, {
          contractorName,
          supplierId: supplierId || "",
          scope: String(data.scope || "").trim(),
          boqId: data.boqId || "",
          amount: Number(data.amount) || 0,
          paymentTermsDays: Number(data.paymentTermsDays) || 30,
          performanceRating: Number(data.performanceRating) || 0,
          billedAmount: billed,
          status: billed > 0 ? "approved" : "draft",
          costCategory: "subcontract",
          projectId: state.selectedProjectId,
          createdAt: now,
          updatedAt: now,
        });
        if (billed > 0 && supplierId) {
          await createSupplierBill(
            {
              supplierId,
              supplierName: contractorName,
              projectId: state.selectedProjectId,
              amount: billed,
              paymentTermsDays: supplier?.paymentTermsDays ?? 30,
              costCategory: "subcontract",
              narration: `Subcontract ${contractorName}`,
              sourceType: "subcontract",
              sourceRef: { collection: "subcontracts", projectId: state.selectedProjectId, id },
            },
            { autoApprove: true, billCount: (state.supplierBills || []).length }
          );
        } else if (billed > 0) {
          await postProjectExpense({
            projectId: state.selectedProjectId,
            amount: billed,
            costCategory: "subcontract",
            narration: `Subcontract ${contractorName}`,
            refType: "subcontract",
            refId: id,
          });
        }
        showToast("Subcontract saved");
      } catch (err) {
        if (err?.message !== "validation") showToast(err.message, "error");
        throw err;
      }
    },
  });
}

function openLogEquipmentDialog(state) {
  if (!state.selectedProjectId) {
    showToast("Select a project first", "error");
    return;
  }
  const today = new Date().toISOString().slice(0, 10);
  openCustFormDialog({
    title: "Log equipment",
    subtitle: "Record rental or equipment cost for this project.",
    submitLabel: "Log equipment",
    modalClass: "proj-eq-modal",
    values: {
      supplierId: "",
      equipmentName: "",
      hours: "",
      cost: "",
      logDate: today,
    },
    sections: [
      {
        title: "Equipment log",
        fields: [
          { name: "supplierId", label: "Rental supplier", type: "select", options: equipmentSupplierOptions(state) },
          { name: "equipmentName", label: "Equipment *", type: "text", required: true },
          { name: "hours", label: "Hours", type: "number", step: "0.01" },
          { name: "cost", label: "Cost (BDT) *", type: "number", step: "0.01", required: true },
          { name: "logDate", label: "Date", type: "date" },
        ],
      },
    ],
    onSave: async (data) => {
      const equipmentName = String(data.equipmentName || "").trim();
      if (!equipmentName) {
        showToast("Equipment name is required", "error");
        throw new Error("validation");
      }
      const cost = Number(data.cost);
      if (!Number.isFinite(cost)) {
        showToast("Valid cost is required", "error");
        throw new Error("validation");
      }
      const supplierId = data.supplierId || "";
      const supplier = (state.suppliers || []).find((s) => s.id === supplierId);
      const now = Date.now();
      try {
        const id = await create(`equipmentLogs/${state.selectedProjectId}`, {
          equipmentName,
          supplierId: supplierId || "",
          hours: Number(data.hours) || 0,
          cost,
          logDate: data.logDate || today,
          costCategory: "equipment",
          projectId: state.selectedProjectId,
          createdAt: now,
          updatedAt: now,
        });
        if (supplierId && cost > 0) {
          await createSupplierBill(
            {
              supplierId,
              supplierName: supplier?.name || "",
              projectId: state.selectedProjectId,
              amount: cost,
              billDate: data.logDate || today,
              paymentTermsDays: supplier?.paymentTermsDays ?? 30,
              costCategory: "equipment",
              narration: `Equipment ${equipmentName}`,
              sourceType: "equipment",
              sourceRef: { collection: "equipmentLogs", projectId: state.selectedProjectId, id },
            },
            { autoApprove: true, billCount: (state.supplierBills || []).length }
          );
        } else {
          await postProjectExpense({
            projectId: state.selectedProjectId,
            amount: cost,
            costCategory: "equipment",
            narration: `Equipment ${equipmentName}`,
            refType: "equipmentLog",
            refId: id,
          });
        }
        showToast("Equipment logged");
      } catch (err) {
        if (err?.message !== "validation") showToast(err.message, "error");
        throw err;
      }
    },
  });
}

export function buildResourcesTab(state) {
  const root = document.createElement("div");
  root.className = "proj-resources-tab";
  if (!state.selectedProjectId) {
    root.innerHTML = `<p class="proj-empty">Select a project first</p>`;
    return root;
  }

  const subs = state.subcontracts || [];
  const eqs = state.equipmentLogs || [];
  const activeSubs = subs.filter((s) => (s.status || "draft") !== "completed").length;
  const eqSpend = eqs.reduce((sum, e) => sum + (Number(e.cost) || 0), 0);

  const metricsSection = document.createElement("section");
  metricsSection.className = "proj-boq-metrics proj-boq-metrics--planning proj-resources-metrics";
  metricsSection.innerHTML = `<h4 class="proj-boq-section-title">Resource overview</h4>`;
  metricsSection.appendChild(
    renderBoqStatGrid([
      { label: "Subcontracts", value: subs.length },
      { label: "Active", value: activeSubs },
      { label: "Equipment logs", value: eqs.length },
      { label: "Equipment spend", value: formatBDT(eqSpend) },
    ])
  );
  const statGrid = metricsSection.querySelector(".proj-boq-stat-grid");
  if (statGrid) statGrid.classList.add("proj-resources-stat-grid");

  const boqLabel = (boqId) => {
    if (!boqId) return "—";
    const line = (state.boqItems || []).find((b) => b.id === boqId);
    return line?.item || "—";
  };
  const supplierLabel = (supplierId) => {
    if (!supplierId) return "—";
    return (state.suppliers || []).find((s) => s.id === supplierId)?.name || "—";
  };

  const subCountLabel =
    subs.length === 1
      ? "Showing 1 of 1 subcontract"
      : `Showing ${subs.length} of ${subs.length} subcontracts`;

  const subTableWrap = document.createElement("div");
  subTableWrap.className =
    "reports-table-wrap proj-resources-table proj-resources-sub-table-shell";
  subTableWrap.innerHTML = `
    <div class="proj-resources-table-head-row">
      <h4 class="proj-boq-section-title proj-resources-table-head">Subcontracts</h4>
      <button type="button" class="btn btn-primary btn-sm proj-sub-add-btn">Add subcontract</button>
    </div>
    <table class="dash-table projects-table">
      <colgroup>
        <col class="proj-resources-col-name" />
        <col class="proj-resources-col-equal" />
        <col class="proj-resources-col-equal" />
        <col class="proj-resources-col-equal" />
        <col class="proj-resources-col-equal" />
        <col class="proj-resources-col-equal" />
        <col class="proj-resources-col-equal" />
      </colgroup>
      <thead>
        <tr>
          <th>Contractor</th>
          <th>BOQ</th>
          <th>Contract</th>
          <th>Billed</th>
          <th>Rating</th>
          <th>Status</th>
          <th class="rep-col-actions">Actions</th>
        </tr>
      </thead>
      <tbody>
        ${
          subs.length
            ? subs
                .map((s) => {
                  const scopeSub = s.scope
                    ? `<div class="proj-resources-subline text-muted">${escapeHtml(s.scope)}</div>`
                    : "";
                  const rating = s.performanceRating
                    ? `★${escapeHtml(String(s.performanceRating))}`
                    : "—";
                  const completeBtn =
                    s.status !== "completed"
                      ? `<button type="button" class="btn btn-ghost btn-sm sub-complete-btn" data-id="${escapeHtml(s.id)}">Mark complete</button>`
                      : "";
                  return `
            <tr data-sub-id="${escapeHtml(s.id)}">
              <td>
                <strong class="proj-resources-name-main">${escapeHtml(s.contractorName)}</strong>
                ${scopeSub}
              </td>
              <td>${escapeHtml(boqLabel(s.boqId))}</td>
              <td>${formatBDT(s.amount || 0)}</td>
              <td class="text-muted">${formatBDT(s.billedAmount || 0)} / ${formatBDT(s.amount || 0)}</td>
              <td>${rating}</td>
              <td>${statusChip(s.status || "draft")}</td>
              <td class="rep-col-actions proj-row-actions-cell">
                <button type="button" class="btn btn-ghost btn-sm sub-edit-btn" data-id="${escapeHtml(s.id)}">Edit billed</button>
                ${completeBtn}
              </td>
            </tr>`;
                })
                .join("")
            : '<tr class="empty-row"><td colspan="7">No subcontracts — click Add subcontract</td></tr>'
        }
      </tbody>
    </table>
    <div class="reports-widget-foot">
      <span class="reports-widget-foot-meta">${escapeHtml(subCountLabel)}</span>
    </div>
  `;

  const eqCountLabel =
    eqs.length === 1
      ? "Showing 1 of 1 log"
      : `Showing ${eqs.length} of ${eqs.length} logs`;

  const eqTableWrap = document.createElement("div");
  eqTableWrap.className =
    "reports-table-wrap proj-resources-table proj-resources-eq-table-shell";
  eqTableWrap.innerHTML = `
    <div class="proj-resources-table-head-row">
      <h4 class="proj-boq-section-title proj-resources-table-head">Equipment logs</h4>
      <button type="button" class="btn btn-primary btn-sm proj-eq-log-btn">Log equipment</button>
    </div>
    <table class="dash-table projects-table">
      <colgroup>
        <col class="proj-resources-eq-col-name" />
        <col class="proj-resources-eq-col-equal" />
        <col class="proj-resources-eq-col-equal" />
        <col class="proj-resources-eq-col-equal" />
        <col class="proj-resources-eq-col-equal" />
      </colgroup>
      <thead>
        <tr>
          <th>Equipment</th>
          <th>Hours</th>
          <th>Cost</th>
          <th>Date</th>
          <th>Supplier</th>
        </tr>
      </thead>
      <tbody>
        ${
          eqs.length
            ? eqs
                .map(
                  (e) => `
            <tr>
              <td><strong class="proj-resources-name-main">${escapeHtml(e.equipmentName)}</strong></td>
              <td>${escapeHtml(String(e.hours ?? 0))}</td>
              <td>${formatBDT(e.cost || 0)}</td>
              <td class="text-muted">${escapeHtml(e.logDate ? formatDate(e.logDate) : "—")}</td>
              <td>${escapeHtml(supplierLabel(e.supplierId))}</td>
            </tr>`
                )
                .join("")
            : '<tr class="empty-row"><td colspan="5">No equipment logs — click Log equipment</td></tr>'
        }
      </tbody>
    </table>
    <div class="reports-widget-foot">
      <span class="reports-widget-foot-meta">${escapeHtml(eqCountLabel)}</span>
    </div>
  `;

  root.append(metricsSection, subTableWrap, eqTableWrap);

  subTableWrap.querySelector(".proj-sub-add-btn")?.addEventListener("click", () =>
    openAddSubcontractDialog(state)
  );
  eqTableWrap.querySelector(".proj-eq-log-btn")?.addEventListener("click", () =>
    openLogEquipmentDialog(state)
  );

  subTableWrap.querySelectorAll(".sub-edit-btn").forEach((btn) => {
    btn.onclick = () => {
      const s = subs.find((x) => x.id === btn.dataset.id);
      if (!s) return;
      openEditDialog(
        "Edit subcontract billing",
        [
          { name: "billedAmount", label: "Billed to date (BDT)", type: "number", required: true },
          { name: "amount", label: "Contract amount (BDT)", type: "number" },
        ],
        s,
        async (vals) => {
          await updatePath(`subcontracts/${state.selectedProjectId}/${s.id}`, {
            ...s,
            billedAmount: Number(vals.billedAmount) || 0,
            amount: Number(vals.amount) || s.amount || 0,
            updatedAt: Date.now(),
          });
          showToast("Subcontract updated");
        }
      );
    };
  });

  subTableWrap.querySelectorAll(".sub-complete-btn").forEach((btn) => {
    btn.onclick = async () => {
      const s = subs.find((x) => x.id === btn.dataset.id);
      if (!s) return;
      try {
        await updatePath(`subcontracts/${state.selectedProjectId}/${s.id}`, {
          ...s,
          status: "completed",
          updatedAt: Date.now(),
        });
        showToast("Subcontract marked complete");
      } catch (err) {
        showToast(err.message, "error");
      }
    };
  });

  return root;
}

export { checkBudgetForApproval, postProjectExpense };
