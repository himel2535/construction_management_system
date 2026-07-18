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
import { formatBDT } from "./util_format.js";
import { showToast } from "./cmp_toast.js";
import { sectionCard, statusChip, varianceChip } from "./cmp_ui.js";
import { isGovProject } from "./util_govProject.js";
import { parseBoqCsv } from "./svc_govProject.js";
import {
  auditProject,
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

export function buildBoqTab(state) {
  const project = state.projects.find((p) => p.id === state.selectedProjectId);
  const gov = isGovProject(project);
  const card = sectionCard(
    gov ? "BOQ & CSR" : "BOQ & Budget",
    gov ? "Schedule of rates BOQ with item codes and WBS phase link" : "Bill of quantities and budget variance"
  );
  const body = card.querySelector(".section-card-body");
  if (!state.selectedProjectId) {
    body.innerHTML = `<p class="proj-empty">Select a project first</p>`;
    return card;
  }

  const summary = computeProjectBudgetSummary(state.selectedProjectId);
  const summaryHtml = document.createElement("div");
  summaryHtml.className = "r2-budget-summary";
  summaryHtml.innerHTML = `
    <div class="r2-stat"><span class="cust-detail-label">Budget</span><strong>${formatBDT(summary.budgetTotal)}</strong></div>
    <div class="r2-stat"><span class="cust-detail-label">Committed</span><strong>${formatBDT(summary.committed)}</strong></div>
    <div class="r2-stat"><span class="cust-detail-label">Actual</span><strong>${formatBDT(summary.actual)}</strong></div>
    <div class="r2-stat"><span class="cust-detail-label">Approved expenses</span><strong>${formatBDT(summary.approvedExpenseTotal || 0)}</strong></div>
    <div class="r2-stat"><span class="cust-detail-label">Remaining</span><strong class="${summary.overBudget ? "text-danger" : ""}">${formatBDT(summary.remaining)}</strong></div>
    <div class="r2-stat"><span class="cust-detail-label">Utilization</span>${varianceChip(summary.utilization > 90 ? "delayed" : "on_time", `${summary.utilization}%`)}</div>
    <div class="r2-stat r2-stat--link"><a href="#/accounting" class="text-link">Manage expenses →</a></div>
  `;

  const phaseRows = computeProjectPhaseBudgetSummary(state.selectedProjectId, state.phases || []);
  const phaseTable = document.createElement("div");
  if (phaseRows.length) {
    phaseTable.className = "table-wrap phase-budget-table";
    phaseTable.innerHTML = `
      <h4 class="r3-subhead">Budget vs actual by phase</h4>
      <table class="dash-table">
        <thead><tr><th>Phase</th><th class="text-right">Budget</th><th class="text-right">Committed</th><th class="text-right">Actual</th><th class="text-right">Remaining</th></tr></thead>
        <tbody>
          ${phaseRows.map((r) => `
            <tr>
              <td>${escapeHtml(r.name)}</td>
              <td class="text-right">${formatBDT(r.budget)}</td>
              <td class="text-right">${formatBDT(r.committed)}</td>
              <td class="text-right">${formatBDT(r.actual)}</td>
              <td class="text-right">${formatBDT(r.remaining)}</td>
            </tr>`).join("")}
        </tbody>
      </table>
    `;
  }

  const phaseOpts = (state.phases || [])
    .map((ph) => `<option value="${ph.id}">${escapeHtml(ph.name)}</option>`)
    .join("");

  const form = document.createElement("form");
  form.className = "form-grid proj-form";
  form.innerHTML = gov
    ? `
    <input name="itemCode" placeholder="CSR item code" />
    <input name="item" placeholder="Description *" required />
    <select name="phaseId"><option value="">WBS phase</option>${phaseOpts}</select>
    <input name="unit" placeholder="Unit (cum, sqft, md)" />
    <input name="qty" type="number" step="0.01" placeholder="Contract qty *" required />
    <input name="rate" type="number" step="0.01" placeholder="Scheduled rate *" required />
    <input name="revision" placeholder="Revision" value="R0" />
    <select name="costCategory">${COST_CATEGORIES.map((c) => `<option value="${c}">${c}</option>`).join("")}</select>
    <button type="submit" class="btn btn-primary btn-sm">Add BOQ line</button>
  `
    : `
    <input name="item" placeholder="Item description *" required />
    <input name="unit" placeholder="Unit (cum, sqft, md)" />
    <input name="qty" type="number" placeholder="Qty *" required />
    <input name="rate" type="number" placeholder="Rate *" required />
    <select name="costCategory">${COST_CATEGORIES.map((c) => `<option value="${c}">${c}</option>`).join("")}</select>
    <button type="submit" class="btn btn-primary btn-sm">Add BOQ line</button>
  `;

  const importWrap = document.createElement("div");
  if (gov) {
    importWrap.className = "gov-csv-import";
    importWrap.innerHTML = `
      <label class="btn btn-ghost btn-sm">Import CSV
        <input type="file" accept=".csv,text/csv" hidden id="boq-csv-input" />
      </label>
      <span class="text-muted">Columns: item_code, description, unit, qty, rate, phase_id, revision</span>
    `;
  }

  const table = document.createElement("div");
  table.className = "table-wrap";
  const lines = state.boqItems || [];
  const phaseName = (id) => (state.phases || []).find((p) => p.id === id)?.name || "-";
  const measuredByBoq = gov ? cumulativeMeasuredByBoq(state.measurementEntries || []) : {};
  table.innerHTML = gov
    ? `
    <table class="dash-table">
      <thead><tr><th>Code</th><th>Item</th><th>Phase</th><th>Unit</th><th>Qty</th><th>Measured</th><th>Rate</th><th>Amount</th><th>Rev</th><th></th></tr></thead>
      <tbody>
        ${lines.length ? lines.map((l) => `
          <tr>
            <td>${escapeHtml(l.itemCode || "-")}</td>
            <td>${escapeHtml(l.item)}</td>
            <td>${escapeHtml(phaseName(l.phaseId))}</td>
            <td>${escapeHtml(l.unit || "-")}</td>
            <td>${l.contractQty ?? l.qty}</td>
            <td>${measuredByBoq[l.id] || 0}</td>
            <td>${formatBDT(l.rate)}</td>
            <td>${formatBDT(boqLineAmount(l))}</td>
            <td>${escapeHtml(l.revision || "R0")}</td>
            <td class="proj-row-actions-cell">
              <button type="button" class="btn btn-ghost btn-sm boq-edit-btn" data-id="${l.id}">Edit</button>
              <button type="button" class="btn btn-ghost btn-sm boq-del-btn" data-id="${l.id}">Delete</button>
            </td>
          </tr>`).join("") : '<tr class="empty-row"><td colspan="10">No BOQ lines</td></tr>'}
      </tbody>
    </table>
  `
    : `
    <table class="dash-table">
      <thead><tr><th>Item</th><th>Unit</th><th>Qty</th><th>Rate</th><th>Amount</th><th>Category</th><th></th></tr></thead>
      <tbody>
        ${lines.length ? lines.map((l) => `
          <tr>
            <td>${escapeHtml(l.item)}</td>
            <td>${escapeHtml(l.unit || "-")}</td>
            <td>${l.qty}</td>
            <td>${formatBDT(l.rate)}</td>
            <td>${formatBDT(boqLineAmount(l))}</td>
            <td>${statusChip(l.costCategory || "material")}</td>
            <td class="proj-row-actions-cell">
              <button type="button" class="btn btn-ghost btn-sm boq-edit-btn" data-id="${l.id}">Edit</button>
              <button type="button" class="btn btn-ghost btn-sm boq-del-btn" data-id="${l.id}">Delete</button>
            </td>
          </tr>`).join("") : '<tr class="empty-row"><td colspan="7">No BOQ lines</td></tr>'}
      </tbody>
    </table>
  `;

  body.append(summaryHtml, phaseTable, form, importWrap, table);

  form.onsubmit = async (e) => {
    e.preventDefault();
    const qtyCheck = validatePositiveNumber(form.qty.value, "Qty");
    const rateCheck = validatePositiveNumber(form.rate.value, "Rate");
    if (!qtyCheck.ok) {
      showToast(qtyCheck.message, "error");
      return;
    }
    if (!rateCheck.ok) {
      showToast(rateCheck.message, "error");
      return;
    }
    const qty = qtyCheck.value;
    const rate = rateCheck.value;
    const now = Date.now();
    try {
      const payload = gov
        ? {
            itemCode: form.itemCode?.value.trim() || "",
            item: form.item.value.trim(),
            phaseId: form.phaseId?.value || "",
            unit: form.unit.value.trim(),
            qty,
            contractQty: qty,
            rate,
            amount: qty * rate,
            revision: form.revision?.value.trim() || "R0",
            costCategory: form.costCategory.value,
          }
        : {
            item: form.item.value.trim(),
            unit: form.unit.value.trim(),
            qty,
            rate,
            amount: qty * rate,
            costCategory: form.costCategory.value,
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
      form.reset();
      showToast("BOQ line added");
    } catch (err) {
      showToast(err.message, "error");
    }
  };

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
      if (!confirm("Delete this BOQ line?")) return;
      try {
        await removePath(`boqItems/${state.selectedProjectId}/${btn.dataset.id}`);
        showToast("BOQ line removed");
      } catch (err) {
        showToast(err.message, "error");
      }
    };
  });

  importWrap.querySelector("#boq-csv-input")?.addEventListener("change", async (ev) => {
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

  return card;
}

export function buildProgressTab(state) {
  const card = sectionCard("Execution Progress", "Daily progress linked to BOQ lines");
  const body = card.querySelector(".section-card-body");
  if (!state.selectedProjectId) {
    body.innerHTML = `<p class="proj-empty">Select a project first</p>`;
    return card;
  }

  const boqOpts = (state.boqItems || [])
    .map((b) => `<option value="${b.id}">${escapeHtml(b.item)}</option>`)
    .join("");

  const approvedDiaries = (state.siteDiaries || [])
    .filter((d) => d.status === "approved")
    .sort((a, b) => (b.logDate || "").localeCompare(a.logDate || ""));
  const lastDiary = approvedDiaries[0];

  const fieldStripEl = document.createElement("div");
  if (lastDiary) {
    fieldStripEl.innerHTML = `<p class="field-progress-strip">Last field report: <strong>${escapeHtml(lastDiary.logDate)}</strong>${lastDiary.weather ? ` — ${escapeHtml(lastDiary.weather)}` : ""}</p>`;
  } else {
    const proj = state.projects?.find((p) => p.id === state.selectedProjectId);
    if (proj?.lastFieldReportDate) {
      fieldStripEl.innerHTML = `<p class="field-progress-strip">Last field report: <strong>${escapeHtml(proj.lastFieldReportDate)}</strong></p>`;
    }
  }

  const form = document.createElement("form");
  form.className = "form-grid proj-form";
  form.innerHTML = `
    <select name="boqId"><option value="">BOQ line</option>${boqOpts}</select>
    <input name="activity" placeholder="Activity *" required />
    <input name="plannedQty" type="number" placeholder="Planned qty" />
    <input name="executedQty" type="number" placeholder="Executed qty *" required />
    <input name="progressDate" type="date" value="${new Date().toISOString().slice(0, 10)}" />
    <input name="remarks" placeholder="Remarks" />
    <button type="submit" class="btn btn-primary btn-sm">Log progress</button>
  `;

  const rows = (state.projectProgress || []).map((p) => {
    const boq = (state.boqItems || []).find((b) => b.id === p.boqId);
    const planned = Number(p.plannedQty) || 0;
    const executed = Number(p.executedQty) || 0;
    const pct = planned > 0 ? Math.min(100, Math.round((executed / planned) * 100)) : 0;
    const vKey = pct >= 100 ? "on_time" : pct >= 50 ? "pending" : "delayed";
    return { ...p, _boq: boq?.item || "-", _pct: pct, _vKey: vKey };
  });

  const list = document.createElement("div");
  list.className = "proj-phase-list";
  list.innerHTML = rows.length
    ? rows
        .map(
          (p) => `
      <div class="proj-phase-row" data-progress-id="${p.id}">
        <div><strong>${escapeHtml(p.activity)}</strong> <span class="text-muted">${escapeHtml(p._boq)}</span>${p.refType === "siteDiary" ? ' <span class="field-progress-badge">Field diary</span>' : ""}</div>
        <div>${p.executedQty} / ${p.plannedQty || "-"} ${varianceChip(p._vKey, `${p._pct}%`)}</div>
        <div class="text-muted">${p.progressDate || "-"} ${p.remarks ? "· " + escapeHtml(p.remarks) : ""}</div>
        <div class="proj-row-actions">
          <button type="button" class="btn btn-ghost btn-sm prog-edit-btn" data-id="${p.id}">Edit</button>
          <button type="button" class="btn btn-ghost btn-sm prog-del-btn" data-id="${p.id}">Delete</button>
        </div>
      </div>`
        )
        .join("")
    : `<p class="proj-empty">No progress entries</p>`;

  if (fieldStripEl.firstElementChild) body.appendChild(fieldStripEl.firstElementChild);
  body.append(form, list);

  form.onsubmit = async (e) => {
    e.preventDefault();
    const execCheck = validatePositiveNumber(form.executedQty.value, "Executed qty");
    if (!execCheck.ok) {
      showToast(execCheck.message, "error");
      return;
    }
    const now = Date.now();
    try {
      const id = await create(`projectProgress/${state.selectedProjectId}`, {
        boqId: form.boqId.value,
        activity: form.activity.value.trim(),
        plannedQty: Number(form.plannedQty.value) || 0,
        executedQty: execCheck.value,
        progressDate: form.progressDate.value,
        remarks: form.remarks.value.trim(),
        createdAt: now,
        updatedAt: now,
        createdBy: getCurrentUserId(),
      });
      await auditProject(state, {
        entityType: "progress",
        entityId: id,
        action: "create",
        diffSummary: `Progress: ${form.activity.value.trim()}`,
      });
      form.reset();
      showToast("Progress logged");
    } catch (err) {
      showToast(err.message, "error");
    }
  };

  list.querySelectorAll(".prog-edit-btn").forEach((btn) => {
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

  list.querySelectorAll(".prog-del-btn").forEach((btn) => {
    btn.onclick = async () => {
      if (!confirm("Delete this progress entry?")) return;
      try {
        await removePath(`projectProgress/${state.selectedProjectId}/${btn.dataset.id}`);
        showToast("Progress entry removed");
      } catch (err) {
        showToast(err.message, "error");
      }
    };
  });

  return card;
}

export function buildResourcesTab(state) {
  const card = sectionCard("Subcontract & Equipment", "Resource costs linked to project");
  const body = card.querySelector(".section-card-body");
  if (!state.selectedProjectId) {
    body.innerHTML = `<p class="proj-empty">Select a project first</p>`;
    return card;
  }

  const boqOpts = (state.boqItems || [])
    .map((b) => `<option value="${b.id}">${escapeHtml(b.item)}</option>`)
    .join("");

  const supplierOpts = (state.suppliers || [])
    .filter((s) => s.type === "subcontract" || s.type === "material" || !s.type)
    .map((s) => `<option value="${s.id}">${escapeHtml(s.name)}</option>`)
    .join("");

  const subForm = document.createElement("form");
  subForm.className = "form-grid proj-form-inline";
  subForm.innerHTML = `
    <select name="supplierId"><option value="">Subcontractor</option>${supplierOpts}</select>
    <input name="contractorName" placeholder="Or name *" />
    <input name="scope" placeholder="Scope" />
    <select name="boqId"><option value="">BOQ</option>${boqOpts}</select>
    <input name="amount" type="number" placeholder="Contract amount" />
    <input name="paymentTermsDays" type="number" placeholder="Payment terms (days)" value="30" />
    <input name="performanceRating" type="number" min="1" max="5" placeholder="Rating 1-5" />
    <input name="billedAmount" type="number" placeholder="Bill now (BDT)" />
    <button type="submit" class="btn btn-primary btn-sm">Add subcontract</button>
  `;

  const eqSupplierOpts = (state.suppliers || [])
    .filter((s) => s.type === "equipment" || s.type === "material" || !s.type)
    .map((s) => `<option value="${s.id}">${escapeHtml(s.name)}</option>`)
    .join("");

  const eqForm = document.createElement("form");
  eqForm.className = "form-grid proj-form-inline";
  eqForm.innerHTML = `
    <select name="supplierId"><option value="">Rental supplier</option>${eqSupplierOpts}</select>
    <input name="equipmentName" placeholder="Equipment *" required />
    <input name="hours" type="number" placeholder="Hours" />
    <input name="cost" type="number" placeholder="Cost *" required />
    <input name="logDate" type="date" value="${new Date().toISOString().slice(0, 10)}" />
    <button type="submit" class="btn btn-ghost btn-sm">Log equipment</button>
  `;

  const subs = state.subcontracts || [];
  const subList = document.createElement("div");
  subList.innerHTML = `<h4 class="r2-section-label">Subcontracts</h4>`;
  subList.innerHTML += subs.length
    ? subs
        .map(
          (s) => `
    <div class="proj-phase-row" data-sub-id="${s.id}">
      <strong>${escapeHtml(s.contractorName)}</strong> - ${escapeHtml(s.scope || "")}
      <div>${formatBDT(s.billedAmount || 0)} / ${formatBDT(s.amount || 0)} ${s.performanceRating ? `· ★${s.performanceRating}` : ""} ${statusChip(s.status || "draft")}</div>
      <div class="proj-row-actions">
        <button type="button" class="btn btn-ghost btn-sm sub-edit-btn" data-id="${s.id}">Edit billed</button>
        ${s.status !== "completed" ? `<button type="button" class="btn btn-ghost btn-sm sub-complete-btn" data-id="${s.id}">Mark complete</button>` : ""}
      </div>
    </div>`
        )
        .join("")
    : `<p class="proj-empty">No subcontracts</p>`;

  const eqs = state.equipmentLogs || [];
  const eqList = document.createElement("div");
  eqList.innerHTML = `<h4 class="r2-section-label">Equipment logs</h4>`;
  eqList.innerHTML += eqs.length
    ? eqs
        .map(
          (e) => `
    <div class="proj-phase-row">
      <strong>${escapeHtml(e.equipmentName)}</strong>
      <div>${e.hours || 0} hrs · ${formatBDT(e.cost || 0)} · ${e.logDate || "-"}</div>
    </div>`
        )
        .join("")
    : `<p class="proj-empty">No equipment logs</p>`;

  body.append(subForm, subList, eqForm, eqList);

  subForm.onsubmit = async (e) => {
    e.preventDefault();
    const now = Date.now();
    const billed = Number(subForm.billedAmount.value) || 0;
    const supplierId = subForm.supplierId.value;
    const supplier = (state.suppliers || []).find((s) => s.id === supplierId);
    const contractorName =
      subForm.contractorName.value.trim() || supplier?.name || "";
    if (!contractorName) {
      showToast("Select supplier or enter name", "error");
      return;
    }
    try {
      const id = await create(`subcontracts/${state.selectedProjectId}`, {
        contractorName,
        supplierId: supplierId || "",
        scope: subForm.scope.value.trim(),
        boqId: subForm.boqId.value,
        amount: Number(subForm.amount.value) || 0,
        paymentTermsDays: Number(subForm.paymentTermsDays.value) || 30,
        performanceRating: Number(subForm.performanceRating.value) || 0,
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
      subForm.reset();
      showToast("Subcontract saved");
    } catch (err) {
      showToast(err.message, "error");
    }
  };

  eqForm.onsubmit = async (e) => {
    e.preventDefault();
    const cost = Number(eqForm.cost.value);
    const supplierId = eqForm.supplierId.value;
    const supplier = (state.suppliers || []).find((s) => s.id === supplierId);
    const now = Date.now();
    try {
      const id = await create(`equipmentLogs/${state.selectedProjectId}`, {
        equipmentName: eqForm.equipmentName.value.trim(),
        supplierId: supplierId || "",
        hours: Number(eqForm.hours.value) || 0,
        cost,
        logDate: eqForm.logDate.value,
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
            billDate: eqForm.logDate.value,
            paymentTermsDays: supplier?.paymentTermsDays ?? 30,
            costCategory: "equipment",
            narration: `Equipment ${eqForm.equipmentName.value}`,
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
          narration: `Equipment ${eqForm.equipmentName.value}`,
          refType: "equipmentLog",
          refId: id,
        });
      }
      eqForm.reset();
      showToast("Equipment logged");
    } catch (err) {
      showToast(err.message, "error");
    }
  };

  subList.querySelectorAll(".sub-edit-btn").forEach((btn) => {
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

  subList.querySelectorAll(".sub-complete-btn").forEach((btn) => {
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

  return card;
}

export { checkBudgetForApproval, postProjectExpense };
