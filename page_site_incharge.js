import { listenList, listenProjectSub, create, getList } from "./svc_data.js";
import { showToast, actionFeedback } from "./cmp_toast.js";
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
  renderOverviewEmptyPanel,
  renderSettlementForm,
  renderSettlementStatGrid,
} from "./cmp_siteInchargeHub.js";

const SIC_OVERVIEW_PROJECT_CARD_TONES = [
  "sic-overview-project-card--blue",
  "sic-overview-project-card--mint",
  "sic-overview-project-card--lavender",
  "sic-overview-project-card--peach",
];
import { renderBoqStatGrid } from "./page_projects_r2.js";

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
  let boundProjectId = null;

  const PROJECT_COLLECTION_STATE = {
    siteMaterialLogs: "materialLogs",
    siteDiaries: "siteDiaries",
    equipmentLogs: "equipmentLogs",
    materialRequests: "materialRequests",
    projectRoster: "roster",
    siteSettlements: "settlements",
    goodsReceipts: "goodsReceipts",
    issueVouchers: "issueVouchers",
    boqItems: "boqItems",
  };

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
      if (!state.assignments.length && state.contextProjectId) return;
      state.contextProjectId = "";
      return;
    }
    if (!active.some((a) => a.projectId === state.contextProjectId)) {
      state.contextProjectId = active[0].projectId;
    }
  }

  async function refreshProjectCollection(projectId, key) {
    if (!projectId) return;
    const stateKey = PROJECT_COLLECTION_STATE[key];
    if (!stateKey) return;
    state[stateKey] = await getList(`${key}/${projectId}`);
    renderDetail();
  }

  function ensureProjectSubs() {
    syncContextProject();
    const pid = state.contextProjectId;
    if (!pid || !selectedInCharge()) {
      if (boundProjectId) bindProjectSubs(null);
      return;
    }
    if (boundProjectId === pid) return;
    bindProjectSubs(pid);
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
    boundProjectId = projectId || null;
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
    ensureProjectSubs();
    updateHashParams({ id, projectId: state.contextProjectId, tab: state.activeTab });
    render();
  }

  function onContextChange(projectId) {
    state.contextProjectId = projectId;
    ensureProjectSubs();
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
        ensureProjectSubs();
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
          ensureProjectSubs();
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
        ensureProjectSubs();
        showToast("Site in-charge created");
        render();
      },
    });
  }

  function materialUsageGridHtml(itemsByKey = {}) {
    const head = `<div class="sic-mat-row sic-mat-row--head" aria-hidden="true">
      <span>Material</span><span>Used</span><span>Wasted</span><span>Reason</span><span>Used for</span><span>Unit</span>
    </div>`;
    const rows = MATERIAL_PRESETS.map((p, i) => {
      const item = itemsByKey[p.materialKey];
      const used = item?.usedQty ?? item?.qty ?? "";
      const wasted = item?.wastedQty ?? "";
      const evenClass = i % 2 === 1 ? " sic-mat-row--even" : "";
      return `<div class="sic-mat-row sic-mat-row--usage${evenClass}">
        <label class="sic-mat-label">${escapeHtml(p.label)}</label>
        <input type="number" min="0" step="any" class="cust-form-input sic-mat-used" data-key="${p.materialKey}" data-unit="${p.unit}" value="${used}" />
        <input type="number" min="0" step="any" class="cust-form-input sic-mat-wasted" data-key="${p.materialKey}" value="${wasted}" />
        <input type="text" class="cust-form-input sic-mat-waste-reason" data-key="${p.materialKey}" value="${escapeHtml(item?.wasteReason || "")}" />
        <input type="text" class="cust-form-input sic-mat-used-for" data-key="${p.materialKey}" value="${escapeHtml(item?.usedFor || "")}" />
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
        const hasSiteStock = siteLedgerForProject(proj.id).some((r) => r.qtyIssued > 0 || r.qtyUsed > 0);
        const stockHint = hasSiteStock
          ? ""
          : `<p class="text-muted sic-mat-stock-hint">Log saves as submitted. Approve after materials are issued to site.</p>`;
        const row = document.createElement("div");
        row.className = "cust-form-row sic-mat-modal-row";
        row.innerHTML = `
          <div class="cust-form-section cust-form-section--full">
            <div class="cust-form-section-head">
              <h4 class="cust-form-section-title">Materials</h4>
              <button type="button" class="btn btn-ghost btn-sm" id="sic-copy-last-log" ${lastLog ? "" : "disabled"}>Copy last log</button>
            </div>
            ${stockHint}
            <div class="cust-form-section-body sic-mat-modal-body">${materialUsageGridHtml(itemsByKey)}</div>
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
        for (const item of items) {
          if (item.wastedQty > 0 && !item.wasteReason) {
            showToast(`Waste reason required for ${item.label || item.materialKey}`, "error");
            throw new Error("waste-reason");
          }
        }
        try {
          if (isEdit) {
            await updateMaterialLog(proj.id, log.id, {
              logDate,
              items,
              remarks: data.remarks,
            });
            await actionFeedback("material_log_updated", { sicId: sic.id, projectId: proj.id });
          } else {
            await createMaterialLog(proj.id, {
              siteInChargeId: sic.id,
              logDate,
              items,
              remarks: data.remarks,
              status: "submitted",
            });
            await actionFeedback("material_log_saved", {
              sicId: sic.id,
              projectId: proj.id,
            });
          }
          await refreshProjectCollection(proj.id, "siteMaterialLogs");
        } catch (err) {
          showToast(err.message || "Could not save material log", "error");
          throw err;
        }
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

  function renderOverviewTab(sic, proj, assignments, overviewMeta = {}) {
    const host = document.createElement("div");
    host.className = "sic-overview-tab sic-tab-content";
    const month = state.filterMonth;
    const active = activeAssignmentsForInCharge(assignments, sic.id);
    const existingSettlement = proj
      ? state.settlements.find((s) => s.month === month && s.siteInChargeId === sic.id)
      : null;
    const materialLogsMonth =
      overviewMeta.materialLogsMonth ??
      state.materialLogs.filter(
        (l) => l.siteInChargeId === sic.id && (l.logDate || "").startsWith(month)
      ).length;
    const laborMonth = overviewMeta.laborMonth ?? 0;
    const settlementLabel = existingSettlement
      ? String(existingSettlement.status || "draft").replace(/_/g, " ")
      : "Not saved";

    const metricsSection = document.createElement("section");
    metricsSection.className = "proj-boq-metrics proj-boq-metrics--planning sic-overview-metrics";
    metricsSection.innerHTML = `<h4 class="proj-boq-section-title">Overview summary</h4>`;
    metricsSection.appendChild(
      renderBoqStatGrid([
        { label: "Assigned projects", value: active.length },
        { label: "Material logs", value: materialLogsMonth },
        { label: "Labor (month)", value: formatBDT(laborMonth) },
        { label: "Settlement", value: settlementLabel, attention: !existingSettlement },
      ])
    );
    const statGrid = metricsSection.querySelector(".proj-boq-stat-grid");
    if (statGrid) statGrid.classList.add("sic-overview-stat-grid");

    const toolbarShell = document.createElement("div");
    toolbarShell.className = "reports-table-wrap sic-overview-toolbar-shell";
    toolbarShell.innerHTML = `
      <div class="sic-overview-toolbar-head-row">
        <h4 class="proj-boq-section-title sic-overview-toolbar-head">Overview — ${escapeHtml(monthLabel(month))}</h4>
        <div class="sic-overview-toolbar-actions">
          <label class="sic-overview-month-label">Month
            <input type="month" class="cust-form-input sic-overview-month-input" id="sic-overview-month" value="${month}" />
          </label>
          <span class="sic-overview-settlement-meta">${
            existingSettlement
              ? `Settlement: ${statusChip(existingSettlement.status)}`
              : `<span class="text-muted">Settlement: not saved</span>`
          }</span>
        </div>
      </div>
    `;
    toolbarShell.querySelector("#sic-overview-month")?.addEventListener("change", (e) => {
      state.filterMonth = e.target.value;
      renderDetail();
    });

    const projectsShell = document.createElement("div");
    projectsShell.className = "reports-table-wrap sic-overview-projects-shell";
    const projectsBody =
      active.length === 0
        ? renderOverviewEmptyPanel(
            "No active project assigned",
            "Use Assign project in the header to link a site in-charge to a project."
          )
        : `<div class="sic-overview-projects-grid">${active
            .map(
              (a, i) => `
          <article class="sic-overview-project-card ${SIC_OVERVIEW_PROJECT_CARD_TONES[i % SIC_OVERVIEW_PROJECT_CARD_TONES.length]}">
            <strong class="sic-overview-project-name">${escapeHtml(a.projectName || a.projectId)}</strong>
            <span class="sic-overview-project-since">Since ${escapeHtml(a.startDate || "—")}</span>
            <div class="sic-overview-project-actions">
              <button type="button" class="btn btn-ghost btn-sm" data-switch-project="${escapeHtml(a.projectId)}">Use as context</button>
              <a href="/projects?id=${encodeURIComponent(a.projectId)}" class="btn btn-ghost btn-sm">Open project</a>
            </div>
          </article>`
            )
            .join("")}</div>`;
    projectsShell.innerHTML = `
      <h4 class="proj-boq-section-title sic-overview-shell-head">Assigned projects</h4>
      ${projectsBody}
    `;
    projectsShell.querySelectorAll("[data-switch-project]").forEach((btn) => {
      btn.addEventListener("click", () => onContextChange(btn.dataset.switchProject));
    });

    const mat = aggregateMaterialByMonth(state.materialLogs, month, { siteInChargeId: sic.id });
    const matCountLabel =
      mat.length === 1
        ? `Showing 1 material · ${monthLabel(month)}`
        : mat.length
          ? `Showing ${mat.length} materials · ${monthLabel(month)}`
          : `0 materials logged · ${monthLabel(month)}`;
    const materialShell = document.createElement("div");
    materialShell.className = "reports-table-wrap sic-overview-material-shell";
    materialShell.innerHTML =
      mat.length === 0
        ? `
      <h4 class="proj-boq-section-title sic-overview-shell-head">Material summary — ${escapeHtml(monthLabel(month))}</h4>
      ${renderOverviewEmptyPanel(
        "No material logged this month",
        "Open Material log tab to record site usage for this month."
      )}
      <div class="reports-widget-foot">
        <span class="reports-widget-foot-meta">${escapeHtml(matCountLabel)}</span>
      </div>`
        : `
      <h4 class="proj-boq-section-title sic-overview-shell-head">Material summary — ${escapeHtml(monthLabel(month))}</h4>
      <table class="dash-table projects-table">
        <colgroup>
          <col class="sic-overview-mat-col-label">
          <col class="sic-overview-mat-col-qty">
          <col class="sic-overview-mat-col-unit">
        </colgroup>
        <thead>
          <tr>
            <th>Material</th>
            <th class="cust-col-center">Qty</th>
            <th class="cust-col-center">Unit</th>
          </tr>
        </thead>
        <tbody>
          ${mat
            .map(
              (m) =>
                `<tr><td>${escapeHtml(m.label)}</td><td class="cust-col-center">${m.totalQty}</td><td class="cust-col-center">${escapeHtml(m.unit)}</td></tr>`
            )
            .join("")}
        </tbody>
      </table>
      <div class="reports-widget-foot">
        <span class="reports-widget-foot-meta">${escapeHtml(matCountLabel)}</span>
      </div>`;

    const varianceShell = document.createElement("div");
    varianceShell.className = "reports-table-wrap sic-overview-variance-shell";
    let varianceInner = "";
    if (proj) {
      const varianceRows = issuedVsUsedVariance(siteLedgerForProject(proj.id)).map((r) => ({
        label: r.materialName,
        issued: r.qtyIssued,
        used: r.qtyUsed + r.qtyWasted,
        variance: r.variance,
      }));
      const logTotals = aggregateMaterialByMonth(state.materialLogs, month, { siteInChargeId: sic.id });
      const grnTotals = aggregateGrnByMaterial(state.goodsReceipts, month);
      varianceInner = `
        <section class="sic-overview-subsection">
          <h5 class="sic-overview-subsection-title">Issued vs used</h5>
          ${renderMaterialVarianceTable(varianceRows, {
            emptyHint: "Issue vouchers and material logs create issued vs used comparison.",
          })}
        </section>
        <section class="sic-overview-subsection">
          <h5 class="sic-overview-subsection-title">GRN vs logged (procurement)</h5>
          ${renderMaterialVarianceTable(materialVariance(logTotals, grnTotals), {
            emptyHint: "GRN receipts and site material logs enable procurement variance.",
          })}
        </section>`;
    } else {
      varianceInner = renderOverviewEmptyPanel(
        "No project context selected",
        "Use as context on an assigned project to view variance reports."
      );
    }
    varianceShell.innerHTML = `
      <h4 class="proj-boq-section-title sic-overview-shell-head">Variance reports</h4>
      ${varianceInner}
    `;

    const activity = buildActivityFeed(state.materialLogs, state.payrollEntries, {
      siteInChargeId: sic.id,
      projectId: proj?.id,
      limit: 5,
    });
    const activityShell = document.createElement("div");
    activityShell.className = "reports-table-wrap sic-overview-activity-shell";
    const quickActions = proj
      ? `<div class="sic-overview-activity-head-actions">
          <button type="button" class="btn btn-primary btn-sm" id="sic-go-material">Log material</button>
          <button type="button" class="btn btn-ghost btn-sm" id="sic-go-roster">Manage roster</button>
          <button type="button" class="btn btn-ghost btn-sm" id="sic-go-settlement">Settlement</button>
        </div>`
      : "";
    activityShell.innerHTML = `
      <div class="sic-overview-activity-head-row">
        <h4 class="proj-boq-section-title sic-overview-shell-head">Recent activity</h4>
        ${quickActions}
      </div>
      ${renderActivityFeed(activity, { variant: "hub" })}
    `;
    if (proj) {
      activityShell.querySelector("#sic-go-material")?.addEventListener("click", () => {
        state.activeTab = "material";
        updateHashParams({ tab: "material" });
        renderDetail();
      });
      activityShell.querySelector("#sic-go-roster")?.addEventListener("click", () => {
        state.activeTab = "roster";
        updateHashParams({ tab: "roster" });
        renderDetail();
      });
      activityShell.querySelector("#sic-go-settlement")?.addEventListener("click", () => {
        state.activeTab = "settlement";
        updateHashParams({ tab: "settlement" });
        renderDetail();
      });
    }

    host.append(metricsSection, toolbarShell, projectsShell, materialShell, varianceShell, activityShell);
    return host;
  }

  function presetInventoryId(preset) {
    const mat = mapProductToInventoryMaterial(preset.label, state.inventoryMaterials);
    return mat?.id || preset.materialKey;
  }

  function siteLedgerForProject(projId) {
    return rollupSiteLedger(projId, state.issueVouchers, state.materialLogs, null, { usageStatus: "approved" });
  }

  function materialLogApproveReason(projId, log) {
    const approvedLogs = state.materialLogs.filter((l) => l.status === "approved" && l.id !== log.id);
    const ledger = rollupSiteLedger(projId, state.issueVouchers, approvedLogs, null, { usageStatus: "approved" });
    const pendingByMaterial = {};
    for (const item of log.items || []) {
      const mid = item.inventoryMaterialId || item.materialKey;
      if (!mid) continue;
      const usedQty = Number(item.usedQty ?? item.qty) || 0;
      const wastedQty = Number(item.wastedQty) || 0;
      pendingByMaterial[mid] = (pendingByMaterial[mid] || 0) + usedQty + wastedQty;
    }
    for (const [mid, pending] of Object.entries(pendingByMaterial)) {
      const row = ledger.find((r) => r.materialId === mid);
      const available = Math.max(0, row?.balance ?? 0);
      const issued = row?.qtyIssued ?? 0;
      const name = row?.materialName || log.items?.find((i) => (i.inventoryMaterialId || i.materialKey) === mid)?.label || mid;
      const unit = row?.unit || log.items?.find((i) => (i.inventoryMaterialId || i.materialKey) === mid)?.unit || "unit";
      if (pending > available + 0.001) {
        if (issued <= 0.001) return `No ${name} issued to site — issue from Inventory first`;
        return `Cannot approve — only ${available} ${unit} remaining (this log needs ${pending})`;
      }
    }
    return "";
  }

  function materialLogItemsHtml(items = []) {
    if (!items.length) return "—";
    const chips = items
      .map((i) => {
        const label = escapeHtml(i.label || i.materialKey);
        const used = i.usedQty ?? i.qty ?? 0;
        const wasted = i.wastedQty || 0;
        const unit = escapeHtml(i.unit || "");
        return `<span class="sic-material-item-chip">${label} · used ${used} · wasted ${wasted}${unit ? ` · ${unit}` : ""}</span>`;
      })
      .join("");
    return `<div class="sic-material-items-list">${chips}</div>`;
  }

  function renderSiteBalanceStrip(projId, sicId) {
    const rows = siteLedgerForProject(projId).filter(
      (r) => r.qtyIssued > 0 || r.qtyUsed > 0 || r.qtyWasted > 0
    );
    const pendingCount = state.materialLogs.filter(
      (l) => l.siteInChargeId === sicId && l.status === "submitted"
    ).length;
    const pendingNote =
      pendingCount > 0
        ? `<p class="sic-material-pending-note">${pendingCount} usage log${pendingCount === 1 ? "" : "s"} pending approval — not deducted until approved</p>`
        : "";

    if (!rows.length) {
      return `<p class="text-muted sic-material-balance-empty">No issued materials on site yet — request from central stock first.</p>${pendingNote}`;
    }

    return `<div class="sic-material-balance-table-wrap">
      <table class="dash-table projects-table sic-material-balance-table">
        <colgroup>
          <col class="sic-material-balance-col-name">
          <col class="sic-material-balance-col-num">
          <col class="sic-material-balance-col-num">
          <col class="sic-material-balance-col-num">
          <col class="sic-material-balance-col-num">
        </colgroup>
        <thead>
          <tr>
            <th>Material</th>
            <th class="cust-col-center">Issued</th>
            <th class="cust-col-center">Used</th>
            <th class="cust-col-center">Wasted</th>
            <th class="cust-col-center">Balance</th>
          </tr>
        </thead>
        <tbody>${rows
          .map((r) => {
            const balClass = r.balance < 0 ? "sic-balance-negative" : "";
            return `<tr>
              <td>${escapeHtml(r.materialName)}</td>
              <td class="cust-col-center">${r.qtyIssued}</td>
              <td class="cust-col-center">${r.qtyUsed}</td>
              <td class="cust-col-center">${r.qtyWasted}</td>
              <td class="cust-col-center"><strong class="${balClass}">${r.balance}</strong></td>
            </tr>`;
          })
          .join("")}</tbody>
      </table>
    </div>${pendingNote}`;
  }

  function renderMaterialTab(sic, proj) {
    const host = document.createElement("div");
    host.className = "sic-material-tab sic-tab-content";
    if (!proj) {
      host.innerHTML = `<p class="proj-empty">Select a project context to log materials.</p>`;
      return host;
    }
    const logs = state.materialLogs
      .filter((l) => l.siteInChargeId === sic.id)
      .sort((a, b) => (b.logDate || "").localeCompare(a.logDate || ""));

    const balanceShell = document.createElement("div");
    balanceShell.className = "reports-table-wrap sic-material-balance-shell";
    balanceShell.innerHTML = `
      <h4 class="proj-boq-section-title sic-material-shell-head">Site stock balance</h4>
      ${renderSiteBalanceStrip(proj.id, sic.id)}
    `;

    const countLabel =
      logs.length === 1
        ? "Showing 1 of 1 log"
        : logs.length
          ? `Showing ${logs.length} of ${logs.length} logs`
          : "No usage logs yet";

    const historyShell = document.createElement("div");
    historyShell.className = "reports-table-wrap sic-material-history-shell";
    const historyBody =
      logs.length === 0
        ? renderOverviewEmptyPanel(
            "No usage logs yet",
            "Click + Log usage to record material used or wasted on site."
          )
        : `
      <table class="dash-table projects-table">
        <colgroup>
          <col class="sic-material-col-date">
          <col class="sic-material-col-items">
          <col class="sic-material-col-status">
          <col class="sic-material-col-actions">
        </colgroup>
        <thead>
          <tr>
            <th>Date</th>
            <th>Items</th>
            <th class="rep-col-status">Status</th>
            <th class="rep-col-actions">Actions</th>
          </tr>
        </thead>
        <tbody>
          ${logs
            .map((l) => {
              const canApprove = l.status === "submitted";
              const approveBlock = canApprove ? materialLogApproveReason(proj.id, l) : "";
              const approveBtn = canApprove
                ? approveBlock
                  ? `<button type="button" class="btn btn-primary btn-sm sic-approve-blocked" disabled title="${escapeHtml(approveBlock)}">Approve</button>`
                  : `<button type="button" class="btn btn-primary btn-sm" data-approve-log="${l.id}">Approve</button>`
                : "";
              return `<tr data-log-id="${l.id}">
                <td>${escapeHtml(l.logDate)}</td>
                <td class="sic-material-items-cell">${materialLogItemsHtml(l.items)}</td>
                <td class="rep-col-status"><span class="sic-material-status-wrap">${statusChip(l.status || "submitted")}</span></td>
                <td class="rep-col-actions">
                  <span class="sic-material-log-actions sic-row-actions">
                    <button type="button" class="btn btn-ghost btn-sm" data-edit-log="${l.id}">Edit</button>
                    <button type="button" class="btn btn-ghost btn-sm" data-del-log="${l.id}">Delete</button>
                    ${approveBtn}
                  </span>
                </td>
              </tr>`;
            })
            .join("")}
        </tbody>
      </table>`;

    historyShell.innerHTML = `
      <div class="sic-material-history-head-row">
        <h4 class="proj-boq-section-title sic-material-shell-head">Usage history</h4>
        <div class="sic-material-history-actions">
          <button type="button" class="btn btn-primary btn-sm" id="sic-open-mat-log">+ Log usage</button>
        </div>
      </div>
      ${historyBody}
      <div class="reports-widget-foot">
        <span class="reports-widget-foot-meta">${escapeHtml(countLabel)}</span>
      </div>
    `;

    host.append(balanceShell, historyShell);

    historyShell.querySelector("#sic-open-mat-log")?.addEventListener("click", () => openMaterialLogDialog(sic, proj));

    historyShell.querySelectorAll("[data-edit-log]").forEach((btn) => {
      const log = logs.find((l) => l.id === btn.dataset.editLog);
      if (log) btn.addEventListener("click", () => openMaterialEditDialog(sic, proj, log));
    });
    historyShell.querySelectorAll("[data-del-log]").forEach((btn) => {
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
    historyShell.querySelectorAll("[data-approve-log]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        try {
          await approveMaterialLog(proj.id, btn.dataset.approveLog);
          await actionFeedback("material_log_approved", { sicId: sic.id, projectId: proj.id });
          await refreshProjectCollection(proj.id, "siteMaterialLogs");
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
        await refreshProjectCollection(proj.id, "siteDiaries");
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
        "Daily diary history",
        `<button type="button" class="btn btn-primary btn-sm" id="sic-open-diary">+ Save diary</button>`,
        projectsTableHtml(historyInner)
      )
    );
    host.querySelector("#sic-open-diary")?.addEventListener("click", () => openDiaryDialog(sic, proj));

    host.querySelectorAll("[data-submit-diary]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        try {
          await submitSiteDiary(proj.id, btn.dataset.submitDiary);
          await actionFeedback("diary_submitted", { sicId: sic.id, projectId: proj.id });
          await refreshProjectCollection(proj.id, "siteDiaries");
        } catch (err) {
          showToast(err.message, "error");
        }
      });
    });
    host.querySelectorAll("[data-approve-diary]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        try {
          await approveSiteDiary(proj.id, btn.dataset.approveDiary);
          await actionFeedback("diary_approved", { sicId: sic.id, projectId: proj.id });
          await refreshProjectCollection(proj.id, "siteDiaries");
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
        await refreshProjectCollection(proj.id, "equipmentLogs");
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
        await actionFeedback("central_requisition_submit", {
          sicId: sic.id,
          projectId: proj.id,
          title: String(data.title || "").trim(),
          entityId: id,
        });
        await refreshProjectCollection(proj.id, "materialRequests");
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
        await refreshProjectCollection(proj.id, "projectRoster");
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

  function payrollEntryTypeChip(type) {
    const t = String(type || "other").toLowerCase();
    return `<span class="sic-payroll-entry-chip sic-payroll-entry-chip--${escapeHtml(t)}">${escapeHtml(t)}</span>`;
  }

  function paymentModeChip(mode) {
    const m = String(mode || "cash").toLowerCase();
    return `<span class="sic-payroll-mode-chip sic-payroll-mode-chip--${escapeHtml(m)}">${escapeHtml(m)}</span>`;
  }

  function payrollCalcStatusCell(calc) {
    if (!calc) return "—";
    const label = calc.status === "paid" ? "paid" : calc.status === "confirmed" ? "confirmed" : "pending";
    const chipKey = calc.status === "paid" ? "on_time" : calc.status === "confirmed" ? "submitted" : "pending";
    return `<span class="sic-payroll-status-wrap" title="${escapeHtml(label)}">${statusChip(chipKey)}</span>`;
  }

  function validatePayrollPaymentData(data) {
    const workerId = data.workerId;
    if (!workerId) {
      showToast("Select a worker before confirming payment", "error");
      return null;
    }
    const rawAmount = data.amount;
    if (rawAmount === "" || rawAmount == null) {
      showToast("Enter payment amount (BDT)", "error");
      return null;
    }
    const amount = Number(rawAmount);
    if (Number.isNaN(amount)) {
      showToast("Enter a valid amount", "error");
      return null;
    }
    if (amount <= 0) {
      showToast("Amount must be greater than 0 BDT", "error");
      return null;
    }
    return { workerId, amount, paymentMode: data.paymentMode || "cash" };
  }

  function payrollWorkerFieldOptions() {
    return [
      { value: "", label: "Select" },
      ...state.workers
        .filter((w) => w.status !== "inactive")
        .map((w) => ({ value: w.id, label: w.name })),
    ];
  }

  async function submitDisbursement(validated, sic, proj, bounds) {
    let calcId = "";
    try {
      calcId = await calculateSalary(validated.workerId, proj.id, {
        cycle: state.payCycle,
        periodStart: bounds.periodStart,
        siteInChargeId: sic.id,
      });
    } catch (_) {
      /* calc optional */
    }
    await confirmSalaryPayment({
      workerId: validated.workerId,
      calcId,
      amount: validated.amount,
      paymentMode: validated.paymentMode,
      projectId: proj.id,
      siteInChargeId: sic.id,
      postExpense: true,
    });
    const worker = state.workers.find((w) => w.id === validated.workerId);
    await actionFeedback("payroll_confirm_disbursement", {
      sicId: sic.id,
      projectId: proj.id,
      workerName: worker?.name || "Worker",
      amountLabel: formatBDT(validated.amount),
      entityId: validated.workerId,
    });
    renderDetail();
  }

  function openConfirmDisbursementDialog(sic, proj, bounds) {
    openCustFormDialog({
      title: "Confirm disbursement",
      subtitle: "Manual payment — any worker, any amount",
      modalClass: "sic-profile-modal",
      submitLabel: "Confirm payment",
      values: { workerId: "", amount: "", paymentMode: "cash" },
      sections: [
        {
          title: "Payment",
          fields: [
            {
              name: "workerId",
              label: "Worker",
              type: "select",
              options: payrollWorkerFieldOptions(),
            },
            {
              name: "amount",
              label: "Amount (BDT)",
              type: "number",
              min: "0",
              step: "0.01",
              hint: "Enter amount",
            },
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
        const validated = validatePayrollPaymentData(data);
        if (!validated) throw new Error("validation");
        try {
          await submitDisbursement(validated, sic, proj, bounds);
        } catch (err) {
          if (err.message === "validation") throw err;
          showToast(formatPayrollError(err), "error");
          throw err;
        }
      },
    });
  }

  function openPayrollEntryDialog(sic, proj) {
    openCustFormDialog({
      title: "New payroll entry",
      subtitle: "Log attendance, advance, or wage",
      modalClass: "sic-profile-modal",
      submitLabel: "Save payroll entry",
      values: { workerId: "", type: "attendance", days: "1", amount: "", date: todayISO() },
      sections: [
        {
          title: "Entry",
          fields: [
            {
              name: "workerId",
              label: "Worker",
              type: "select",
              options: payrollWorkerFieldOptions(),
            },
            {
              name: "type",
              label: "Type",
              type: "select",
              options: [
                { value: "attendance", label: "Attendance" },
                { value: "advance", label: "Advance" },
                { value: "wage", label: "Wage" },
              ],
            },
            { name: "days", label: "Days", type: "number", min: "1", step: "1" },
            { name: "amount", label: "Amount (advance/manual)", type: "number", min: "0", step: "0.01" },
            { name: "date", label: "Date", type: "date", required: true },
          ],
        },
      ],
      onSave: async (data) => {
        if (!data.workerId) {
          showToast("Select a worker before saving", "error");
          throw new Error("validation");
        }
        const worker = state.workers.find((w) => w.id === data.workerId);
        try {
          await createPayrollEntry({
            worker,
            projectId: proj.id,
            siteInChargeId: sic.id,
            type: data.type,
            days: Number(data.days) || 1,
            amount: Number(data.amount) || undefined,
            date: data.date,
            postExpense: true,
          });
          await actionFeedback("payroll_entry_saved", {
            sicId: sic.id,
            projectId: proj.id,
            workerName: worker?.name,
            entityId: worker?.id,
          });
          renderDetail();
        } catch (err) {
          showToast(err.message, "error");
          throw err;
        }
      },
    });
  }

  const PAYROLL_ZERO_NET_MSG =
    "Nothing to pay — net salary is 0. Mark attendance on Workers tab and Calculate again.";

  function formatPayrollError(err) {
    const msg = err?.message || "Payment failed";
    if (msg.includes("Default accounts missing")) {
      return "Finance accounts not set up — configure accounts in Finance first";
    }
    return msg;
  }

  function wrapProjectsTable(tableHtml) {
    if (!tableHtml.includes("<table") || tableHtml.includes("projects-table-wrap")) return tableHtml;
    return `<div class="table-wrap projects-table-wrap">${tableHtml}</div>`;
  }

  function renderPayrollTab(sic, proj) {
    const host = document.createElement("div");
    host.className = "sic-tab-content sic-payroll-tab";
    const month = state.filterMonth;
    const bounds = computePeriodBounds(state.payCycle, `${month}-15`);
    const cycleOpts = PAY_CYCLES.map(
      (c) => `<option value="${c.id}" ${state.payCycle === c.id ? "selected" : ""}>${escapeHtml(c.label)}</option>`
    ).join("");

    const entries = state.payrollEntries.filter((e) => {
      if (e.siteInChargeId && e.siteInChargeId !== sic.id) return false;
      if (!e.siteInChargeId && proj && e.projectId !== proj.id) return false;
      if (proj && e.projectId !== proj.id) return false;
      const mk = e.settlementMonth || (e.date || "").slice(0, 7);
      return mk === month;
    });
    const untagged = entries.filter((e) => !e.siteInChargeId);
    const { laborTotal } = aggregatePayrollForMonth(entries);

    const rosterWorkers = proj
      ? state.roster.filter((r) => r.siteInChargeId === sic.id && r.status === "active" && r.workerId)
      : [];
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
    const paidCalcs = calcRows.filter(({ calc }) => calc?.status === "paid").length;
    const pendingCalcs = calcRows.filter(({ calc }) => calc && calc.status !== "paid").length;

    const metricsSection = document.createElement("section");
    metricsSection.className = "proj-boq-metrics proj-boq-metrics--planning sic-payroll-metrics";
    metricsSection.innerHTML = `<h4 class="proj-boq-section-title">Payroll summary</h4>`;
    metricsSection.appendChild(
      renderBoqStatGrid([
        { label: "Roster workers", value: rosterWorkers.length },
        { label: "Payroll logs", value: entries.length },
        { label: "Labor (month)", value: formatBDT(laborTotal) },
        {
          label: "Salary calcs",
          value: proj ? `${paidCalcs} paid / ${pendingCalcs} pending` : "—",
          attention: pendingCalcs > 0,
        },
      ])
    );
    const statGrid = metricsSection.querySelector(".proj-boq-stat-grid");
    if (statGrid) statGrid.classList.add("sic-payroll-stat-grid");
    host.appendChild(metricsSection);

    const toolbarShell = document.createElement("div");
    toolbarShell.className = "reports-table-wrap sic-payroll-toolbar-shell";
    toolbarShell.innerHTML = `
      <div class="sic-payroll-toolbar-head-row">
        <h4 class="proj-boq-section-title sic-overview-toolbar-head">Payroll — ${escapeHtml(monthLabel(month))}</h4>
        <div class="sic-payroll-toolbar-controls">
          <label class="sic-overview-month-label">Month
            <input type="month" class="cust-form-input sic-overview-month-input" id="sic-payroll-month" value="${month}" />
          </label>
          <label class="sic-overview-month-label">Pay cycle
            <select class="cust-form-input" id="sic-pay-cycle">${cycleOpts}</select>
          </label>
          <span class="text-muted sic-payroll-period-label">Period: ${bounds.periodStart} → ${bounds.periodEnd}</span>
          <a href="/workers" class="btn btn-ghost btn-sm">Open Workers page</a>
        </div>
      </div>
    `;
    host.appendChild(toolbarShell);

    if (untagged.length > 0) {
      host.insertAdjacentHTML(
        "beforeend",
        `<p class="sic-warn">${untagged.length} entries missing site in-charge tag (from before assignment).</p>`
      );
    }

    toolbarShell.querySelector("#sic-payroll-month")?.addEventListener("change", (e) => {
      state.filterMonth = e.target.value;
      renderDetail();
    });
    toolbarShell.querySelector("#sic-pay-cycle")?.addEventListener("change", (e) => {
      state.payCycle = e.target.value;
      renderDetail();
    });

    if (proj) {
      const calcFootLabel =
        rosterWorkers.length === 1
          ? `Showing 1 worker · ${bounds.periodStart} → ${bounds.periodEnd}`
          : rosterWorkers.length
            ? `Showing ${rosterWorkers.length} workers · ${bounds.periodStart} → ${bounds.periodEnd}`
            : `0 workers on roster · ${bounds.periodStart} → ${bounds.periodEnd}`;

      const calcBody =
        calcRows.length === 0
          ? renderOverviewEmptyPanel(
              "No workers on roster",
              "Add workers on the Workers tab first, then calculate salary from attendance."
            )
          : wrapProjectsTable(`<table class="dash-table projects-table sic-payroll-calc-table">
            <colgroup>
              <col class="sic-payroll-col-worker">
              <col class="sic-payroll-col-num">
              <col class="sic-payroll-col-num">
              <col class="sic-payroll-col-num">
              <col class="sic-payroll-col-num">
              <col class="sic-payroll-col-status">
              <col class="sic-payroll-col-actions">
            </colgroup>
            <thead>
              <tr>
                <th>Worker</th>
                <th class="cust-col-center">Days</th>
                <th class="cust-col-center">Gross</th>
                <th class="cust-col-center">Advance</th>
                <th class="cust-col-center">Net</th>
                <th class="cust-col-center">Status</th>
                <th class="cust-col-center">Actions</th>
              </tr>
            </thead>
            <tbody>${calcRows
              .map(({ roster: r, calc }) => {
                const netClass = calc && calc.status !== "paid" && calc.netPayable > 0 ? "sic-payroll-net-unpaid" : "";
                const canPay = calc && calc.status !== "paid";
                const payBlocked = canPay && (calc.netPayable ?? 0) <= 0;
                const payBtn = canPay
                  ? payBlocked
                    ? `<button type="button" class="btn btn-primary btn-sm sic-pay-worker sic-pay-worker--blocked" disabled title="${escapeHtml(PAYROLL_ZERO_NET_MSG)}">Pay</button>`
                    : `<button type="button" class="btn btn-primary btn-sm sic-pay-worker" data-calc="${calc.id}" data-worker="${r.workerId}" data-worker-name="${escapeHtml(r.workerName)}" title="Pay calculated net salary">Pay</button>`
                  : "";
                return `<tr>
                  <td>${escapeHtml(r.workerName)}</td>
                  <td class="cust-col-center">${calc?.totalDays ?? "—"}</td>
                  <td class="cust-col-center">${calc ? formatBDT(calc.grossAmount) : "—"}</td>
                  <td class="cust-col-center">${calc ? formatBDT(calc.advanceDeducted) : "—"}</td>
                  <td class="cust-col-center"><strong class="${netClass}">${calc ? formatBDT(calc.netPayable) : "—"}</strong></td>
                  <td class="cust-col-center">${payrollCalcStatusCell(calc)}</td>
                  <td class="cust-col-center proj-row-actions-cell">${payBtn}</td>
                </tr>`;
              })
              .join("")}</tbody>
          </table>`);

      const calcShell = document.createElement("div");
      calcShell.className = "reports-table-wrap sic-payroll-calc-shell";
      calcShell.innerHTML = `
        <div class="sic-material-history-head-row">
          <h4 class="proj-boq-section-title sic-material-shell-head">Salary calculation</h4>
          <div class="sic-material-history-actions">
            <button type="button" class="btn btn-primary btn-sm" id="sic-calc-all">Calculate all roster workers</button>
          </div>
        </div>
        ${calcBody}
        <p class="sic-material-pending-note">Based on attendance &amp; advances from <a href="/workers">Workers page</a>. Use <strong>Pay</strong> for calculated salary, or <strong>Confirm disbursement</strong> below for a manual amount.</p>
        <div class="reports-widget-foot">
          <span class="reports-widget-foot-meta">${escapeHtml(calcFootLabel)}</span>
        </div>
      `;
      host.appendChild(calcShell);

      calcShell.querySelector("#sic-calc-all")?.addEventListener("click", async () => {
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

      calcShell.querySelectorAll(".sic-pay-worker:not([disabled])").forEach((btn) => {
        btn.addEventListener("click", () => {
          const calc = state.salaryCalculations.find((c) => c.id === btn.dataset.calc);
          if (!calc) return;
          if ((calc.netPayable ?? 0) <= 0) {
            showToast(PAYROLL_ZERO_NET_MSG, "error");
            return;
          }
          const workerName = btn.dataset.workerName || calc.workerName || "Worker";
          openCustFormDialog({
            title: "Confirm payment",
            subtitle: `Pay ${workerName} — ${formatBDT(calc.netPayable)}`,
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
              try {
                await confirmSalaryPayment({
                  workerId: btn.dataset.worker,
                  calcId: calc.id,
                  amount: calc.netPayable,
                  paymentMode: data.paymentMode,
                  projectId: proj.id,
                  siteInChargeId: sic.id,
                  postExpense: true,
                });
                await actionFeedback("payroll_confirm_salary", {
                  sicId: sic.id,
                  projectId: proj.id,
                  workerName,
                  amountLabel: formatBDT(calc.netPayable),
                  entityId: btn.dataset.worker,
                });
                renderDetail();
              } catch (err) {
                showToast(formatPayrollError(err), "error");
                throw err;
              }
            },
          });
        });
      });

      const actionsShell = document.createElement("div");
      actionsShell.className = "reports-table-wrap sic-payroll-actions-shell";
      actionsShell.innerHTML = `
        <div class="sic-material-history-head-row">
          <h4 class="proj-boq-section-title sic-material-shell-head">Record payments &amp; entries</h4>
          <div class="sic-material-history-actions">
            <button type="button" class="btn btn-primary btn-sm" id="sic-open-disburse">Confirm disbursement</button>
            <button type="button" class="btn btn-ghost btn-sm" id="sic-open-payroll-entry">+ New payroll entry</button>
          </div>
        </div>
        <p class="sic-material-pending-note">Confirm disbursement saves to <strong>Payment history</strong> below. New payroll entry logs appear in <strong>Payroll entries</strong>.</p>
      `;
      actionsShell.querySelector("#sic-open-disburse")?.addEventListener("click", () =>
        openConfirmDisbursementDialog(sic, proj, bounds)
      );
      actionsShell.querySelector("#sic-open-payroll-entry")?.addEventListener("click", () =>
        openPayrollEntryDialog(sic, proj)
      );
      host.appendChild(actionsShell);
    } else {
      const noProjShell = document.createElement("div");
      noProjShell.className = "reports-table-wrap sic-payroll-calc-shell";
      noProjShell.innerHTML = renderOverviewEmptyPanel(
        "Select a project context",
        "Choose a work context above to calculate salary and record payments."
      );
      host.appendChild(noProjShell);
    }

    const payments = state.salaryPayments.filter((p) => {
      if (p.siteInChargeId && p.siteInChargeId !== sic.id) return false;
      if (proj && p.projectId && p.projectId !== proj.id) return false;
      const mk = p.monthKey || (p.date || "").slice(0, 7);
      return mk === month;
    });

    const paymentsCountLabel =
      payments.length === 1
        ? "Showing 1 payment"
        : payments.length
          ? `Showing ${payments.length} payments`
          : "No payments this month";

    const paymentsBody =
      payments.length === 0
        ? renderOverviewEmptyPanel(
            "No salary payments this month",
            "Confirm disbursement or Pay from Salary calculation to record payments here."
          )
        : wrapProjectsTable(`<table class="dash-table projects-table sic-payroll-payments-table">
            <colgroup>
              <col class="sic-payroll-col-date">
              <col class="sic-payroll-col-worker">
              <col class="sic-payroll-col-type">
              <col class="sic-payroll-col-month">
              <col class="sic-payroll-col-amount">
            </colgroup>
            <thead>
              <tr>
                <th>Date</th>
                <th>Worker</th>
                <th class="cust-col-center">Mode</th>
                <th class="cust-col-center">Month</th>
                <th class="cust-col-center">Amount</th>
              </tr>
            </thead>
            <tbody>${payments
              .map((p) => {
                const workerName =
                  state.workers.find((w) => w.id === p.workerId)?.name || p.workerName || p.workerId || "—";
                return `<tr>
                  <td>${escapeHtml(p.date || "—")}</td>
                  <td>${escapeHtml(workerName)}</td>
                  <td class="cust-col-center">${paymentModeChip(p.paymentMode)}</td>
                  <td class="cust-col-center">${escapeHtml(p.monthKey || "—")}</td>
                  <td class="cust-col-center"><strong>${formatBDT(p.amount)}</strong></td>
                </tr>`;
              })
              .join("")}</tbody>
          </table>`);

    const paymentsShell = document.createElement("div");
    paymentsShell.className = "reports-table-wrap sic-payroll-payments-shell";
    paymentsShell.id = "sic-payment-history";
    paymentsShell.innerHTML = `
      <div class="sic-material-history-head-row">
        <h4 class="proj-boq-section-title sic-material-shell-head">Payment history</h4>
      </div>
      ${paymentsBody}
      <p class="sic-material-pending-note">Salary disbursements from <strong>Confirm disbursement</strong> and <strong>Pay</strong>. Finance voucher posted automatically.</p>
      <div class="reports-widget-foot">
        <span class="reports-widget-foot-meta">${escapeHtml(paymentsCountLabel)}</span>
      </div>
    `;
    host.appendChild(paymentsShell);

    const entriesCountLabel =
      entries.length === 1
        ? "Showing 1 of 1 entry"
        : entries.length
          ? `Showing ${entries.length} of ${entries.length} entries`
          : "No payroll entries this month";

    const entriesBody =
      entries.length === 0
        ? renderOverviewEmptyPanel(
            "No payroll logs this month",
            "Use + New payroll entry to log attendance, advance, or wage."
          )
        : wrapProjectsTable(`<table class="dash-table projects-table sic-payroll-history-table">
            <colgroup>
              <col class="sic-payroll-col-date">
              <col class="sic-payroll-col-worker">
              <col class="sic-payroll-col-type">
              <col class="sic-payroll-col-month">
              <col class="sic-payroll-col-amount">
            </colgroup>
            <thead>
              <tr>
                <th>Date</th>
                <th>Worker</th>
                <th class="cust-col-center">Type</th>
                <th class="cust-col-center">Month</th>
                <th class="cust-col-center">Amount</th>
              </tr>
            </thead>
            <tbody>${entries
              .map(
                (e) =>
                  `<tr>
                    <td>${escapeHtml(e.date)}</td>
                    <td>${escapeHtml(e.workerName)}</td>
                    <td class="cust-col-center">${payrollEntryTypeChip(e.type)}</td>
                    <td class="cust-col-center">${escapeHtml(e.settlementMonth || "—")}</td>
                    <td class="cust-col-center"><strong>${formatBDT(e.amount)}</strong></td>
                  </tr>`
              )
              .join("")}</tbody>
          </table>`);

    const historyShell = document.createElement("div");
    historyShell.className = "reports-table-wrap sic-payroll-history-shell";
    historyShell.id = "sic-payroll-entries";
    historyShell.innerHTML = `
      <div class="sic-material-history-head-row">
        <h4 class="proj-boq-section-title sic-material-shell-head">Payroll entries</h4>
      </div>
      ${entriesBody}
      <p class="sic-material-pending-note">Monthly settlement approval is on the <strong>Settlement</strong> tab — not the Approvals inbox.</p>
      <div class="reports-widget-foot">
        <span class="reports-widget-foot-meta">${escapeHtml(entriesCountLabel)}</span>
      </div>
    `;
    host.appendChild(historyShell);

    return host;
  }

  function renderSettlementTab(sic, proj) {
    const host = document.createElement("div");
    host.className = "sic-tab-content sic-settlement-tab";
    if (!proj) {
      host.innerHTML = renderOverviewEmptyPanel(
        "Select a project context",
        "Choose a work context above to view monthly settlement."
      );
      return host;
    }
    const month = state.filterMonth;
    const existing = state.settlements.find((s) => s.month === month && s.siteInChargeId === sic.id);
    let draft = getSettlementDraft(sic, proj);
    const readOnly = existing?.status === "paid";
    const status = existing?.status || "draft";
    const statusLabel = String(status).replace(/_/g, " ");
    const materialRows = draft.materialSummary || [];
    const materialCountLabel =
      materialRows.length === 1
        ? "Showing 1 material line"
        : materialRows.length
          ? `Showing ${materialRows.length} material lines`
          : "No material logged this month";

    const metricsSection = document.createElement("section");
    metricsSection.className = "proj-boq-metrics proj-boq-metrics--planning sic-settlement-metrics";
    metricsSection.innerHTML = `<h4 class="proj-boq-section-title">Settlement summary</h4>`;
    metricsSection.appendChild(
      renderSettlementStatGrid({
        statusChipHtml: existing ? statusChip(existing.status) : statusChip("draft"),
        labor: formatBDT(draft.laborTotal || 0),
        net: formatBDT(draft.netPayable || 0),
        materialCount: materialRows.length,
        netAttention: (draft.netPayable || 0) > 0 && status !== "paid",
        statusAttention: status === "draft" || !existing,
      })
    );
    host.appendChild(metricsSection);

    const toolbarShell = document.createElement("div");
    toolbarShell.className = "reports-table-wrap sic-settlement-toolbar-shell";
    toolbarShell.innerHTML = `
      <div class="sic-settlement-toolbar-head-row">
        <h4 class="proj-boq-section-title sic-overview-toolbar-head">Settlement — ${escapeHtml(monthLabel(month))}</h4>
        <div class="sic-settlement-toolbar-controls">
          <label class="sic-overview-month-label">Month
            <input type="month" class="cust-form-input sic-overview-month-input" id="sic-settle-month" value="${month}" />
          </label>
          <button type="button" class="btn btn-ghost btn-sm" id="sic-print-settlement">Print summary</button>
        </div>
      </div>
    `;
    host.appendChild(toolbarShell);

    const amountsShell = document.createElement("div");
    amountsShell.className = "reports-table-wrap sic-settlement-amounts-shell";
    amountsShell.id = "sic-settlement-print";
    amountsShell.innerHTML = `
      <div class="sic-material-history-head-row">
        <h4 class="proj-boq-section-title sic-material-shell-head">Settlement calculation</h4>
        <span class="sic-settlement-calc-status">${existing ? statusChip(existing.status) : statusChip("draft")}</span>
      </div>
      <div id="sic-settle-form-host"></div>
      <p class="sic-material-pending-note">${
        readOnly
          ? "This settlement is <strong>paid</strong> — amounts are read-only."
          : "Net payable = monthly rate + labor total − advance − deductions."
      }</p>
      <div class="reports-widget-foot">
        <span class="reports-widget-foot-meta">${
          existing
            ? `Saved as ${escapeHtml(statusLabel)} · ${formatBDT(draft.netPayable || 0)}`
            : "Not saved yet — use Save draft below"
        }</span>
      </div>
    `;
    host.appendChild(amountsShell);

    const settleForm = renderSettlementForm(draft, { readOnly });
    amountsShell.querySelector("#sic-settle-form-host")?.appendChild(settleForm);

    const materialBody =
      materialRows.length === 0
        ? renderOverviewEmptyPanel(
            "No material logged this month",
            "Material usage from the Material log tab appears here for reference."
          )
        : wrapProjectsTable(`<table class="dash-table projects-table sic-settlement-material-table">
            <colgroup>
              <col class="sic-settlement-col-material">
              <col class="sic-settlement-col-qty">
              <col class="sic-settlement-col-unit">
            </colgroup>
            <thead>
              <tr>
                <th>Material</th>
                <th class="cust-col-center">Qty</th>
                <th class="cust-col-center">Unit</th>
              </tr>
            </thead>
            <tbody>${materialRows
              .map(
                (m) => `<tr>
                  <td>${escapeHtml(m.label)}</td>
                  <td class="cust-col-center">${m.totalQty}</td>
                  <td class="cust-col-center">${escapeHtml(m.unit)}</td>
                </tr>`
              )
              .join("")}</tbody>
          </table>`);

    const materialShell = document.createElement("div");
    materialShell.className = "reports-table-wrap sic-settlement-material-shell";
    materialShell.innerHTML = `
      <div class="sic-material-history-head-row">
        <h4 class="proj-boq-section-title sic-material-shell-head">Material (informational)</h4>
      </div>
      ${materialBody}
      <p class="sic-material-pending-note">Aggregated from approved material logs — not deducted from net payable.</p>
      <div class="reports-widget-foot">
        <span class="reports-widget-foot-meta">${escapeHtml(materialCountLabel)}</span>
      </div>
    `;
    host.appendChild(materialShell);

    const actionsShell = document.createElement("div");
    actionsShell.className = "reports-table-wrap sic-settlement-actions-shell";
    if (readOnly) {
      actionsShell.innerHTML = `
        <div class="sic-material-history-head-row">
          <h4 class="proj-boq-section-title sic-material-shell-head">Workflow</h4>
        </div>
        <p class="sic-settlement-paid-banner">Settlement marked <strong>paid</strong> — no further actions.</p>
      `;
    } else {
      actionsShell.innerHTML = `
        <div class="sic-material-history-head-row">
          <h4 class="proj-boq-section-title sic-material-shell-head">Workflow</h4>
          <div class="sic-material-history-actions" id="sic-settle-actions"></div>
        </div>
        <p class="sic-material-pending-note">Save draft, approve for payment, then mark paid when disbursed.</p>
      `;
    }
    host.appendChild(actionsShell);

    const recalc = () => {
      const monthlyRate = Number(settleForm.querySelector('[name="monthlyRate"]')?.value) || 0;
      const advancePaid = Number(settleForm.querySelector('[name="advancePaid"]')?.value) || 0;
      const deductions = Number(settleForm.querySelector('[name="deductions"]')?.value) || 0;
      const net = computeNetPayable({ monthlyRate, laborTotal: draft.laborTotal, advancePaid, deductions });
      draft = { ...draft, monthlyRate, advancePaid, deductions, netPayable: net };
      const netEl = settleForm.querySelector(".sic-net-value");
      if (netEl) netEl.textContent = formatBDT(net);
      const metricsNet = host.querySelector("#sic-settlement-metrics-net");
      if (metricsNet) metricsNet.textContent = formatBDT(net);
      const key = `${sic.id}-${proj.id}-${month}`;
      state.settlementOverrides[key] = { monthlyRate, advancePaid, deductions };
    };

    if (!readOnly) {
      settleForm.querySelectorAll("input").forEach((inp) => inp.addEventListener("input", recalc));

      const actions = actionsShell.querySelector("#sic-settle-actions");
      if (actions) {
        actions.innerHTML = `
          <button type="button" class="btn btn-primary btn-sm" id="sic-save-settlement">Save draft</button>
          ${existing?.status === "draft" || !existing ? '<button type="button" class="btn btn-ghost btn-sm" id="sic-approve-settlement">Approve</button>' : ""}
          ${existing?.status === "approved" ? '<button type="button" class="btn btn-primary btn-sm" id="sic-paid-settlement">Mark paid</button>' : ""}
        `;
      }
    }

    host.querySelector("#sic-settle-month")?.addEventListener("change", (e) => {
      state.filterMonth = e.target.value;
      renderDetail();
    });

    host.querySelector("#sic-print-settlement")?.addEventListener("click", () => {
      const printEl = host.querySelector("#sic-settlement-print");
      const matEl = host.querySelector(".sic-settlement-material-shell");
      const w = window.open("", "_blank");
      if (!w) return;
      w.document.write(
        `<html><head><title>Settlement ${monthLabel(month)}</title></head><body>${printEl?.innerHTML || ""}${matEl?.innerHTML || ""}</body></html>`
      );
      w.document.close();
      w.print();
    });

    host.querySelector("#sic-save-settlement")?.addEventListener("click", async () => {
      recalc();
      try {
        await upsertSettlement(proj.id, { ...draft, status: "draft" });
        await actionFeedback("settlement_saved", {
          sicId: sic.id,
          projectId: proj.id,
          amountLabel: formatBDT(draft.netPayable),
        });
        renderDetail();
      } catch (err) {
        showToast(err.message, "error");
      }
    });
    host.querySelector("#sic-approve-settlement")?.addEventListener("click", async () => {
      recalc();
      try {
        await upsertSettlement(proj.id, { ...draft, ...existing, status: "approved" });
        await actionFeedback("settlement_approved", { sicId: sic.id, projectId: proj.id });
        renderDetail();
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
          await actionFeedback("settlement_paid", { sicId: sic.id, projectId: proj.id });
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
        : projectsTableHtml(`<table class="data-table"><thead><tr><th>Project</th><th>Start</th><th class="cust-col-center">End</th><th class="cust-col-center">Status</th><th class="cust-col-center">Logs</th><th class="cust-col-center">Actions</th></tr></thead><tbody>${rows
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
                <td class="cust-col-center">${escapeHtml(a.endDate || "—")}</td>
                <td class="cust-col-center">${escapeHtml(a.status)}</td>
                <td class="cust-col-center">${logCount}</td>
                <td class="cust-col-center">${endBtn ? `<div class="sic-row-actions">${endBtn}</div>` : ""}</td>
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
              ensureProjectSubs();
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
    if (state.activeTab === "overview") {
      body.appendChild(
        renderOverviewTab(sic, proj, assignments, { materialLogsMonth, laborMonth: laborTotal })
      );
    }
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
    const hash = location.hash?.replace(/^#/, "");
    if (hash) {
      requestAnimationFrame(() => document.getElementById(hash)?.scrollIntoView({ behavior: "smooth", block: "start" }));
    }
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
      ensureProjectSubs();
      render();
    }),
    listenList("siteInChargeAssignments", (rows) => {
      state.assignments = rows;
      ensureProjectSubs();
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
    ensureProjectSubs();
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
