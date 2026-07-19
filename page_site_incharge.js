import { listenList, listenProjectSub, create } from "./svc_data.js";
import { showToast } from "./cmp_toast.js";
import { setActiveNav } from "./cmp_layout.js";
import { setPageChrome } from "./cmp_header.js";
import { getRoutePath, getRouteQuery } from "./util_route.js";
import { statusChip } from "./cmp_ui.js";
import { icon } from "./cmp_icons.js";
import { formatBDT, todayISO } from "./util_format.js";
import {
  MATERIAL_PRESETS,
  currentMonthKey,
  monthLabel,
  aggregateMaterialByMonth,
  aggregatePayrollForMonth,
  aggregateGrnByMaterial,
  materialVariance,
  activeAssignmentsForInCharge,
  hasDuplicateMaterialLog,
  findLastMaterialLog,
  buildActivityFeed,
  countLogsInPeriod,
  computeNetPayable,
} from "./util_siteIncharge.js";
import {
  createSiteInChargeWithProject,
  updateSiteInCharge,
  assignSiteInChargeToProject,
  endAssignment,
  createMaterialLog,
  updateMaterialLog,
  deleteMaterialLog,
  approveMaterialLog,
  addRosterEntry,
  updateRosterEntry,
  upsertSettlement,
  buildSettlementDraft,
  postSettlementPayment,
} from "./svc_siteIncharge.js";
import {
  createPayrollEntry,
  calculateSalary,
  confirmSalaryPayment,
  recordAttendanceWithAuthority,
} from "./svc_payroll.js";
import { ATTENDANCE_STATUSES } from "./util_workers.js";
import { PAY_CYCLES, PAYMENT_MODES, computePeriodBounds } from "./util_payroll.js";
import { WEATHER_OPTIONS, laborCountForDate } from "./util_siteDiary.js";
import {
  createSiteDiary,
  submitSiteDiary,
  approveSiteDiary,
} from "./svc_siteDiary.js";
import { renderPhotoGallery } from "./cmp_photoGallery.js";
import { submitMaterialRequest } from "./svc_materialRequest.js";
import { canPerformAction } from "./svc_governance.js";
import { getCurrentUserId } from "./svc_auth.js";
import { rollupSiteLedger, issuedVsUsedVariance, mapProductToInventoryMaterial } from "./util_stockLedger.js";
import {
  renderSiteInchargeKpiRow,
  renderSiteInchargeListItem,
  renderSiteInchargeHeader,
  renderSiteInchargeTabBar,
  sectionCard,
  renderMaterialVarianceTable,
  renderActivityFeed,
  renderSettlementForm,
} from "./cmp_siteInchargeHub.js";

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function parseHashParams() {
  return getRouteQuery();
}

function updateHashParams(patch) {
  const params = getRouteQuery();
  for (const [k, v] of Object.entries(patch)) {
    if (v == null || v === "") params.delete(k);
    else params.set(k, v);
  }
  const qs = params.toString();
  const path = getRoutePath();
  const next = qs ? `${path}?${qs}` : path;
  const current = location.pathname + (location.search || "");
  if (current !== next) history.replaceState(null, "", next);
}

export function mountSiteIncharge(container) {
  setActiveNav();
  setPageChrome({
    title: "Site In-charge",
    subtitle: "Field project managers — material usage, workers, and monthly settlement",
    showDateRange: false,
    quickActionLabel: "",
    onQuickAction: null,
  });

  const root = document.createElement("div");
  root.className = "site-incharge-page suppliers-page dashboard-page";
  container.appendChild(root);

  const hashParams = parseHashParams();

  const state = {
    siteInCharges: [],
    assignments: [],
    projects: [],
    workers: [],
    payrollEntries: [],
    selectedId: hashParams.get("id") || null,
    contextProjectId: hashParams.get("projectId") || "",
    activeTab: hashParams.get("tab") || "overview",
    filterQuery: "",
    filterStatus: "all",
    wizardStep: 1,
    materialLogs: [],
    roster: [],
    settlements: [],
    goodsReceipts: [],
    siteDiaries: [],
    equipmentLogs: [],
    materialRequests: [],
    issueVouchers: [],
    inventoryMaterials: [],
    workerAttendance: [],
    salaryCalculations: [],
    salaryPayments: [],
    payCycle: "monthly",
    boqItems: [],
    filterMonth: currentMonthKey(),
    settlementOverrides: {},
    unsubMaterial: null,
    unsubRoster: null,
    unsubSettlements: null,
    unsubGrn: null,
    unsubDiaries: null,
    unsubEquipment: null,
    unsubMr: null,
    unsubIssueVouchers: null,
    unsubAttendance: null,
    unsubBoq: null,
  };

  root.innerHTML = `
    <div class="sup-layout">
      <div id="sic-kpi-host" class="sup-kpi-host"></div>
      <div class="sup-split">
        <aside class="sup-list-panel card" id="sic-list-panel"></aside>
        <main class="sup-detail-panel" id="sic-detail-panel">
          <p class="proj-empty">Select a site in-charge or create a new one</p>
        </main>
      </div>
    </div>
  `;

  const kpiHost = root.querySelector("#sic-kpi-host");
  const listPanel = root.querySelector("#sic-list-panel");
  const detailPanel = root.querySelector("#sic-detail-panel");

  function selectedInCharge() {
    return state.siteInCharges.find((s) => s.id === state.selectedId) || null;
  }

  function activeAssignmentsForSelected() {
    const sic = selectedInCharge();
    if (!sic) return [];
    return activeAssignmentsForInCharge(state.assignments, sic.id);
  }

  function syncContextProject() {
    const active = activeAssignmentsForSelected();
    if (!active.length) {
      state.contextProjectId = "";
      return;
    }
    if (!active.some((a) => a.projectId === state.contextProjectId)) {
      state.contextProjectId = active[0].projectId;
    }
  }

  function contextProject() {
    if (!state.contextProjectId) return null;
    return (
      state.projects.find((p) => p.id === state.contextProjectId) || {
        id: state.contextProjectId,
        name: activeAssignmentsForSelected().find((a) => a.projectId === state.contextProjectId)?.projectName,
      }
    );
  }

  function bindProjectSubs(projectId) {
    state.unsubMaterial?.();
    state.unsubRoster?.();
    state.unsubSettlements?.();
    state.unsubGrn?.();
    state.unsubDiaries?.();
    state.unsubEquipment?.();
    state.unsubMr?.();
    state.unsubIssueVouchers?.();
    state.unsubAttendance?.();
    state.unsubBoq?.();
    state.materialLogs = [];
    state.roster = [];
    state.settlements = [];
    state.goodsReceipts = [];
    state.siteDiaries = [];
    state.equipmentLogs = [];
    state.materialRequests = [];
    state.issueVouchers = [];
    state.boqItems = [];
    if (!projectId) return;
    state.unsubMaterial = listenProjectSub(projectId, "siteMaterialLogs", (rows) => {
      state.materialLogs = rows;
      renderDetail();
    });
    state.unsubRoster = listenProjectSub(projectId, "projectRoster", (rows) => {
      state.roster = rows;
      renderDetail();
    });
    state.unsubSettlements = listenProjectSub(projectId, "siteSettlements", (rows) => {
      state.settlements = rows;
      renderDetail();
    });
    state.unsubGrn = listenProjectSub(projectId, "goodsReceipts", (rows) => {
      state.goodsReceipts = rows;
      renderDetail();
    });
    state.unsubDiaries = listenProjectSub(projectId, "siteDiaries", (rows) => {
      state.siteDiaries = rows;
      renderDetail();
    });
    state.unsubEquipment = listenProjectSub(projectId, "equipmentLogs", (rows) => {
      state.equipmentLogs = rows;
      renderDetail();
    });
    state.unsubMr = listenProjectSub(projectId, "materialRequests", (rows) => {
      state.materialRequests = rows;
      renderDetail();
    });
    state.unsubIssueVouchers = listenProjectSub(projectId, "issueVouchers", (rows) => {
      state.issueVouchers = rows;
      renderDetail();
    });
    state.unsubBoq = listenProjectSub(projectId, "boqItems", (rows) => {
      state.boqItems = rows;
      renderDetail();
    });
  }

  function onSelectInCharge(id) {
    state.selectedId = id;
    syncContextProject();
    bindProjectSubs(state.contextProjectId || null);
    updateHashParams({ id, projectId: state.contextProjectId, tab: state.activeTab });
    render();
  }

  function onContextChange(projectId) {
    state.contextProjectId = projectId;
    bindProjectSubs(projectId);
    updateHashParams({ projectId, id: state.selectedId, tab: state.activeTab });
    renderDetail();
  }

  function filteredList() {
    let list = [...state.siteInCharges];
    if (state.filterStatus !== "all") list = list.filter((s) => (s.status || "active") === state.filterStatus);
    const q = state.filterQuery.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (s) =>
          (s.name && s.name.toLowerCase().includes(q)) ||
          (s.phone && s.phone.includes(q))
      );
    }
    return list.sort((a, b) => (a.name || "").localeCompare(b.name || ""));
  }

  function selectedContextStats() {
    const sic = selectedInCharge();
    const proj = contextProject();
    const month = state.filterMonth;
    let materialLogsMonth = 0;
    let rosterCount = 0;
    if (sic && proj) {
      materialLogsMonth = state.materialLogs.filter(
        (l) => l.siteInChargeId === sic.id && (l.logDate || "").startsWith(month)
      ).length;
      rosterCount = state.roster.filter(
        (r) => r.siteInChargeId === sic.id && r.status === "active"
      ).length;
    }
    const projName = proj?.name || "";
    return {
      materialLogsMonth,
      rosterCount,
      contextLabel: sic && projName ? `${projName} · ${monthLabel(month)}` : "Select in-charge",
    };
  }

  function pageStats() {
    const ctx = selectedContextStats();
    return {
      total: state.siteInCharges.length,
      active: state.siteInCharges.filter((s) => s.status !== "inactive").length,
      assignedProjects: state.assignments.filter((a) => a.status === "active").length,
      materialLogsMonth: ctx.materialLogsMonth,
      rosterCount: ctx.rosterCount,
      contextLabel: ctx.contextLabel,
    };
  }

  function renderKpi() {
    kpiHost.innerHTML = "";
    kpiHost.appendChild(
      renderSiteInchargeKpiRow(pageStats(), {
        onNew: () => {
          state.selectedId = "__new__";
          state.wizardStep = 1;
          state.activeTab = "overview";
          renderDetail();
        },
      })
    );
  }

  function renderList() {
    const list = filteredList();
    listPanel.innerHTML = `
      <div class="sup-list-toolbar">
        <div class="sup-search-row">
          <span class="sup-search-wrap">
            ${icon("search", { size: 14, className: "icon sup-search-icon" })}
            <input type="search" class="toolbar-input sup-search-input" id="sic-search" placeholder="Search in-charges..." value="${escapeHtml(state.filterQuery)}" />
          </span>
        </div>
        <select class="toolbar-select" id="sic-status-filter">
          <option value="all">Status: All</option>
          <option value="active" ${state.filterStatus === "active" ? "selected" : ""}>Active</option>
          <option value="inactive" ${state.filterStatus === "inactive" ? "selected" : ""}>Inactive</option>
        </select>
      </div>
      <div class="sup-list-items" id="sic-list-items"></div>
    `;
    const itemsEl = listPanel.querySelector("#sic-list-items");
    if (!list.length) {
      itemsEl.innerHTML = `<p class="proj-empty">No site in-charges yet</p>`;
    } else {
      for (const s of list) {
        const active = activeAssignmentsForInCharge(state.assignments, s.id);
        const a = active[0];
        const item = renderSiteInchargeListItem(s, {
          selected: state.selectedId === s.id,
          projectName: a?.projectName || "",
        });
        item.onclick = () => onSelectInCharge(s.id);
        itemsEl.appendChild(item);
      }
    }
    listPanel.querySelector("#sic-search")?.addEventListener("input", (e) => {
      state.filterQuery = e.target.value;
      renderList();
    });
    listPanel.querySelector("#sic-status-filter")?.addEventListener("change", (e) => {
      state.filterStatus = e.target.value;
      renderList();
    });
  }

  function openAssignDialog(sic) {
    const dlg = document.createElement("dialog");
    dlg.className = "modal-dialog";
    const activeProjects = state.projects.filter((p) => p.status !== "completed" && p.status !== "cancelled");
    dlg.innerHTML = `
      <form method="dialog" class="modal-form">
        <h3>Assign project</h3>
        <label>Project<select name="projectId" required>
          <option value="">Select project</option>
          ${activeProjects.map((p) => `<option value="${p.id}">${escapeHtml(p.name)}</option>`).join("")}
        </select></label>
        <label>Start date<input type="date" name="startDate" value="${todayISO()}" /></label>
        <p class="form-hint">One active site in-charge per project. Previous assignment on that project will end.</p>
        <div class="modal-actions">
          <button type="button" class="btn btn-ghost" data-cancel>Cancel</button>
          <button type="submit" class="btn btn-primary">Assign</button>
        </div>
      </form>
    `;
    document.body.appendChild(dlg);
    dlg.showModal();
    dlg.querySelector("[data-cancel]")?.addEventListener("click", () => dlg.close());
    dlg.querySelector("form")?.addEventListener("submit", async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const projectId = fd.get("projectId");
      const project = state.projects.find((p) => p.id === projectId);
      if (!project) {
        showToast("Select a project", "error");
        return;
      }
      try {
        await assignSiteInChargeToProject({
          siteInChargeId: sic.id,
          projectId,
          projectName: project.name,
          startDate: fd.get("startDate") || todayISO(),
        });
        state.contextProjectId = projectId;
        bindProjectSubs(projectId);
        showToast("Project assigned — previous in-charge on this project was ended");
        dlg.close();
        render();
      } catch (err) {
        showToast(err.message, "error");
      }
    });
    dlg.addEventListener("close", () => dlg.remove());
  }

  function openEditDialog(sic) {
    const dlg = document.createElement("dialog");
    dlg.className = "modal-dialog";
    dlg.innerHTML = `
      <form method="dialog" class="modal-form">
        <h3>Edit site in-charge</h3>
        <label>Name<input name="name" required value="${escapeHtml(sic.name)}" /></label>
        <label>Phone<input name="phone" value="${escapeHtml(sic.phone || "")}" /></label>
        <label>NID<input name="nid" value="${escapeHtml(sic.nid || "")}" /></label>
        <label>Monthly rate (BDT)<input type="number" name="monthlyRate" min="0" value="${sic.monthlyRate || ""}" /></label>
        <label>Status<select name="status">
          <option value="active" ${sic.status !== "inactive" ? "selected" : ""}>Active</option>
          <option value="inactive" ${sic.status === "inactive" ? "selected" : ""}>Inactive</option>
        </select></label>
        <label>Address<textarea name="address" rows="2">${escapeHtml(sic.address || "")}</textarea></label>
        <label>Notes<textarea name="notes" rows="2">${escapeHtml(sic.notes || "")}</textarea></label>
        <div class="modal-actions">
          <button type="button" class="btn btn-ghost" data-cancel>Cancel</button>
          <button type="submit" class="btn btn-primary">Save</button>
        </div>
      </form>
    `;
    document.body.appendChild(dlg);
    dlg.showModal();
    dlg.querySelector("[data-cancel]")?.addEventListener("click", () => dlg.close());
    dlg.querySelector("form")?.addEventListener("submit", async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      try {
        const newStatus = fd.get("status");
        await updateSiteInCharge(sic.id, {
          name: fd.get("name"),
          phone: fd.get("phone"),
          nid: fd.get("nid"),
          monthlyRate: Number(fd.get("monthlyRate")) || 0,
          status: newStatus,
          address: fd.get("address"),
          notes: fd.get("notes"),
        });
        if (newStatus === "inactive") {
          const active = activeAssignmentsForInCharge(state.assignments, sic.id);
          for (const a of active) {
            await endAssignment(a.id);
          }
          state.contextProjectId = "";
          bindProjectSubs(null);
        }
        showToast("Saved");
        dlg.close();
        render();
      } catch (err) {
        showToast(err.message, "error");
      }
    });
    dlg.addEventListener("close", () => dlg.remove());
  }

  function openMaterialEditDialog(sic, proj, log) {
    const dlg = document.createElement("dialog");
    dlg.className = "modal-dialog modal-dialog--wide";
    const presetRows = MATERIAL_PRESETS.map((p) => {
      const item = (log.items || []).find((i) => i.materialKey === p.materialKey);
      return `
        <div class="sic-mat-row sic-mat-row--usage">
          <label class="sic-mat-label">${escapeHtml(p.label)}</label>
          <input type="number" min="0" step="any" class="toolbar-input sic-mat-used" data-key="${p.materialKey}" data-unit="${p.unit}" value="${item?.usedQty ?? item?.qty ?? ""}" placeholder="Used" />
          <input type="number" min="0" step="any" class="toolbar-input sic-mat-wasted" data-key="${p.materialKey}" value="${item?.wastedQty || ""}" placeholder="Wasted" />
          <input type="text" class="toolbar-input sic-mat-waste-reason" data-key="${p.materialKey}" value="${escapeHtml(item?.wasteReason || "")}" placeholder="Waste reason" />
          <input type="text" class="toolbar-input sic-mat-used-for" data-key="${p.materialKey}" value="${escapeHtml(item?.usedFor || "")}" placeholder="Used for" />
          <span class="sic-mat-unit">${escapeHtml(p.unit)}</span>
        </div>`;
    }).join("");
    dlg.innerHTML = `
      <form method="dialog" class="modal-form">
        <h3>Edit material log</h3>
        <label>Date<input type="date" name="logDate" value="${escapeHtml(log.logDate)}" required /></label>
        <div class="sic-mat-grid">${presetRows}</div>
        <label>Remarks<textarea name="remarks" rows="2">${escapeHtml(log.remarks || "")}</textarea></label>
        <div class="modal-actions">
          <button type="button" class="btn btn-ghost" data-cancel>Cancel</button>
          <button type="submit" class="btn btn-primary">Save</button>
        </div>
      </form>
    `;
    document.body.appendChild(dlg);
    dlg.showModal();
    dlg.querySelector("[data-cancel]")?.addEventListener("click", () => dlg.close());
    dlg.querySelector("form")?.addEventListener("submit", async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const logDate = fd.get("logDate");
      if (
        hasDuplicateMaterialLog(state.materialLogs, {
          siteInChargeId: sic.id,
          logDate,
          excludeId: log.id,
        })
      ) {
        showToast("Another log exists for this date", "error");
        return;
      }
      const items = [];
      dlg.querySelectorAll(".sic-mat-row").forEach((row) => {
        const materialKey = row.querySelector(".sic-mat-used")?.dataset.key;
        const preset = MATERIAL_PRESETS.find((p) => p.materialKey === materialKey);
        const usedQty = Number(row.querySelector(".sic-mat-used")?.value) || 0;
        const wastedQty = Number(row.querySelector(".sic-mat-wasted")?.value) || 0;
        if (!usedQty && !wastedQty) return;
        items.push({
          materialKey,
          inventoryMaterialId: presetInventoryId(preset || { materialKey, label: materialKey }),
          label: preset?.label || materialKey,
          unit: preset?.unit || "unit",
          usedQty,
          wastedQty,
          wasteReason: String(row.querySelector(".sic-mat-waste-reason")?.value || "").trim(),
          usedFor: String(row.querySelector(".sic-mat-used-for")?.value || "").trim(),
          qty: usedQty + wastedQty,
        });
      });
      if (!items.length) {
        showToast("Enter at least one quantity", "error");
        return;
      }
      try {
        await updateMaterialLog(proj.id, log.id, {
          logDate,
          items,
          remarks: fd.get("remarks"),
        });
        showToast("Log updated");
        dlg.close();
      } catch (err) {
        showToast(err.message, "error");
      }
    });
    dlg.addEventListener("close", () => dlg.remove());
  }

  function renderWizard() {
    const step = state.wizardStep;
    detailPanel.innerHTML = `
      <div class="card sic-wizard">
        <h2 class="sic-wizard-title">New Site In-charge</h2>
        <p class="sic-wizard-sub">Field PM — material, labor, and site accountability</p>
        <div class="sic-wizard-steps">
          <span class="${step >= 1 ? "is-active" : ""}">1. Profile</span>
          <span class="${step >= 2 ? "is-active" : ""}">2. Project</span>
          <span class="${step >= 3 ? "is-active" : ""}">3. Confirm</span>
        </div>
        <form id="sic-wizard-form" class="sic-wizard-form"></form>
      </div>
    `;
    const form = detailPanel.querySelector("#sic-wizard-form");
    const draft = state._wizardDraft || {};
    const activeProjects = state.projects.filter((p) => p.status !== "completed" && p.status !== "cancelled");

    if (step === 1) {
      form.innerHTML = `
        <label>Name<input name="name" required value="${escapeHtml(draft.name || "")}" /></label>
        <label>Phone<input name="phone" value="${escapeHtml(draft.phone || "")}" /></label>
        <label>NID<input name="nid" value="${escapeHtml(draft.nid || "")}" /></label>
        <label>Address<textarea name="address" rows="2">${escapeHtml(draft.address || "")}</textarea></label>
        <label>Monthly rate (optional)<input type="number" name="monthlyRate" min="0" value="${draft.monthlyRate || ""}" /></label>
        <button type="submit" class="btn btn-primary">Next: Assign project</button>
      `;
      form.onsubmit = (e) => {
        e.preventDefault();
        const fd = new FormData(form);
        state._wizardDraft = {
          ...draft,
          name: fd.get("name"),
          phone: fd.get("phone"),
          nid: fd.get("nid"),
          address: fd.get("address"),
          monthlyRate: fd.get("monthlyRate"),
        };
        state.wizardStep = 2;
        renderWizard();
      };
    } else if (step === 2) {
      form.innerHTML = `
        <label>Assign to project<select name="projectId">
          <option value="">— None (assign later) —</option>
          ${activeProjects.map((p) => `<option value="${p.id}" ${draft.projectId === p.id ? "selected" : ""}>${escapeHtml(p.name)}</option>`).join("")}
        </select></label>
        <label>Start date<input type="date" name="startDate" value="${draft.startDate || todayISO()}" /></label>
        <div class="sic-wizard-nav">
          <button type="button" class="btn btn-ghost" id="sic-wiz-back">Back</button>
          <button type="submit" class="btn btn-primary">Next: Confirm</button>
        </div>
      `;
      form.querySelector("#sic-wiz-back")?.addEventListener("click", () => {
        state.wizardStep = 1;
        renderWizard();
      });
      form.onsubmit = (e) => {
        e.preventDefault();
        const fd = new FormData(form);
        state._wizardDraft = { ...state._wizardDraft, projectId: fd.get("projectId"), startDate: fd.get("startDate") };
        state.wizardStep = 3;
        renderWizard();
      };
    } else {
      const d = state._wizardDraft || {};
      const proj = state.projects.find((p) => p.id === d.projectId);
      form.innerHTML = `
        <div class="sic-confirm-box">
          <p><strong>${escapeHtml(d.name)}</strong> will be created as site in-charge.</p>
          ${proj ? `<p>Project <strong>${escapeHtml(proj.name)}</strong> — material + labor accountability transfers to this person.</p>` : "<p>No project assigned yet. You can assign from Overview.</p>"}
        </div>
        <div class="sic-wizard-nav">
          <button type="button" class="btn btn-ghost" id="sic-wiz-back">Back</button>
          <button type="submit" class="btn btn-primary">Create Site In-charge</button>
        </div>
      `;
      form.querySelector("#sic-wiz-back")?.addEventListener("click", () => {
        state.wizardStep = 2;
        renderWizard();
      });
      form.onsubmit = async (e) => {
        e.preventDefault();
        try {
          const proj = state.projects.find((p) => p.id === d.projectId);
          const id = await createSiteInChargeWithProject(
            {
              name: d.name,
              phone: d.phone,
              address: d.address,
              nid: d.nid,
              monthlyRate: Number(d.monthlyRate) || 0,
              startDate: d.startDate,
            },
            d.projectId || "",
            proj?.name || ""
          );
          state.selectedId = id;
          state.contextProjectId = d.projectId || "";
          state._wizardDraft = null;
          state.wizardStep = 1;
          if (d.projectId) bindProjectSubs(d.projectId);
          showToast("Site in-charge created");
          render();
        } catch (err) {
          showToast(err.message, "error");
        }
      };
    }
  }

  function getSettlementDraft(sic, proj) {
    const month = state.filterMonth;
    const key = `${sic.id}-${proj.id}-${month}`;
    const overrides = state.settlementOverrides[key] || {};
    const existing = state.settlements.find((s) => s.month === month && s.siteInChargeId === sic.id);
    const base = buildSettlementDraft({
      siteInCharge: sic,
      siteInChargeId: sic.id,
      projectId: proj.id,
      materialLogs: state.materialLogs,
      payrollEntries: state.payrollEntries,
      monthKey: month,
      advancePaid: existing?.advancePaid ?? overrides.advancePaid ?? 0,
      deductions: existing?.deductions ?? overrides.deductions ?? 0,
    });
    if (existing) {
      return {
        ...base,
        ...existing,
        monthlyRate: existing.monthlyRate ?? base.monthlyRate,
        advancePaid: existing.advancePaid ?? base.advancePaid,
        deductions: existing.deductions ?? base.deductions,
      };
    }
    return {
      ...base,
      monthlyRate: overrides.monthlyRate ?? base.monthlyRate,
      advancePaid: overrides.advancePaid ?? base.advancePaid,
      deductions: overrides.deductions ?? base.deductions,
      netPayable: computeNetPayable({
        monthlyRate: overrides.monthlyRate ?? base.monthlyRate,
        laborTotal: base.laborTotal,
        advancePaid: overrides.advancePaid ?? base.advancePaid,
        deductions: overrides.deductions ?? base.deductions,
      }),
    };
  }

  function renderOverviewTab(sic, proj, assignments) {
    const host = document.createElement("div");
    host.className = "sic-tab-content";
    const month = state.filterMonth;
    const active = activeAssignmentsForInCharge(assignments, sic.id);
    const existingSettlement = proj
      ? state.settlements.find((s) => s.month === month && s.siteInChargeId === sic.id)
      : null;

    host.innerHTML = `
      <div class="sic-month-bar">
        <label>Month <input type="month" id="sic-overview-month" value="${month}" /></label>
        ${existingSettlement ? `<span>Settlement: ${statusChip(existingSettlement.status)}</span>` : "<span>Settlement: not saved</span>"}
      </div>
    `;
    host.querySelector("#sic-overview-month")?.addEventListener("change", (e) => {
      state.filterMonth = e.target.value;
      renderDetail();
    });

    const cards =
      active.length === 0
        ? `<p class="proj-empty">No active project. Use Assign project to link.</p>`
        : active
            .map(
              (a) => `
        <div class="sic-project-card card">
          <strong>${escapeHtml(a.projectName || a.projectId)}</strong>
          <span>Since ${escapeHtml(a.startDate || "—")}</span>
          <button type="button" class="btn btn-ghost btn-sm" data-switch-project="${escapeHtml(a.projectId)}">Use as context</button>
          <a href="/projects?id=${encodeURIComponent(a.projectId)}" class="btn btn-ghost btn-sm">Open project</a>
        </div>`
            )
            .join("");
    host.appendChild(sectionCard("Assigned projects", cards));
    host.querySelectorAll("[data-switch-project]").forEach((btn) => {
      btn.addEventListener("click", () => onContextChange(btn.dataset.switchProject));
    });

    const mat = aggregateMaterialByMonth(state.materialLogs, month, { siteInChargeId: sic.id });
    const matHtml =
      mat.length === 0
        ? '<p class="proj-empty">No material logged this month</p>'
        : `<table class="data-table"><thead><tr><th>Material</th><th>Qty</th><th>Unit</th></tr></thead><tbody>${mat
            .map(
              (m) =>
                `<tr><td>${escapeHtml(m.label)}</td><td>${m.totalQty}</td><td>${escapeHtml(m.unit)}</td></tr>`
            )
            .join("")}</tbody></table>`;
    host.appendChild(sectionCard(`Material summary — ${monthLabel(month)}`, matHtml));

    if (proj) {
      const varianceRows = issuedVsUsedVariance(siteLedgerForProject(proj.id)).map((r) => ({
        label: r.materialName,
        issued: r.qtyIssued,
        used: r.qtyUsed + r.qtyWasted,
        variance: r.variance,
      }));
      host.appendChild(
        sectionCard("Issued vs used variance", renderMaterialVarianceTable(varianceRows))
      );
      const logTotals = aggregateMaterialByMonth(state.materialLogs, month, { siteInChargeId: sic.id });
      const grnTotals = aggregateGrnByMaterial(state.goodsReceipts, month);
      host.appendChild(
        sectionCard("GRN vs logged (procurement)", renderMaterialVarianceTable(materialVariance(logTotals, grnTotals)))
      );
    }

    const activity = buildActivityFeed(state.materialLogs, state.payrollEntries, {
      siteInChargeId: sic.id,
      projectId: proj?.id,
      limit: 5,
    });
    host.appendChild(sectionCard("Recent activity", renderActivityFeed(activity)));

    if (proj) {
      host.appendChild(
        sectionCard(
          "Quick actions",
          `<button type="button" class="btn btn-primary btn-sm" id="sic-go-material">Log material</button>
           <button type="button" class="btn btn-ghost btn-sm" id="sic-go-roster">Manage roster</button>
           <button type="button" class="btn btn-ghost btn-sm" id="sic-go-settlement">Settlement</button>`
        )
      );
      host.querySelector("#sic-go-material")?.addEventListener("click", () => {
        state.activeTab = "material";
        updateHashParams({ tab: "material" });
        renderDetail();
      });
      host.querySelector("#sic-go-roster")?.addEventListener("click", () => {
        state.activeTab = "roster";
        updateHashParams({ tab: "roster" });
        renderDetail();
      });
      host.querySelector("#sic-go-settlement")?.addEventListener("click", () => {
        state.activeTab = "settlement";
        updateHashParams({ tab: "settlement" });
        renderDetail();
      });
    }
    return host;
  }

  function presetInventoryId(preset) {
    const mat = mapProductToInventoryMaterial(preset.label, state.inventoryMaterials);
    return mat?.id || preset.materialKey;
  }

  function siteLedgerForProject(projId) {
    return rollupSiteLedger(projId, state.issueVouchers, state.materialLogs);
  }

  function renderSiteBalanceStrip(projId) {
    const rows = siteLedgerForProject(projId).filter((r) => r.qtyIssued > 0 || r.qtyUsed > 0);
    if (!rows.length) return `<p class="site-balance-strip text-muted">No issued materials on site yet — request from central stock first.</p>`;
    return `<div class="site-balance-strip"><strong>Site stock balance</strong><table class="data-table"><thead><tr><th>Material</th><th>Issued</th><th>Used</th><th>Wasted</th><th>Balance</th></tr></thead><tbody>${rows
      .map(
        (r) => `<tr><td>${escapeHtml(r.materialName)}</td><td>${r.qtyIssued}</td><td>${r.qtyUsed}</td><td>${r.qtyWasted}</td><td><strong>${r.balance}</strong></td></tr>`
      )
      .join("")}</tbody></table></div>`;
  }

  function collectMatItemsFromForm(host) {
    const items = [];
    host.querySelectorAll(".sic-mat-row").forEach((row) => {
      const keyInp = row.querySelector(".sic-mat-used");
      if (!keyInp) return;
      const materialKey = keyInp.dataset.key;
      const preset = MATERIAL_PRESETS.find((p) => p.materialKey === materialKey);
      const usedQty = Number(row.querySelector(".sic-mat-used")?.value) || 0;
      const wastedQty = Number(row.querySelector(".sic-mat-wasted")?.value) || 0;
      if (!usedQty && !wastedQty) return;
      items.push({
        materialKey,
        inventoryMaterialId: presetInventoryId(preset || { materialKey, label: materialKey }),
        label: preset?.label || materialKey,
        unit: preset?.unit || "unit",
        usedQty,
        wastedQty,
        wasteReason: String(row.querySelector(".sic-mat-waste-reason")?.value || "").trim(),
        usedFor: String(row.querySelector(".sic-mat-used-for")?.value || "").trim(),
        qty: usedQty + wastedQty,
      });
    });
    return items;
  }

  function renderMaterialTab(sic, proj) {
    const host = document.createElement("div");
    host.className = "sic-tab-content";
    if (!proj) {
      host.innerHTML = `<p class="proj-empty">Select a project context to log materials.</p>`;
      return host;
    }
    const logs = state.materialLogs
      .filter((l) => l.siteInChargeId === sic.id)
      .sort((a, b) => (b.logDate || "").localeCompare(a.logDate || ""));

    const lastLog = findLastMaterialLog(state.materialLogs, sic.id);

    const presetRows = MATERIAL_PRESETS.map(
      (p) => `
      <div class="sic-mat-row sic-mat-row--usage">
        <label class="sic-mat-label">${escapeHtml(p.label)}</label>
        <input type="number" min="0" step="any" class="toolbar-input sic-mat-used" data-key="${p.materialKey}" data-unit="${p.unit}" placeholder="Used" />
        <input type="number" min="0" step="any" class="toolbar-input sic-mat-wasted" data-key="${p.materialKey}" placeholder="Wasted" />
        <input type="text" class="toolbar-input sic-mat-waste-reason" data-key="${p.materialKey}" placeholder="Waste reason" />
        <input type="text" class="toolbar-input sic-mat-used-for" data-key="${p.materialKey}" placeholder="Used for" />
        <span class="sic-mat-unit">${escapeHtml(p.unit)}</span>
      </div>`
    ).join("");

    host.appendChild(sectionCard("Site stock balance", renderSiteBalanceStrip(proj.id)));

    const formCard = sectionCard(
      "Daily usage log",
      `<form id="sic-mat-form" class="sic-mat-form">
        <label>Date<input type="date" name="logDate" value="${todayISO()}" required /></label>
        <div class="sic-mat-actions">
          <button type="button" class="btn btn-ghost btn-sm" id="sic-copy-yesterday" ${lastLog ? "" : "disabled"}>Copy last log</button>
        </div>
        <div class="sic-mat-grid">${presetRows}</div>
        <label>Remarks<textarea name="remarks" rows="2"></textarea></label>
        <button type="submit" class="btn btn-primary">Save usage log</button>
      </form>`
    );
    host.appendChild(formCard);

    const history =
      logs.length === 0
        ? `<p class="proj-empty">No logs yet</p>`
        : `<table class="data-table"><thead><tr><th>Date</th><th>Items</th><th>Status</th><th></th></tr></thead><tbody>${logs
            .map((l) => {
              const items = (l.items || [])
                .map(
                  (i) =>
                    `${escapeHtml(i.label || i.materialKey)}: used ${i.usedQty ?? i.qty} wasted ${i.wastedQty || 0} ${escapeHtml(i.unit || "")}`
                )
                .join("; ");
              const canApprove = l.status === "submitted";
              return `<tr data-log-id="${l.id}">
                <td>${escapeHtml(l.logDate)}</td>
                <td>${items || "—"}</td>
                <td>${statusChip(l.status || "submitted")}</td>
                <td class="sic-row-actions">
                  <button type="button" class="btn btn-ghost btn-sm" data-edit-log="${l.id}">Edit</button>
                  <button type="button" class="btn btn-ghost btn-sm" data-del-log="${l.id}">Delete</button>
                  ${canApprove ? `<button type="button" class="btn btn-primary btn-sm" data-approve-log="${l.id}">Approve</button>` : ""}
                </td>
              </tr>`;
            })
            .join("")}</tbody></table>`;

    host.appendChild(sectionCard("History", history));

    host.querySelector("#sic-copy-yesterday")?.addEventListener("click", () => {
      if (!lastLog?.items?.length) return;
      for (const item of lastLog.items) {
        const row = host.querySelector(`.sic-mat-used[data-key="${item.materialKey}"]`)?.closest(".sic-mat-row");
        if (!row) continue;
        row.querySelector(".sic-mat-used").value = item.usedQty ?? item.qty ?? "";
        row.querySelector(".sic-mat-wasted").value = item.wastedQty || "";
        row.querySelector(".sic-mat-waste-reason").value = item.wasteReason || "";
        row.querySelector(".sic-mat-used-for").value = item.usedFor || "";
      }
      showToast("Copied from last log");
    });

    host.querySelector("#sic-mat-form")?.addEventListener("submit", async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const logDate = fd.get("logDate");
      if (hasDuplicateMaterialLog(state.materialLogs, { siteInChargeId: sic.id, logDate })) {
        showToast("A log already exists for this date", "error");
        return;
      }
      const items = collectMatItemsFromForm(host);
      if (!items.length) {
        showToast("Enter at least one quantity", "error");
        return;
      }
      try {
        await createMaterialLog(proj.id, {
          siteInChargeId: sic.id,
          logDate,
          items,
          remarks: fd.get("remarks"),
          status: "submitted",
        });
        e.target.reset();
        host.querySelector('[name="logDate"]').value = todayISO();
        showToast("Material log saved");
      } catch (err) {
        showToast(err.message, "error");
      }
    });

    host.querySelectorAll("[data-edit-log]").forEach((btn) => {
      const log = logs.find((l) => l.id === btn.dataset.editLog);
      if (log) btn.addEventListener("click", () => openMaterialEditDialog(sic, proj, log));
    });
    host.querySelectorAll("[data-del-log]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        if (!confirm("Delete this material log?")) return;
        try {
          await deleteMaterialLog(proj.id, btn.dataset.delLog);
          showToast("Log deleted");
        } catch (err) {
          showToast(err.message, "error");
        }
      });
    });
    host.querySelectorAll("[data-approve-log]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        try {
          await approveMaterialLog(proj.id, btn.dataset.approveLog);
          showToast("Log approved");
        } catch (err) {
          showToast(err.message, "error");
        }
      });
    });
    return host;
  }

  function renderDiaryTab(sic, proj) {
    const host = document.createElement("div");
    host.className = "sic-tab-content";
    if (!proj) {
      host.innerHTML = `<p class="proj-empty">Select a project context to manage daily diaries.</p>`;
      return host;
    }

    const diaries = state.siteDiaries
      .filter((d) => d.siteInChargeId === sic.id)
      .sort((a, b) => (b.logDate || "").localeCompare(a.logDate || ""));

    const weatherOpts = WEATHER_OPTIONS.map(
      (w) => `<option value="${escapeHtml(w)}">${escapeHtml(w)}</option>`
    ).join("");
    const defaultLabor = laborCountForDate(proj.id, todayISO(), {
      roster: state.roster.filter((r) => r.siteInChargeId === sic.id),
      attendance: state.workerAttendance,
    });

    const formCard = sectionCard(
      "Today's diary",
      `<form id="sic-diary-form" class="sic-diary-form">
        <label>Date<input type="date" name="logDate" value="${todayISO()}" required /></label>
        <label>Weather<select name="weather"><option value="">—</option>${weatherOpts}</select></label>
        <label>Labor count<input type="number" name="laborCount" min="0" value="${defaultLabor}" /></label>
        <label>Work summary<textarea name="workSummary" rows="4" required placeholder="Activities completed today…"></textarea></label>
        <div id="sic-diary-photos"></div>
        <button type="submit" class="btn btn-primary">Save draft</button>
      </form>`
    );
    host.appendChild(formCard);

    let draftPhotos = [];
    const gallery = renderPhotoGallery([], {
      onChange: (photos) => {
        draftPhotos = photos;
      },
    });
    formCard.querySelector("#sic-diary-photos")?.appendChild(gallery);

    const updateLaborHint = () => {
      const dateVal = formCard.querySelector('[name="logDate"]')?.value || todayISO();
      const count = laborCountForDate(proj.id, dateVal, {
        roster: state.roster.filter((r) => r.siteInChargeId === sic.id),
        attendance: state.workerAttendance,
      });
      const inp = formCard.querySelector('[name="laborCount"]');
      if (inp && !inp.dataset.userEdited) inp.value = count;
    };
    formCard.querySelector('[name="logDate"]')?.addEventListener("change", updateLaborHint);
    formCard.querySelector('[name="laborCount"]')?.addEventListener("input", (e) => {
      e.target.dataset.userEdited = "1";
    });

    formCard.querySelector("#sic-diary-form")?.addEventListener("submit", async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      try {
        await createSiteDiary(proj.id, {
          siteInChargeId: sic.id,
          logDate: fd.get("logDate"),
          weather: fd.get("weather"),
          laborCount: Number(fd.get("laborCount")) || 0,
          workSummary: String(fd.get("workSummary") || "").trim(),
          photos: draftPhotos,
          status: "draft",
        });
        e.target.reset();
        formCard.querySelector('[name="logDate"]').value = todayISO();
        draftPhotos = [];
        gallery.setPhotos([]);
        delete formCard.querySelector('[name="laborCount"]')?.dataset.userEdited;
        updateLaborHint();
        showToast("Diary saved as draft");
      } catch (err) {
        showToast(err.message, "error");
      }
    });

    const history =
      diaries.length === 0
        ? `<p class="proj-empty">No diaries yet</p>`
        : `<table class="data-table"><thead><tr><th>Date</th><th>Weather</th><th>Labor</th><th>Summary</th><th>Status</th><th></th></tr></thead><tbody>${diaries
            .map((d) => {
              const summary = escapeHtml(String(d.workSummary || "").slice(0, 60));
              const canSubmit = d.status === "draft" && canPerformAction("submit_site_diary");
              const canApprove = d.status === "submitted" && canPerformAction("approve_site_diary");
              return `<tr>
                <td>${escapeHtml(d.logDate)}</td>
                <td>${escapeHtml(d.weather || "—")}</td>
                <td>${d.laborCount ?? "—"}</td>
                <td>${summary}${(d.workSummary || "").length > 60 ? "…" : ""}</td>
                <td>${statusChip(d.status || "draft")}</td>
                <td class="sic-row-actions">
                  ${canSubmit ? `<button type="button" class="btn btn-primary btn-sm" data-submit-diary="${d.id}">Submit</button>` : ""}
                  ${canApprove ? `<button type="button" class="btn btn-primary btn-sm" data-approve-diary="${d.id}">Approve</button>` : ""}
                </td>
              </tr>`;
            })
            .join("")}</tbody></table>`;
    host.appendChild(sectionCard("Diary history", history));

    host.querySelectorAll("[data-submit-diary]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        try {
          await submitSiteDiary(proj.id, btn.dataset.submitDiary);
          showToast("Diary submitted");
        } catch (err) {
          showToast(err.message, "error");
        }
      });
    });
    host.querySelectorAll("[data-approve-diary]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        try {
          await approveSiteDiary(proj.id, btn.dataset.approveDiary);
          showToast("Diary approved — progress updated");
        } catch (err) {
          showToast(err.message, "error");
        }
      });
    });
    return host;
  }

  function renderEquipmentTab(sic, proj) {
    const host = document.createElement("div");
    host.className = "sic-tab-content";
    if (!proj) {
      host.innerHTML = `<p class="proj-empty">Select a project context to log equipment.</p>`;
      return host;
    }

    const logs = state.equipmentLogs
      .filter((e) => e.siteInChargeId === sic.id)
      .sort((a, b) => (b.logDate || "").localeCompare(a.logDate || ""));

    host.appendChild(
      sectionCard(
        "Log equipment",
        `<form id="sic-equip-form" class="form-grid proj-form-inline">
          <input name="equipmentName" placeholder="Equipment name *" required />
          <input name="hours" type="number" min="0" step="0.5" placeholder="Hours" />
          <input name="logDate" type="date" value="${todayISO()}" />
          <button type="submit" class="btn btn-primary btn-sm">Log</button>
        </form>`
      )
    );

    host.querySelector("#sic-equip-form")?.addEventListener("submit", async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      try {
        await create(`equipmentLogs/${proj.id}`, {
          equipmentName: String(fd.get("equipmentName") || "").trim(),
          hours: Number(fd.get("hours")) || 0,
          logDate: fd.get("logDate") || todayISO(),
          siteInChargeId: sic.id,
          cost: 0,
          projectId: proj.id,
          createdAt: Date.now(),
          updatedAt: Date.now(),
          createdBy: getCurrentUserId?.() || "",
        });
        e.target.reset();
        e.target.querySelector('[name="logDate"]').value = todayISO();
        showToast("Equipment logged");
      } catch (err) {
        showToast(err.message, "error");
      }
    });

    const table =
      logs.length === 0
        ? `<p class="proj-empty">No equipment logs</p>`
        : `<table class="data-table"><thead><tr><th>Date</th><th>Equipment</th><th>Hours</th></tr></thead><tbody>${logs
            .map(
              (e) => `<tr>
              <td>${escapeHtml(e.logDate || "—")}</td>
              <td>${escapeHtml(e.equipmentName)}</td>
              <td>${e.hours ?? 0}</td>
            </tr>`
            )
            .join("")}</tbody></table>`;
    host.appendChild(sectionCard("Recent logs", table));
    return host;
  }

  function renderRequestsTab(sic, proj) {
    const host = document.createElement("div");
    host.className = "sic-tab-content";
    if (!proj) {
      host.innerHTML = `<p class="proj-empty">Select a project context to submit material requests.</p>`;
      return host;
    }

    const mrs = state.materialRequests.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    const matOpts = state.inventoryMaterials
      .map((m) => `<option value="${m.id}">${escapeHtml(m.name)} (${escapeHtml(m.unit || "")})</option>`)
      .join("");
    const canSubmitMr = canPerformAction("submit_material_request");

    host.appendChild(
      sectionCard(
        "Central stock requisition",
        canSubmitMr
          ? `<form id="sic-mr-form" class="form-grid proj-form-inline">
          <input name="title" placeholder="Requisition title *" required />
          <select name="inventoryMaterialId" required><option value="">Stock item *</option>${matOpts}</select>
          <input name="qty" type="number" placeholder="Qty *" required min="1" />
          <input name="purpose" placeholder="Purpose / task" />
          <button type="submit" class="btn btn-primary btn-sm">Submit to central store</button>
        </form>
        <p class="text-muted sic-mr-hint">After approval, store manager issues voucher from <a href="/inventory">Inventory → Issue Vouchers</a>.</p>`
          : `<p class="proj-empty">You do not have permission to submit material requests.</p>`
      )
    );

    host.querySelector("#sic-mr-form")?.addEventListener("submit", async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      try {
        const id = await create(`materialRequests/${proj.id}`, {
          title: String(fd.get("title") || "").trim(),
          requestType: "central",
          inventoryMaterialId: fd.get("inventoryMaterialId"),
          qty: Number(fd.get("qty")) || 0,
          purpose: String(fd.get("purpose") || "").trim(),
          amount: 0,
          status: "draft",
          deliveryStatus: "requested",
          siteInChargeId: sic.id,
          costCategory: "material",
          projectId: proj.id,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        });
        await submitMaterialRequest(proj.id, id);
        e.target.reset();
        showToast("Central requisition submitted");
      } catch (err) {
        showToast(err.message, "error");
      }
    });

    const table =
      mrs.length === 0
        ? `<p class="proj-empty">No material requests</p>`
        : `<table class="data-table"><thead><tr><th>Title</th><th>Type</th><th>Qty</th><th>Status</th><th>Voucher</th></tr></thead><tbody>${mrs
            .map((m) => {
              const isCentral = m.requestType === "central";
              const voucher = isCentral && m.issueVoucherId ? state.issueVouchers.find((v) => v.id === m.issueVoucherId) : null;
              return `<tr>
              <td>${escapeHtml(m.title)}</td>
              <td>${isCentral ? "Central" : "Supplier"}</td>
              <td>${m.qty || "—"}</td>
              <td>${statusChip(m.status)}</td>
              <td>${voucher ? escapeHtml(voucher.voucherNo) : isCentral ? "Pending issue" : `<a href="/purchases">Purchases</a>`}</td>
            </tr>`;
            })
            .join("")}</tbody></table>`;
    host.appendChild(sectionCard("Requests", table));
    return host;
  }

  function renderRosterTab(sic, proj) {
    const host = document.createElement("div");
    host.className = "sic-tab-content";
    if (!proj) {
      host.innerHTML = `<p class="proj-empty">Select a project context to manage roster.</p>`;
      return host;
    }
    const activeRoster = state.roster.filter((r) => r.siteInChargeId === sic.id && r.status === "active");
    const leftRoster = state.roster.filter((r) => r.siteInChargeId === sic.id && r.status === "left");
    const activeWorkerIds = new Set(activeRoster.map((r) => r.workerId).filter(Boolean));

    const workerOpts = state.workers
      .filter((w) => w.status !== "inactive" && !activeWorkerIds.has(w.id))
      .map((w) => `<option value="${w.id}">${escapeHtml(w.name)} (${escapeHtml(w.trade || "")})</option>`)
      .join("");

    host.appendChild(
      sectionCard(
        "Add to roster",
        `<form id="sic-roster-form" class="sic-roster-form">
          <label>Worker<select name="workerId"><option value="">Quick name below</option>${workerOpts}</select></label>
          <label>Or name<input name="workerName" placeholder="If not in master list" /></label>
          <label>Trade<input name="trade" /></label>
          <label>Daily wage<input type="number" name="dailyWage" min="0" /></label>
          <button type="submit" class="btn btn-primary">Add worker</button>
        </form>`
      )
    );

    const attDate = todayISO();
    const statusOpts = ATTENDANCE_STATUSES.filter((s) => s.id !== "leave")
      .map((s) => `<option value="${s.id}">${escapeHtml(s.label)}</option>`)
      .join("");

    const activeTable =
      activeRoster.length === 0
        ? `<p class="proj-empty">No workers on roster</p>`
        : `<table class="data-table"><thead><tr><th>Name</th><th>Trade</th><th>Wage</th><th>Joined</th><th></th></tr></thead><tbody>${activeRoster
            .map(
              (r) => `<tr>
              <td>${escapeHtml(r.workerName)}</td>
              <td>${escapeHtml(r.trade || "—")}</td>
              <td>${formatBDT(r.dailyWage)}</td>
              <td>${escapeHtml(r.joinedDate || "—")}</td>
              <td><button type="button" class="btn btn-ghost btn-sm" data-leave="${r.id}">Mark left</button></td>
            </tr>`
            )
            .join("")}</tbody></table>`;
    host.appendChild(sectionCard("Active roster", activeTable));

    const attCards = activeRoster
      .map((r) => {
        const wid = r.workerId || "";
        const rec = wid
          ? state.workerAttendance.find((a) => a.workerId === wid && a.date === attDate && a.projectId === proj.id)
          : null;
        return `<div class="sic-att-card" data-roster="${r.id}" data-worker="${escapeHtml(wid)}">
          <strong>${escapeHtml(r.workerName)}</strong>
          <label>Status<select class="sic-att-status">${statusOpts}</select></label>
          <label>OT hrs<input type="number" class="sic-att-ot" min="0" step="0.5" value="${rec?.overtimeHours || 0}" /></label>
          <button type="button" class="btn btn-primary btn-sm sic-att-save">Save</button>
        </div>`;
      })
      .join("");

    host.appendChild(
      sectionCard(
        `Daily attendance — ${attDate}`,
        activeRoster.length
          ? `<div class="sic-att-grid">${attCards}</div>`
          : `<p class="proj-empty">Add workers to roster first</p>`
      )
    );

    host.querySelectorAll(".sic-att-card").forEach((card) => {
      const rosterRow = activeRoster.find((x) => x.id === card.dataset.roster);
      const wid = card.dataset.worker;
      const rec = wid
        ? state.workerAttendance.find((a) => a.workerId === wid && a.date === attDate && a.projectId === proj.id)
        : null;
      const sel = card.querySelector(".sic-att-status");
      if (sel && rec?.status) sel.value = rec.status;
      card.querySelector(".sic-att-save")?.addEventListener("click", async () => {
        if (!wid) {
          showToast("Link worker to master list for attendance tracking", "error");
          return;
        }
        try {
          await recordAttendanceWithAuthority({
            workerId: wid,
            projectId: proj.id,
            date: attDate,
            status: sel?.value || "present",
            overtimeHours: Number(card.querySelector(".sic-att-ot")?.value) || 0,
            siteInChargeId: sic.id,
          });
          showToast("Attendance saved");
        } catch (err) {
          showToast(err.message, "error");
        }
      });
    });

    if (leftRoster.length) {
      const leftTable = `<table class="data-table"><thead><tr><th>Name</th><th>Left</th><th></th></tr></thead><tbody>${leftRoster
        .map(
          (r) => `<tr>
            <td>${escapeHtml(r.workerName)}</td>
            <td>${escapeHtml(r.leftDate || "—")}</td>
            <td><button type="button" class="btn btn-ghost btn-sm" data-rejoin="${r.id}">Rejoin</button></td>
          </tr>`
        )
        .join("")}</tbody></table>`;
      host.appendChild(sectionCard("Former roster", leftTable));
    }

    host.querySelector("#sic-roster-form")?.addEventListener("submit", async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const workerId = fd.get("workerId");
      const worker = state.workers.find((w) => w.id === workerId);
      const workerName = worker?.name || String(fd.get("workerName") || "").trim();
      if (!workerName) {
        showToast("Worker name required", "error");
        return;
      }
      if (workerId && activeWorkerIds.has(workerId)) {
        showToast("Worker already on roster", "error");
        return;
      }
      try {
        await addRosterEntry(proj.id, {
          workerId: workerId || "",
          workerName,
          siteInChargeId: sic.id,
          trade: fd.get("trade") || worker?.trade || "",
          dailyWage: Number(fd.get("dailyWage")) || worker?.dailyWage || 0,
        });
        e.target.reset();
        showToast("Added to roster");
      } catch (err) {
        showToast(err.message, "error");
      }
    });

    host.querySelectorAll("[data-leave]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        try {
          await updateRosterEntry(proj.id, btn.dataset.leave, { status: "left", leftDate: todayISO() });
          showToast("Worker marked left");
        } catch (err) {
          showToast(err.message, "error");
        }
      });
    });

    host.querySelectorAll("[data-rejoin]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const row = leftRoster.find((r) => r.id === btn.dataset.rejoin);
        if (!row) return;
        if (row.workerId && activeWorkerIds.has(row.workerId)) {
          showToast("Worker already active on roster", "error");
          return;
        }
        try {
          await updateRosterEntry(proj.id, row.id, {
            status: "active",
            leftDate: "",
            joinedDate: todayISO(),
          });
          showToast("Worker rejoined");
        } catch (err) {
          showToast(err.message, "error");
        }
      });
    });

    return host;
  }

  function renderPayrollTab(sic, proj) {
    const host = document.createElement("div");
    host.className = "sic-tab-content";
    const month = state.filterMonth;
    const bounds = computePeriodBounds(state.payCycle, `${month}-15`);
    const cycleOpts = PAY_CYCLES.map(
      (c) => `<option value="${c.id}" ${state.payCycle === c.id ? "selected" : ""}>${escapeHtml(c.label)}</option>`
    ).join("");
    const modeOpts = PAYMENT_MODES.map((m) => `<option value="${m.id}">${escapeHtml(m.label)}</option>`).join("");

    host.innerHTML = `
      <div class="sic-month-bar">
        <label>Month <input type="month" id="sic-payroll-month" value="${month}" /></label>
        <label>Pay cycle <select id="sic-pay-cycle">${cycleOpts}</select></label>
        <span class="text-muted">Period: ${bounds.periodStart} → ${bounds.periodEnd}</span>
        <a href="/workers" class="btn btn-ghost btn-sm">Open Workers page</a>
      </div>
    `;
    host.querySelector("#sic-payroll-month")?.addEventListener("change", (e) => {
      state.filterMonth = e.target.value;
      renderDetail();
    });
    host.querySelector("#sic-pay-cycle")?.addEventListener("change", (e) => {
      state.payCycle = e.target.value;
      renderDetail();
    });

    if (proj) {
      const rosterWorkers = state.roster.filter((r) => r.siteInChargeId === sic.id && r.status === "active" && r.workerId);
      const calcRows = rosterWorkers.map((r) => {
        const calc = state.salaryCalculations.find(
          (c) =>
            c.workerId === r.workerId &&
            c.projectId === proj.id &&
            c.periodStart === bounds.periodStart &&
            c.periodEnd === bounds.periodEnd
        );
        return { roster: r, calc };
      });

      const calcCard = document.createElement("div");
      calcCard.className = "card card-pad sic-payroll-calc-card";
      calcCard.innerHTML = `
        <h4 class="section-title">Salary calculation (§2.13)</h4>
        <button type="button" class="btn btn-primary btn-sm" id="sic-calc-all">Calculate all roster workers</button>
        <div class="table-wrap" style="margin-top:0.75rem">
          <table class="dash-table">
            <thead><tr><th>Worker</th><th>Days</th><th>Gross</th><th>Advance</th><th>Net</th><th>Status</th><th></th></tr></thead>
            <tbody>
              ${calcRows.length ? calcRows.map(({ roster: r, calc }) => `
                <tr>
                  <td>${escapeHtml(r.workerName)}</td>
                  <td>${calc?.totalDays ?? "—"}</td>
                  <td>${calc ? formatBDT(calc.grossAmount) : "—"}</td>
                  <td>${calc ? formatBDT(calc.advanceDeducted) : "—"}</td>
                  <td>${calc ? formatBDT(calc.netPayable) : "—"}</td>
                  <td>${calc ? statusChip(calc.status === "paid" ? "on_time" : "pending") : "—"}</td>
                  <td>${calc && calc.status !== "paid" ? `<button type="button" class="btn btn-ghost btn-sm sic-pay-worker" data-calc="${calc.id}" data-worker="${r.workerId}">Pay</button>` : ""}</td>
                </tr>`).join("") : `<tr class="empty-row"><td colspan="7">No linked workers on roster</td></tr>`}
            </tbody>
          </table>
        </div>
      `;
      host.appendChild(calcCard);

      calcCard.querySelector("#sic-calc-all")?.addEventListener("click", async () => {
        try {
          for (const r of rosterWorkers) {
            await calculateSalary(r.workerId, proj.id, {
              cycle: state.payCycle,
              periodStart: bounds.periodStart,
              siteInChargeId: sic.id,
            });
          }
          showToast("Salary calculated for roster");
          renderDetail();
        } catch (err) {
          showToast(err.message, "error");
        }
      });

      calcCard.querySelectorAll(".sic-pay-worker").forEach((btn) => {
        btn.addEventListener("click", async () => {
          const calc = state.salaryCalculations.find((c) => c.id === btn.dataset.calc);
          if (!calc) return;
          const mode = prompt("Payment mode: cash, bkash, or bank", "cash");
          if (!mode) return;
          try {
            await confirmSalaryPayment({
              workerId: btn.dataset.worker,
              calcId: calc.id,
              amount: calc.netPayable,
              paymentMode: mode,
              projectId: proj.id,
              siteInChargeId: sic.id,
              postExpense: true,
            });
            showToast("Payment confirmed");
            renderDetail();
          } catch (err) {
            showToast(err.message, "error");
          }
        });
      });

      const payForm = document.createElement("form");
      payForm.className = "sic-payroll-form form-grid";
      const workerOpts = state.workers
        .filter((w) => w.status !== "inactive")
        .map((w) => `<option value="${w.id}">${escapeHtml(w.name)}</option>`)
        .join("");
      payForm.innerHTML = `
        <label>Worker<select name="workerId" required><option value="">Select</option>${workerOpts}</select></label>
        <label>Amount<input type="number" name="amount" min="0" required /></label>
        <label>Mode<select name="paymentMode">${modeOpts}</select></label>
        <button type="submit" class="btn btn-primary">Confirm payment</button>
      `;
      host.appendChild(sectionCard("Confirm disbursement", payForm));
      payForm.addEventListener("submit", async (e) => {
        e.preventDefault();
        const fd = new FormData(payForm);
        const workerId = fd.get("workerId");
        if (!workerId) {
          showToast("Select worker", "error");
          return;
        }
        try {
          let calcId = "";
          try {
            calcId = await calculateSalary(workerId, proj.id, {
              cycle: state.payCycle,
              periodStart: bounds.periodStart,
              siteInChargeId: sic.id,
            });
          } catch (_) { /* calc optional */ }
          await confirmSalaryPayment({
            workerId,
            calcId,
            amount: Number(fd.get("amount")) || 0,
            paymentMode: fd.get("paymentMode") || "cash",
            projectId: proj.id,
            siteInChargeId: sic.id,
            postExpense: true,
          });
          payForm.reset();
          showToast("Payment recorded");
          renderDetail();
        } catch (err) {
          showToast(err.message, "error");
        }
      });

      const entryForm = document.createElement("form");
      entryForm.className = "sic-payroll-form form-grid";
      entryForm.innerHTML = `
        <label>Worker<select name="workerId" required><option value="">Select</option>${workerOpts}</select></label>
        <label>Type<select name="type">
          <option value="attendance">Attendance</option>
          <option value="advance">Advance</option>
          <option value="wage">Wage</option>
        </select></label>
        <label>Days<input type="number" name="days" value="1" min="1" /></label>
        <label>Amount (advance/manual)<input type="number" name="amount" min="0" /></label>
        <label>Date<input type="date" name="date" value="${todayISO()}" /></label>
        <button type="submit" class="btn btn-primary">Save payroll entry</button>
      `;
      host.appendChild(sectionCard("New payroll entry", entryForm));
      entryForm.addEventListener("submit", async (e) => {
        e.preventDefault();
        const fd = new FormData(entryForm);
        const worker = state.workers.find((w) => w.id === fd.get("workerId"));
        if (!worker) {
          showToast("Select worker", "error");
          return;
        }
        try {
          await createPayrollEntry({
            worker,
            projectId: proj.id,
            siteInChargeId: sic.id,
            type: fd.get("type"),
            days: Number(fd.get("days")) || 1,
            amount: Number(fd.get("amount")) || undefined,
            date: fd.get("date"),
            postExpense: true,
          });
          entryForm.reset();
          entryForm.querySelector('[name="date"]').value = todayISO();
          showToast("Payroll saved");
        } catch (err) {
          showToast(err.message, "error");
        }
      });
    }

    const entries = state.payrollEntries.filter((e) => {
      if (e.siteInChargeId && e.siteInChargeId !== sic.id) return false;
      if (!e.siteInChargeId && proj && e.projectId !== proj.id) return false;
      if (proj && e.projectId !== proj.id) return false;
      const mk = e.settlementMonth || (e.date || "").slice(0, 7);
      return mk === month;
    });
    const untagged = entries.filter((e) => !e.siteInChargeId);
    const { laborTotal } = aggregatePayrollForMonth(entries);

    const warn =
      untagged.length > 0
        ? `<p class="sic-warn">${untagged.length} entries missing site in-charge tag (from before assignment).</p>`
        : "";

    host.insertAdjacentHTML(
      "beforeend",
      `<p class="sic-summary-line">Total labor: <strong>${formatBDT(laborTotal)}</strong> (${entries.length} entries)</p>${warn}`
    );

    const table =
      entries.length === 0
        ? `<p class="proj-empty">No payroll this month for this context.</p>`
        : `<table class="data-table"><thead><tr><th>Date</th><th>Worker</th><th>Type</th><th>Month</th><th>Amount</th></tr></thead><tbody>${entries
            .map(
              (e) =>
                `<tr><td>${escapeHtml(e.date)}</td><td>${escapeHtml(e.workerName)}</td><td>${escapeHtml(e.type)}</td><td>${escapeHtml(e.settlementMonth || "—")}</td><td>${formatBDT(e.amount)}</td></tr>`
            )
            .join("")}</tbody></table>`;
    host.appendChild(sectionCard("Payroll entries", table));
    return host;
  }

  function renderSettlementTab(sic, proj) {
    const host = document.createElement("div");
    host.className = "sic-tab-content";
    if (!proj) {
      host.innerHTML = `<p class="proj-empty">Select a project context for monthly settlement.</p>`;
      return host;
    }
    const month = state.filterMonth;
    const existing = state.settlements.find((s) => s.month === month && s.siteInChargeId === sic.id);
    let draft = getSettlementDraft(sic, proj);
    const readOnly = existing?.status === "paid";

    host.innerHTML = `
      <div class="sic-month-bar">
        <label>Month <input type="month" id="sic-settle-month" value="${month}" /></label>
        <button type="button" class="btn btn-ghost btn-sm" id="sic-print-settlement">Print summary</button>
      </div>
      <div class="card sic-settlement-card" id="sic-settlement-print">
        <h3>Settlement — ${monthLabel(month)}</h3>
        <p>Status: ${existing ? statusChip(existing.status) : "draft (not saved)"}</p>
        <div id="sic-settle-form-host"></div>
        <h4>Material (informational)</h4>
        <ul class="sic-settle-list" id="sic-settle-mat-list"></ul>
        <div class="sic-settle-actions" id="sic-settle-actions"></div>
      </div>
    `;

    const formHost = host.querySelector("#sic-settle-form-host");
    const settleForm = renderSettlementForm(draft, { readOnly });
    formHost.appendChild(settleForm);

    const matList = host.querySelector("#sic-settle-mat-list");
    matList.innerHTML =
      (draft.materialSummary || [])
        .map((m) => `<li>${escapeHtml(m.label)}: ${m.totalQty} ${escapeHtml(m.unit)}</li>`)
        .join("") || "<li>No material logged</li>";

    const recalc = () => {
      const monthlyRate = Number(settleForm.querySelector('[name="monthlyRate"]')?.value) || 0;
      const advancePaid = Number(settleForm.querySelector('[name="advancePaid"]')?.value) || 0;
      const deductions = Number(settleForm.querySelector('[name="deductions"]')?.value) || 0;
      const net = computeNetPayable({ monthlyRate, laborTotal: draft.laborTotal, advancePaid, deductions });
      draft = { ...draft, monthlyRate, advancePaid, deductions, netPayable: net };
      const netEl = settleForm.querySelector(".sic-net-value");
      if (netEl) netEl.textContent = formatBDT(net);
      const key = `${sic.id}-${proj.id}-${month}`;
      state.settlementOverrides[key] = { monthlyRate, advancePaid, deductions };
    };

    if (!readOnly) {
      settleForm.querySelectorAll("input").forEach((inp) => inp.addEventListener("input", recalc));
    }

    const actions = host.querySelector("#sic-settle-actions");
    if (!readOnly) {
      actions.innerHTML = `
        <button type="button" class="btn btn-primary" id="sic-save-settlement">Save draft</button>
        ${existing?.status === "draft" || !existing ? '<button type="button" class="btn btn-ghost" id="sic-approve-settlement">Approve</button>' : ""}
        ${existing?.status === "approved" ? '<button type="button" class="btn btn-primary" id="sic-paid-settlement">Mark paid</button>' : ""}
      `;
    }

    host.querySelector("#sic-settle-month")?.addEventListener("change", (e) => {
      state.filterMonth = e.target.value;
      renderDetail();
    });

    host.querySelector("#sic-print-settlement")?.addEventListener("click", () => {
      const printEl = host.querySelector("#sic-settlement-print");
      const w = window.open("", "_blank");
      if (!w) return;
      w.document.write(`<html><head><title>Settlement ${monthLabel(month)}</title></head><body>${printEl.innerHTML}</body></html>`);
      w.document.close();
      w.print();
    });

    host.querySelector("#sic-save-settlement")?.addEventListener("click", async () => {
      recalc();
      try {
        await upsertSettlement(proj.id, { ...draft, status: "draft" });
        showToast("Settlement saved");
      } catch (err) {
        showToast(err.message, "error");
      }
    });
    host.querySelector("#sic-approve-settlement")?.addEventListener("click", async () => {
      recalc();
      try {
        await upsertSettlement(proj.id, { ...draft, ...existing, status: "approved" });
        showToast("Settlement approved");
      } catch (err) {
        showToast(err.message, "error");
      }
    });
    host.querySelector("#sic-paid-settlement")?.addEventListener("click", async () => {
      const dlg = document.createElement("dialog");
      dlg.className = "modal-dialog";
      recalc();
      dlg.innerHTML = `
        <form method="dialog" class="modal-form">
          <h3>Mark settlement paid</h3>
          <p>Amount: <strong>${formatBDT(draft.netPayable)}</strong></p>
          <label>Payment reference *<input name="paymentRef" required placeholder="Cheque / txn no." /></label>
          <div class="modal-actions">
            <button type="button" class="btn btn-ghost" data-cancel>Cancel</button>
            <button type="submit" class="btn btn-primary">Confirm payment</button>
          </div>
        </form>
      `;
      document.body.appendChild(dlg);
      dlg.showModal();
      dlg.querySelector("[data-cancel]")?.addEventListener("click", () => dlg.close());
      dlg.querySelector("form")?.addEventListener("submit", async (e) => {
        e.preventDefault();
        const ref = new FormData(e.target).get("paymentRef");
        try {
          recalc();
          const settleId = await upsertSettlement(proj.id, { ...draft, ...existing, status: "approved" });
          await postSettlementPayment(proj.id, settleId, {
            amount: draft.netPayable,
            paymentRef: ref,
            siteInChargeName: sic.name,
          });
          showToast("Settlement paid and posted to accounts");
          dlg.close();
        } catch (err) {
          showToast(err.message, "error");
        }
      });
      dlg.addEventListener("close", () => dlg.remove());
    });
    return host;
  }

  function renderProjectsTab(sic, assignments) {
    const host = document.createElement("div");
    host.className = "sic-tab-content";
    const rows = assignments
      .filter((a) => a.siteInChargeId === sic.id)
      .sort((a, b) => (b.startDate || "").localeCompare(a.startDate || ""));
    const html =
      rows.length === 0
        ? `<p class="proj-empty">No assignments</p>`
        : `<table class="data-table"><thead><tr><th>Project</th><th>Start</th><th>End</th><th>Status</th><th>Logs</th><th></th></tr></thead><tbody>${rows
            .map((a) => {
              const logCount =
                a.status === "active" && a.projectId === state.contextProjectId
                  ? countLogsInPeriod(state.materialLogs, {
                      siteInChargeId: sic.id,
                      startDate: a.startDate,
                      endDate: a.endDate || todayISO(),
                    })
                  : "—";
              const endBtn =
                a.status === "active"
                  ? `<button type="button" class="btn btn-ghost btn-sm" data-end-asn="${a.id}">End</button>`
                  : "";
              return `<tr>
                <td><a href="/projects?id=${encodeURIComponent(a.projectId)}">${escapeHtml(a.projectName || a.projectId)}</a></td>
                <td>${escapeHtml(a.startDate || "—")}</td>
                <td>${escapeHtml(a.endDate || "—")}</td>
                <td>${escapeHtml(a.status)}</td>
                <td>${logCount}</td>
                <td>${endBtn}</td>
              </tr>`;
            })
            .join("")}</tbody></table>`;
    host.appendChild(sectionCard("Assignment history", html));
    host.querySelectorAll("[data-end-asn]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        if (!confirm("End this assignment? Project site in-charge will be cleared.")) return;
        try {
          await endAssignment(btn.dataset.endAsn);
          if (state.contextProjectId) {
            const still = activeAssignmentsForInCharge(state.assignments, sic.id);
            if (!still.some((a) => a.projectId === state.contextProjectId)) {
              state.contextProjectId = still[0]?.projectId || "";
              bindProjectSubs(state.contextProjectId || null);
            }
          }
          showToast("Assignment ended");
          render();
        } catch (err) {
          showToast(err.message, "error");
        }
      });
    });
    return host;
  }

  function renderDetail() {
    if (state.selectedId === "__new__") {
      renderWizard();
      return;
    }
    const sic = selectedInCharge();
    if (!sic) {
      detailPanel.innerHTML = `<p class="proj-empty">Select a site in-charge or create a new one</p>`;
      return;
    }
    syncContextProject();
    const proj = contextProject();
    const assignments = state.assignments;
    const active = activeAssignmentsForInCharge(assignments, sic.id);
    const { laborTotal } = aggregatePayrollForMonth(state.payrollEntries, {
      siteInChargeId: sic.id,
      projectId: proj?.id,
      monthKey: state.filterMonth,
    });
    const materialLogsMonth = state.materialLogs.filter(
      (l) => l.siteInChargeId === sic.id && (l.logDate || "").startsWith(state.filterMonth)
    ).length;
    const rosterCount = state.roster.filter((r) => r.siteInChargeId === sic.id && r.status === "active").length;

    detailPanel.innerHTML = "";
    const wrap = document.createElement("div");
    wrap.className = "sic-detail-wrap";
    wrap.appendChild(
      renderSiteInchargeHeader(
        sic,
        {
          projectNames: active.map((a) => a.projectName),
          contextAssignments: active,
          contextProjectId: state.contextProjectId,
          rosterCount,
          materialLogsMonth,
          laborMonth: laborTotal,
          monthLabel: monthLabel(state.filterMonth),
        },
        {
          onEdit: () => openEditDialog(sic),
          onAssign: () => openAssignDialog(sic),
          onContextChange,
        }
      )
    );
    const tabHost = document.createElement("div");
    tabHost.appendChild(
      renderSiteInchargeTabBar(state.activeTab, (tab) => {
        state.activeTab = tab;
        updateHashParams({ tab, id: state.selectedId, projectId: state.contextProjectId });
        renderDetail();
      })
    );
    wrap.appendChild(tabHost);
    const body = document.createElement("div");
    body.className = "sic-detail-body";
    if (state.activeTab === "overview") body.appendChild(renderOverviewTab(sic, proj, assignments));
    else if (state.activeTab === "diary") body.appendChild(renderDiaryTab(sic, proj));
    else if (state.activeTab === "material") body.appendChild(renderMaterialTab(sic, proj));
    else if (state.activeTab === "equipment") body.appendChild(renderEquipmentTab(sic, proj));
    else if (state.activeTab === "requests") body.appendChild(renderRequestsTab(sic, proj));
    else if (state.activeTab === "roster") body.appendChild(renderRosterTab(sic, proj));
    else if (state.activeTab === "payroll") body.appendChild(renderPayrollTab(sic, proj));
    else if (state.activeTab === "settlement") body.appendChild(renderSettlementTab(sic, proj));
    else if (state.activeTab === "projects") body.appendChild(renderProjectsTab(sic, assignments));
    wrap.appendChild(body);
    detailPanel.appendChild(wrap);
  }

  function render() {
    renderKpi();
    renderList();
    renderDetail();
  }

  const unsubs = [
    listenList("siteInCharges", (rows) => {
      state.siteInCharges = rows;
      if (state.selectedId && state.selectedId !== "__new__" && !rows.find((s) => s.id === state.selectedId)) {
        state.selectedId = null;
      }
      render();
    }),
    listenList("siteInChargeAssignments", (rows) => {
      state.assignments = rows;
      syncContextProject();
      render();
    }),
    listenList("projects", (rows) => {
      state.projects = rows;
      render();
    }),
    listenList("workers", (rows) => {
      state.workers = rows;
      render();
    }),
    listenList("payrollEntries", (rows) => {
      state.payrollEntries = rows;
      render();
    }),
    listenList("workerAttendance", (rows) => {
      state.workerAttendance = rows;
      renderDetail();
    }),
    listenList("workerSalaryCalculations", (rows) => {
      state.salaryCalculations = rows;
      renderDetail();
    }),
    listenList("workerSalaryPayments", (rows) => {
      state.salaryPayments = rows;
      renderDetail();
    }),
    listenList("inventoryMaterials", (rows) => {
      state.inventoryMaterials = rows;
      renderDetail();
    }),
  ];

  if (state.selectedId && state.selectedId !== "__new__") {
    syncContextProject();
    if (state.contextProjectId) bindProjectSubs(state.contextProjectId);
    else {
      const a = activeAssignmentsForInCharge(state.assignments, state.selectedId)[0];
      if (a?.projectId) {
        state.contextProjectId = a.projectId;
        bindProjectSubs(a.projectId);
      }
    }
  }

  render();

  return {
    unmount: () => {
      unsubs.forEach((u) => u());
      state.unsubMaterial?.();
      state.unsubRoster?.();
      state.unsubSettlements?.();
      state.unsubGrn?.();
      state.unsubDiaries?.();
      state.unsubEquipment?.();
      state.unsubMr?.();
      state.unsubIssueVouchers?.();
      state.unsubBoq?.();
    },
  };
}
