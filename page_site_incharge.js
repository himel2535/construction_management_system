import { listenList, listenProjectSub, create } from "./svc_data.js";
import { showToast } from "./cmp_toast.js";
import { confirmAction } from "./cmp_confirm.js";
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
import { openCustFormDialog } from "./cmp_projectTab.js";
import {
  renderSiteInchargeKpiStripHtml,
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
    title: "Site Management",
    subtitle: "Field project managers — material usage, workers, and monthly settlement",
    showDateRange: false,
    quickActionLabel: "",
    onQuickAction: null,
  });

  const root = document.createElement("div");
  root.className = "site-incharge-page dashboard-page dashboard-mockup";
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
    <div class="sup-layout sic-mockup-layout">
      <div id="sic-kpi-host" class="dash-kpi-row sic-kpi-host"></div>
      <div class="sup-split sic-split">
        <aside class="dash-widget dash-widget--projects card sup-list-panel sic-list-panel" id="sic-list-panel"></aside>
        <main class="sup-detail-panel sic-detail-panel" id="sic-detail-panel">
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
    kpiHost.innerHTML = renderSiteInchargeKpiStripHtml(pageStats());
  }

  function renderList() {
    const list = filteredList();
    listPanel.innerHTML = `
      <div class="dash-widget-head">
        <h3 class="dash-widget-title">Site in-charges</h3>
      </div>
      <div class="dash-widget-body sic-list-body">
        <div class="toolbar-row projects-toolbar sic-list-toolbar">
          <div class="cust-toolbar-search toolbar-search">
            ${icon("search", { size: 16, className: "icon cust-toolbar-search-icon" })}
            <input type="search" class="cust-toolbar-search-input" id="sic-search" placeholder="Search in-charges..." autocomplete="off" value="${escapeHtml(state.filterQuery)}" />
          </div>
          <select class="cust-form-input toolbar-select sic-status-filter" id="sic-status-filter">
            <option value="all">Status: All</option>
            <option value="active" ${state.filterStatus === "active" ? "selected" : ""}>Active</option>
            <option value="inactive" ${state.filterStatus === "inactive" ? "selected" : ""}>Inactive</option>
          </select>
          <button type="button" class="btn btn-primary btn-sm" id="sic-new-btn">+ New site in-charge</button>
        </div>
        <div class="sup-list-items sic-list-items" id="sic-list-items"></div>
      </div>
    `;
    listPanel.querySelector("#sic-new-btn")?.addEventListener("click", () => openCreateSiteInChargeDialog());
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

  function activeProjectOptions() {
    return state.projects
      .filter((p) => p.status !== "completed" && p.status !== "cancelled")
      .map((p) => ({ value: p.id, label: p.name }));
  }

  function openAssignDialog(sic) {
    openCustFormDialog({
      title: "Assign project",
      subtitle: "One active site in-charge per project. Previous assignment on that project will end.",
      modalClass: "sic-profile-modal",
      submitLabel: "Assign",
      values: { startDate: todayISO() },
      sections: [
        {
          title: "Project",
          fields: [
            { name: "projectId", label: "Project", type: "select", required: true, options: [{ value: "", label: "Select project" }, ...activeProjectOptions()] },
            { name: "startDate", label: "Start date", type: "date", required: true },
          ],
        },
      ],
      onSave: async (data) => {
        const project = state.projects.find((p) => p.id === data.projectId);
        if (!project) {
          showToast("Select a project", "error");
          return false;
        }
        await assignSiteInChargeToProject({
          siteInChargeId: sic.id,
          projectId: data.projectId,
          projectName: project.name,
          startDate: data.startDate || todayISO(),
        });
        state.contextProjectId = data.projectId;
        bindProjectSubs(data.projectId);
        showToast("Project assigned — previous in-charge on this project was ended");
        render();
      },
    });
  }

  function openEditDialog(sic) {
    openCustFormDialog({
      title: "Edit site in-charge",
      modalClass: "sic-profile-modal",
      submitLabel: "Save",
      values: {
        name: sic.name,
        phone: sic.phone || "",
        nid: sic.nid || "",
        monthlyRate: sic.monthlyRate || "",
        status: sic.status !== "inactive" ? "active" : "inactive",
        address: sic.address || "",
        notes: sic.notes || "",
      },
      sections: [
        {
          title: "Profile",
          fields: [
            { name: "name", label: "Name", type: "text", required: true },
            { name: "phone", label: "Phone", type: "text" },
            { name: "nid", label: "NID", type: "text" },
            { name: "monthlyRate", label: "Monthly rate (BDT)", type: "number" },
            {
              name: "status",
              label: "Status",
              type: "select",
              options: [
                { value: "active", label: "Active" },
                { value: "inactive", label: "Inactive" },
              ],
            },
            { name: "address", label: "Address", type: "textarea", fullWidth: true },
          ],
        },
        {
          title: "Notes",
          fields: [{ name: "notes", label: "Notes", type: "textarea", fullWidth: true }],
        },
      ],
      onSave: async (data) => {
        const newStatus = data.status;
        await updateSiteInCharge(sic.id, {
          name: data.name,
          phone: data.phone,
          nid: data.nid,
          monthlyRate: Number(data.monthlyRate) || 0,
          status: newStatus,
          address: data.address,
          notes: data.notes,
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
        render();
      },
    });
  }

  function openCreateSiteInChargeDialog() {
    openCustFormDialog({
      title: "Create site in-charge",
      subtitle: "Field PM — material, labor, and site accountability",
      modalClass: "sic-profile-modal",
      submitLabel: "Create",
      values: { startDate: todayISO(), projectId: "" },
      sections: [
        {
          title: "Profile",
          fields: [
            { name: "name", label: "Name", type: "text", required: true },
            { name: "phone", label: "Phone", type: "text" },
            { name: "nid", label: "NID", type: "text" },
            { name: "monthlyRate", label: "Monthly rate (optional)", type: "number" },
            { name: "address", label: "Address", type: "textarea", fullWidth: true },
          ],
        },
        {
          title: "Project (optional)",
          fields: [
            {
              name: "projectId",
              label: "Assign to project",
              type: "select",
              options: [{ value: "", label: "None — assign later" }, ...activeProjectOptions()],
            },
            { name: "startDate", label: "Start date", type: "date" },
          ],
        },
      ],
      onSave: async (data) => {
        const proj = state.projects.find((p) => p.id === data.projectId);
        const id = await createSiteInChargeWithProject(
          {
            name: data.name,
            phone: data.phone,
            address: data.address,
            nid: data.nid,
            monthlyRate: Number(data.monthlyRate) || 0,
            startDate: data.startDate || todayISO(),
          },
          data.projectId || "",
          proj?.name || ""
        );
        state.selectedId = id;
        state.contextProjectId = data.projectId || "";
        state.activeTab = "overview";
        updateHashParams({ id, projectId: state.contextProjectId, tab: state.activeTab });
        if (data.projectId) bindProjectSubs(data.projectId);
        showToast("Site in-charge created");
        render();
      },
    });
  }

  function materialUsageGridHtml(itemsByKey = {}) {
    const head = `<div class="sic-mat-row sic-mat-row--head" aria-hidden="true">
      <span>Material</span><span>Used</span><span>Wasted</span><span>Reason</span><span>Used for</span><span>Unit</span>
    </div>`;
    const rows = MATERIAL_PRESETS.map((p) => {
      const item = itemsByKey[p.materialKey];
      const used = item?.usedQty ?? item?.qty ?? "";
      const wasted = item?.wastedQty ?? "";
      return `<div class="sic-mat-row sic-mat-row--usage">
        <label class="sic-mat-label">${escapeHtml(p.label)}</label>
        <input type="number" min="0" step="any" class="cust-form-input sic-mat-used" data-key="${p.materialKey}" data-unit="${p.unit}" value="${used}" placeholder="Used" />
        <input type="number" min="0" step="any" class="cust-form-input sic-mat-wasted" data-key="${p.materialKey}" value="${wasted}" placeholder="Wasted" />
        <input type="text" class="cust-form-input sic-mat-waste-reason" data-key="${p.materialKey}" value="${escapeHtml(item?.wasteReason || "")}" placeholder="Waste reason" />
        <input type="text" class="cust-form-input sic-mat-used-for" data-key="${p.materialKey}" value="${escapeHtml(item?.usedFor || "")}" placeholder="Used for" />
        <span class="sic-mat-unit">${escapeHtml(p.unit)}</span>
      </div>`;
    }).join("");
    return `<div class="sic-mat-grid">${head}${rows}</div>`;
  }

  function collectMatItemsFromRoot(root) {
    const items = [];
    root.querySelectorAll(".sic-mat-row--usage").forEach((row) => {
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
    return items;
  }

  function openMaterialLogDialog(sic, proj, { log = null } = {}) {
    const isEdit = Boolean(log);
    const lastLog = !isEdit ? findLastMaterialLog(state.materialLogs, sic.id) : null;
    const itemsByKey = {};
    if (log?.items) {
      for (const i of log.items) itemsByKey[i.materialKey] = i;
    }
    let matModalEl = null;
    openCustFormDialog({
      title: isEdit ? "Edit material log" : "Log material usage",
      modalClass: "sic-material-modal",
      submitLabel: isEdit ? "Save" : "Save usage log",
      values: { logDate: log?.logDate || todayISO(), remarks: log?.remarks || "" },
      sections: [
        {
          title: "Log",
          fields: [
            { name: "logDate", label: "Date", type: "date", required: true },
            { name: "remarks", label: "Remarks", type: "textarea", fullWidth: true },
          ],
        },
      ],
      onReady: ({ modal }) => {
        matModalEl = modal;
        const form = modal.querySelector("form");
        const shell = form?.querySelector(".cust-form-shell");
        if (!shell) return;
        const row = document.createElement("div");
        row.className = "cust-form-row sic-mat-modal-row";
        row.innerHTML = `
          <div class="cust-form-section cust-form-section--full">
            <div class="cust-form-section-head">
              <h4 class="cust-form-section-title">Materials</h4>
              <button type="button" class="btn btn-ghost btn-sm" id="sic-copy-last-log" ${lastLog ? "" : "disabled"}>Copy last log</button>
            </div>
            <div class="cust-form-section-body">${materialUsageGridHtml(itemsByKey)}</div>
          </div>`;
        shell.appendChild(row);
        row.querySelector("#sic-copy-last-log")?.addEventListener("click", () => {
          if (!lastLog?.items?.length) return;
          const byKey = {};
          for (const item of lastLog.items) byKey[item.materialKey] = item;
          const body = row.querySelector(".cust-form-section-body");
          if (body) body.innerHTML = materialUsageGridHtml(byKey);
          showToast("Copied from last log");
        });
      },
      onSave: async (data) => {
        const logDate = data.logDate;
        if (
          hasDuplicateMaterialLog(state.materialLogs, {
            siteInChargeId: sic.id,
            logDate,
            excludeId: log?.id,
          })
        ) {
          showToast(isEdit ? "Another log exists for this date" : "A log already exists for this date", "error");
          throw new Error("duplicate");
        }
        const gridRoot = matModalEl || document.body;
        const items = collectMatItemsFromRoot(gridRoot);
        if (!items.length) {
          showToast("Enter at least one quantity", "error");
          throw new Error("empty");
        }
        if (isEdit) {
          await updateMaterialLog(proj.id, log.id, {
            logDate,
            items,
            remarks: data.remarks,
          });
          showToast("Log updated");
        } else {
          await createMaterialLog(proj.id, {
            siteInChargeId: sic.id,
            logDate,
            items,
            remarks: data.remarks,
            status: "submitted",
          });
          showToast("Material log saved");
        }
        renderDetail();
      },
    });
  }

  function openMaterialEditDialog(sic, proj, log) {
    openMaterialLogDialog(sic, proj, { log });
  }

  function sectionWithToolbar(title, toolbarHtml, bodyEl) {
    const section = document.createElement("section");
    section.className = "dash-widget dash-widget--projects card sic-report-block";
    section.innerHTML = `
      <div class="dash-widget-head dash-widget-head--split">
        <h3 class="dash-widget-title">${escapeHtml(title)}</h3>
        <div class="cust-toolbar-btn-group">${toolbarHtml}</div>
      </div>
      <div class="dash-widget-body sic-section-body"></div>
    `;
    const body = section.querySelector(".sic-section-body");
    if (typeof bodyEl === "string") body.innerHTML = bodyEl;
    else body.appendChild(bodyEl);
    return section;
  }

  function projectsTableHtml(tableInner) {
    return `<div class="table-wrap projects-table-wrap">${tableInner.replace('<table class="data-table"', '<table class="dash-table projects-table"')}</div>`;
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
        : `<table class="data-table"><thead><tr><th>Material</th><th class="cust-col-center">Qty</th><th>Unit</th></tr></thead><tbody>${mat
            .map(
              (m) =>
                `<tr><td>${escapeHtml(m.label)}</td><td>${m.totalQty}</td><td>${escapeHtml(m.unit)}</td></tr>`
            )
            .join("")}</tbody></table>`;
    host.appendChild(
      sectionCard(
        `Material summary — ${monthLabel(month)}`,
        mat.length === 0 ? matHtml : projectsTableHtml(matHtml)
      )
    );

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
    return `<div class="site-balance-strip"><strong>Site stock balance</strong><div class="table-wrap projects-table-wrap"><table class="dash-table projects-table"><thead><tr><th>Material</th><th class="cust-col-center">Issued</th><th class="cust-col-center">Used</th><th class="cust-col-center">Wasted</th><th class="cust-col-center">Balance</th></tr></thead><tbody>${rows
      .map(
        (r) => `<tr><td>${escapeHtml(r.materialName)}</td><td>${r.qtyIssued}</td><td>${r.qtyUsed}</td><td>${r.qtyWasted}</td><td><strong>${r.balance}</strong></td></tr>`
      )
      .join("")}</tbody></table></div>`;
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

    host.appendChild(sectionCard("Site stock balance", renderSiteBalanceStrip(proj.id)));

    const historyInner =
      logs.length === 0
        ? `<p class="proj-empty">No logs yet</p>`
        : `<table class="data-table"><thead><tr><th>Date</th><th>Items</th><th class="cust-col-center">Status</th><th class="cust-col-center">Actions</th></tr></thead><tbody>${logs
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
                <td class="cust-col-center">${statusChip(l.status || "submitted")}</td>
                <td class="cust-col-center sic-row-actions proj-row-actions-cell">
                  <button type="button" class="btn btn-ghost btn-sm" data-edit-log="${l.id}">Edit</button>
                  <button type="button" class="btn btn-ghost btn-sm" data-del-log="${l.id}">Delete</button>
                  ${canApprove ? `<button type="button" class="btn btn-primary btn-sm" data-approve-log="${l.id}">Approve</button>` : ""}
                </td>
              </tr>`;
            })
            .join("")}</tbody></table>`;

    const historySection = sectionWithToolbar(
      "Usage history",
      `<button type="button" class="btn btn-primary btn-sm" id="sic-open-mat-log">+ Log usage</button>`,
      projectsTableHtml(historyInner)
    );
    host.appendChild(historySection);

    historySection.querySelector("#sic-open-mat-log")?.addEventListener("click", () => openMaterialLogDialog(sic, proj));

    host.querySelectorAll("[data-edit-log]").forEach((btn) => {
      const log = logs.find((l) => l.id === btn.dataset.editLog);
      if (log) btn.addEventListener("click", () => openMaterialEditDialog(sic, proj, log));
    });
    host.querySelectorAll("[data-del-log]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        if (!(await confirmAction({ title: "Delete material log?", message: "Delete this material log?", confirmLabel: "Delete", variant: "danger" }))) return;
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

  function openDiaryDialog(sic, proj) {
    const defaultLabor = laborCountForDate(proj.id, todayISO(), {
      roster: state.roster.filter((r) => r.siteInChargeId === sic.id),
      attendance: state.workerAttendance,
    });
    let draftPhotos = [];
    let gallery = null;
    openCustFormDialog({
      title: "Save diary",
      modalClass: "sic-profile-modal",
      submitLabel: "Save draft",
      values: {
        logDate: todayISO(),
        weather: "",
        laborCount: defaultLabor,
        workSummary: "",
      },
      sections: [
        {
          title: "Daily diary",
          fields: [
            { name: "logDate", label: "Date", type: "date", required: true },
            {
              name: "weather",
              label: "Weather",
              type: "select",
              options: [{ value: "", label: "—" }, ...WEATHER_OPTIONS.map((w) => ({ value: w, label: w }))],
            },
            { name: "laborCount", label: "Labor count", type: "number" },
            { name: "workSummary", label: "Work summary", type: "textarea", required: true, fullWidth: true },
          ],
        },
      ],
      onReady: ({ form }) => {
        const shell = form.querySelector(".cust-form-shell");
        const row = document.createElement("div");
        row.className = "cust-form-row";
        row.innerHTML = `<div class="cust-form-section cust-form-section--full"><div class="cust-form-section-head"><h4 class="cust-form-section-title">Photos</h4></div><div class="cust-form-section-body" id="sic-diary-photo-host"></div></div>`;
        shell?.appendChild(row);
        gallery = renderPhotoGallery([], {
          onChange: (photos) => {
            draftPhotos = photos;
          },
        });
        row.querySelector("#sic-diary-photo-host")?.appendChild(gallery);
        const dateInp = form.querySelector('[name="logDate"]');
        const laborInp = form.querySelector('[name="laborCount"]');
        dateInp?.addEventListener("change", () => {
          if (laborInp?.dataset.userEdited) return;
          const count = laborCountForDate(proj.id, dateInp.value || todayISO(), {
            roster: state.roster.filter((r) => r.siteInChargeId === sic.id),
            attendance: state.workerAttendance,
          });
          if (laborInp) laborInp.value = count;
        });
        laborInp?.addEventListener("input", (e) => {
          e.target.dataset.userEdited = "1";
        });
      },
      onSave: async (data) => {
        await createSiteDiary(proj.id, {
          siteInChargeId: sic.id,
          logDate: data.logDate,
          weather: data.weather,
          laborCount: Number(data.laborCount) || 0,
          workSummary: String(data.workSummary || "").trim(),
          photos: draftPhotos,
          status: "draft",
        });
        showToast("Diary saved as draft");
        renderDetail();
      },
    });
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


    const historyInner =
      diaries.length === 0
        ? `<p class="proj-empty">No diaries yet</p>`
        : `<table class="data-table"><thead><tr><th>Date</th><th>Weather</th><th class="cust-col-center">Labor</th><th>Summary</th><th class="cust-col-center">Status</th><th class="cust-col-center">Actions</th></tr></thead><tbody>${diaries
            .map((d) => {
              const summary = escapeHtml(String(d.workSummary || "").slice(0, 60));
              const canSubmit = d.status === "draft" && canPerformAction("submit_site_diary");
              const canApprove = d.status === "submitted" && canPerformAction("approve_site_diary");
              return `<tr>
                <td>${escapeHtml(d.logDate)}</td>
                <td>${escapeHtml(d.weather || "—")}</td>
                <td class="cust-col-center">${d.laborCount ?? "—"}</td>
                <td>${summary}${(d.workSummary || "").length > 60 ? "…" : ""}</td>
                <td class="cust-col-center">${statusChip(d.status || "draft")}</td>
                <td class="cust-col-center sic-row-actions proj-row-actions-cell">
                  ${canSubmit ? `<button type="button" class="btn btn-primary btn-sm" data-submit-diary="${d.id}">Submit</button>` : ""}
                  ${canApprove ? `<button type="button" class="btn btn-primary btn-sm" data-approve-diary="${d.id}">Approve</button>` : ""}
                </td>
              </tr>`;
            })
            .join("")}</tbody></table>`;

    host.appendChild(
      sectionWithToolbar(
        "Diary history",
        `<button type="button" class="btn btn-primary btn-sm" id="sic-open-diary">+ Save diary</button>`,
        projectsTableHtml(historyInner)
      )
    );
    host.querySelector("#sic-open-diary")?.addEventListener("click", () => openDiaryDialog(sic, proj));

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

  function openEquipmentLogDialog(sic, proj) {
    openCustFormDialog({
      title: "Log equipment",
      modalClass: "sic-profile-modal",
      submitLabel: "Log",
      values: { logDate: todayISO(), hours: "", equipmentName: "" },
      sections: [
        {
          title: "Equipment",
          fields: [
            { name: "equipmentName", label: "Equipment name", type: "text", required: true },
            { name: "hours", label: "Hours", type: "number" },
            { name: "logDate", label: "Date", type: "date", required: true },
          ],
        },
      ],
      onSave: async (data) => {
        await create(`equipmentLogs/${proj.id}`, {
          equipmentName: String(data.equipmentName || "").trim(),
          hours: Number(data.hours) || 0,
          logDate: data.logDate || todayISO(),
          siteInChargeId: sic.id,
          cost: 0,
          projectId: proj.id,
          createdAt: Date.now(),
          updatedAt: Date.now(),
          createdBy: getCurrentUserId?.() || "",
        });
        showToast("Equipment logged");
        renderDetail();
      },
    });
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

    const tableInner =
      logs.length === 0
        ? `<p class="proj-empty">No equipment logs</p>`
        : `<table class="data-table"><thead><tr><th>Date</th><th>Equipment</th><th class="cust-col-center">Hours</th></tr></thead><tbody>${logs
            .map(
              (e) => `<tr>
              <td>${escapeHtml(e.logDate || "—")}</td>
              <td>${escapeHtml(e.equipmentName)}</td>
              <td class="cust-col-center">${e.hours ?? 0}</td>
            </tr>`
            )
            .join("")}</tbody></table>`;
    host.appendChild(
      sectionWithToolbar(
        "Recent logs",
        `<button type="button" class="btn btn-primary btn-sm" id="sic-open-equip">+ Log equipment</button>`,
        projectsTableHtml(tableInner)
      )
    );
    host.querySelector("#sic-open-equip")?.addEventListener("click", () => openEquipmentLogDialog(sic, proj));
    return host;
  }

  function openMaterialRequestDialog(sic, proj) {
    const matOpts = state.inventoryMaterials.map((m) => ({ value: m.id, label: `${m.name} (${m.unit || ""})` }));
    openCustFormDialog({
      title: "Submit requisition",
      modalClass: "sic-profile-modal",
      submitLabel: "Submit to central store",
      values: { qty: "", title: "", purpose: "", inventoryMaterialId: "" },
      sections: [
        {
          title: "Requisition",
          fields: [
            { name: "title", label: "Title", type: "text", required: true },
            {
              name: "inventoryMaterialId",
              label: "Stock item",
              type: "select",
              required: true,
              options: [{ value: "", label: "Select item" }, ...matOpts],
            },
            { name: "qty", label: "Quantity", type: "number", required: true },
            { name: "purpose", label: "Purpose / task", type: "text", fullWidth: true },
          ],
        },
      ],
      onSave: async (data) => {
        const id = await create(`materialRequests/${proj.id}`, {
          title: String(data.title || "").trim(),
          requestType: "central",
          inventoryMaterialId: data.inventoryMaterialId,
          qty: Number(data.qty) || 0,
          purpose: String(data.purpose || "").trim(),
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
        showToast("Central requisition submitted");
        renderDetail();
      },
    });
  }

  function renderRequestsTab(sic, proj) {
    const host = document.createElement("div");
    host.className = "sic-tab-content";
    if (!proj) {
      host.innerHTML = `<p class="proj-empty">Select a project context to submit material requests.</p>`;
      return host;
    }

    const mrs = state.materialRequests.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    const canSubmitMr = canPerformAction("submit_material_request");

    const tableInner =
      mrs.length === 0
        ? `<p class="proj-empty">No material requests</p>`
        : `<table class="data-table"><thead><tr><th>Title</th><th>Type</th><th class="cust-col-center">Qty</th><th class="cust-col-center">Status</th><th>Voucher</th></tr></thead><tbody>${mrs
            .map((m) => {
              const isCentral = m.requestType === "central";
              const voucher = isCentral && m.issueVoucherId ? state.issueVouchers.find((v) => v.id === m.issueVoucherId) : null;
              return `<tr>
              <td>${escapeHtml(m.title)}</td>
              <td>${isCentral ? "Central" : "Supplier"}</td>
              <td class="cust-col-center">${m.qty || "—"}</td>
              <td class="cust-col-center">${statusChip(m.status)}</td>
              <td>${voucher ? escapeHtml(voucher.voucherNo) : isCentral ? "Pending issue" : `<a href="/purchases">Purchases</a>`}</td>
            </tr>`;
            })
            .join("")}</tbody></table>`;

    const toolbar = canSubmitMr
      ? `<button type="button" class="btn btn-primary btn-sm" id="sic-open-mr">+ Submit requisition</button>`
      : "";
    host.appendChild(sectionWithToolbar("Material requests", toolbar, projectsTableHtml(tableInner)));
    if (canSubmitMr) {
      host.querySelector("#sic-open-mr")?.addEventListener("click", () => openMaterialRequestDialog(sic, proj));
      host.querySelector("#sic-open-mr")?.closest(".sic-report-block")?.querySelector(".sic-section-body")?.insertAdjacentHTML(
        "beforeend",
        `<p class="text-muted sic-mr-hint">After approval, store manager issues voucher from <a href="/inventory">Inventory → Issue Vouchers</a>.</p>`
      );
    }
    return host;
  }

  function openRosterAddDialog(sic, proj, activeWorkerIds) {
    const workerOpts = state.workers
      .filter((w) => w.status !== "inactive" && !activeWorkerIds.has(w.id))
      .map((w) => ({ value: w.id, label: `${w.name} (${w.trade || ""})` }));
    openCustFormDialog({
      title: "Add worker",
      modalClass: "sic-profile-modal",
      submitLabel: "Add worker",
      values: { workerId: "", workerName: "", trade: "", dailyWage: "" },
      sections: [
        {
          title: "Roster",
          fields: [
            {
              name: "workerId",
              label: "Worker (master list)",
              type: "select",
              options: [{ value: "", label: "Quick name below" }, ...workerOpts],
            },
            { name: "workerName", label: "Or name", type: "text" },
            { name: "trade", label: "Trade", type: "text" },
            { name: "dailyWage", label: "Daily wage", type: "number" },
          ],
        },
      ],
      onSave: async (data) => {
        const worker = state.workers.find((w) => w.id === data.workerId);
        const workerName = worker?.name || String(data.workerName || "").trim();
        if (!workerName) {
          showToast("Worker name required", "error");
          throw new Error("name");
        }
        if (data.workerId && activeWorkerIds.has(data.workerId)) {
          showToast("Worker already on roster", "error");
          throw new Error("dup");
        }
        await addRosterEntry(proj.id, {
          workerId: data.workerId || "",
          workerName,
          siteInChargeId: sic.id,
          trade: data.trade || worker?.trade || "",
          dailyWage: Number(data.dailyWage) || worker?.dailyWage || 0,
        });
        showToast("Added to roster");
        renderDetail();
      },
    });
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

    const attDate = todayISO();
    const statusOpts = ATTENDANCE_STATUSES.filter((s) => s.id !== "leave")
      .map((s) => `<option value="${s.id}">${escapeHtml(s.label)}</option>`)
      .join("");

    const activeTableInner =
      activeRoster.length === 0
        ? `<p class="proj-empty">No workers on roster</p>`
        : `<table class="data-table"><thead><tr><th>Name</th><th>Trade</th><th class="cust-col-center">Wage</th><th>Joined</th><th class="cust-col-center">Actions</th></tr></thead><tbody>${activeRoster
            .map(
              (r) => `<tr>
              <td>${escapeHtml(r.workerName)}</td>
              <td>${escapeHtml(r.trade || "—")}</td>
              <td class="cust-col-center">${formatBDT(r.dailyWage)}</td>
              <td>${escapeHtml(r.joinedDate || "—")}</td>
              <td class="cust-col-center"><button type="button" class="btn btn-ghost btn-sm" data-leave="${r.id}">Mark left</button></td>
            </tr>`
            )
            .join("")}</tbody></table>`;
    host.appendChild(
      sectionWithToolbar(
        "Active roster",
        `<button type="button" class="btn btn-primary btn-sm" id="sic-open-roster">+ Add worker</button>`,
        projectsTableHtml(activeTableInner)
      )
    );
    host.querySelector("#sic-open-roster")?.addEventListener("click", () => openRosterAddDialog(sic, proj, activeWorkerIds));

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
      host.appendChild(sectionCard("Former roster", projectsTableHtml(leftTable)));
    }

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

      const calcCard = sectionCard("Salary calculation", "");
      calcCard.querySelector(".sic-section-body").innerHTML = `
        <button type="button" class="btn btn-primary btn-sm" id="sic-calc-all">Calculate all roster workers</button>
        <div class="table-wrap projects-table-wrap" style="margin-top:0.75rem">
          <table class="dash-table projects-table">
            <thead><tr><th>Worker</th><th class="cust-col-center">Days</th><th class="cust-col-center">Gross</th><th class="cust-col-center">Advance</th><th class="cust-col-center">Net</th><th class="cust-col-center">Status</th><th class="cust-col-center">Actions</th></tr></thead>
            <tbody>
              ${calcRows.length ? calcRows.map(({ roster: r, calc }) => `
                <tr>
                  <td>${escapeHtml(r.workerName)}</td>
                  <td class="cust-col-center">${calc?.totalDays ?? "—"}</td>
                  <td class="cust-col-center">${calc ? formatBDT(calc.grossAmount) : "—"}</td>
                  <td class="cust-col-center">${calc ? formatBDT(calc.advanceDeducted) : "—"}</td>
                  <td class="cust-col-center">${calc ? formatBDT(calc.netPayable) : "—"}</td>
                  <td class="cust-col-center">${calc ? statusChip(calc.status === "paid" ? "on_time" : "pending") : "—"}</td>
                  <td class="cust-col-center proj-row-actions-cell">${calc && calc.status !== "paid" ? `<button type="button" class="btn btn-ghost btn-sm sic-pay-worker" data-calc="${calc.id}" data-worker="${r.workerId}">Pay</button>` : ""}</td>
                </tr>`).join("") : `<tr class="empty-row"><td colspan="7">No linked workers on roster</td></tr>`}
            </tbody>
          </table>
        </div>`;
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
        btn.addEventListener("click", () => {
          const calc = state.salaryCalculations.find((c) => c.id === btn.dataset.calc);
          if (!calc) return;
          openCustFormDialog({
            title: "Confirm payment",
            modalClass: "sic-profile-modal",
            submitLabel: "Pay",
            values: { paymentMode: "cash" },
            sections: [
              {
                title: "Disbursement",
                fields: [
                  {
                    name: "paymentMode",
                    label: "Payment mode",
                    type: "select",
                    required: true,
                    options: PAYMENT_MODES.map((m) => ({ value: m.id, label: m.label })),
                  },
                ],
              },
            ],
            onSave: async (data) => {
              await confirmSalaryPayment({
                workerId: btn.dataset.worker,
                calcId: calc.id,
                amount: calc.netPayable,
                paymentMode: data.paymentMode,
                projectId: proj.id,
                siteInChargeId: sic.id,
                postExpense: true,
              });
              showToast("Payment confirmed");
              renderDetail();
            },
          });
        });
      });

      const payForm = document.createElement("form");
      payForm.className = "sic-payroll-form cust-form-grid cust-form-grid--2";
      const workerOpts = state.workers
        .filter((w) => w.status !== "inactive")
        .map((w) => `<option value="${w.id}">${escapeHtml(w.name)}</option>`)
        .join("");
      payForm.innerHTML = `
        <label class="cust-form-field">Worker<select class="cust-form-input" name="workerId" required><option value="">Select</option>${workerOpts}</select></label>
        <label class="cust-form-field">Amount<input class="cust-form-input" type="number" name="amount" min="0" required /></label>
        <label class="cust-form-field">Mode<select class="cust-form-input" name="paymentMode">${modeOpts}</select></label>
        <button type="submit" class="btn btn-primary cust-form-field--full">Confirm payment</button>
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
    host.appendChild(sectionCard("Payroll entries", entries.length === 0 ? table : projectsTableHtml(table)));
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
      <div class="sic-month-bar projects-toolbar">
        <label class="cust-form-field">Month <input type="month" class="cust-form-input" id="sic-settle-month" value="${month}" /></label>
        <button type="button" class="btn btn-ghost btn-sm" id="sic-print-settlement">Print summary</button>
      </div>
      <section class="dash-widget dash-widget--projects card sic-report-block" id="sic-settlement-print">
        <div class="dash-widget-head"><h3 class="dash-widget-title">Settlement — ${escapeHtml(monthLabel(month))}</h3></div>
        <div class="dash-widget-body">
          <p>Status: ${existing ? statusChip(existing.status) : "draft (not saved)"}</p>
          <div id="sic-settle-form-host"></div>
          <h4 class="dash-widget-sub">Material (informational)</h4>
          <ul class="sic-settle-list" id="sic-settle-mat-list"></ul>
          <div class="sic-settle-actions cust-toolbar-btn-group" id="sic-settle-actions"></div>
        </div>
      </section>
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
    host.querySelector("#sic-paid-settlement")?.addEventListener("click", () => {
      recalc();
      openCustFormDialog({
        title: "Mark settlement paid",
        subtitle: `Amount: ${formatBDT(draft.netPayable)}`,
        modalClass: "sic-profile-modal",
        submitLabel: "Confirm payment",
        values: { paymentRef: "" },
        sections: [
          {
            title: "Payment",
            fields: [{ name: "paymentRef", label: "Payment reference", type: "text", required: true, hint: "Cheque / txn no." }],
          },
        ],
        onSave: async (data) => {
          recalc();
          const settleId = await upsertSettlement(proj.id, { ...draft, ...existing, status: "approved" });
          await postSettlementPayment(proj.id, settleId, {
            amount: draft.netPayable,
            paymentRef: data.paymentRef,
            siteInChargeName: sic.name,
          });
          showToast("Settlement paid and posted to accounts");
          renderDetail();
        },
      });
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
        : projectsTableHtml(`<table class="data-table"><thead><tr><th>Project</th><th>Start</th><th>End</th><th class="cust-col-center">Status</th><th class="cust-col-center">Logs</th><th class="cust-col-center">Actions</th></tr></thead><tbody>${rows
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
            .join("")}</tbody></table>`);
    host.appendChild(sectionCard("Assignment history", html));
    host.querySelectorAll("[data-end-asn]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        if (!(await confirmAction({ title: "End assignment?", message: "End this assignment? Project site in-charge will be cleared.", confirmLabel: "End assignment", variant: "danger" }))) return;
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
      state.selectedId = null;
      openCreateSiteInChargeDialog();
      detailPanel.innerHTML = `<p class="proj-empty">Select a site in-charge or create a new one</p>`;
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
