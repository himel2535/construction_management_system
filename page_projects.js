import { create, listenList, listenProjectSub, listenValue, updatePath, removePath } from "./svc_data.js";
import { readRef } from "./svc_tenant.js";

import { getCurrentUserId, getCurrentUserName } from "./svc_auth.js";
import { renderFormField, renderStatusPills, govContractFieldsHtml, buildAgencyOptions } from "./cmp_projectForm.js";
import {
  canTransition,
  milestoneVariance,
  PROJECT_STATUSES,
} from "./svc_workflow.js";
import { formatBDT, formatDate, formatDateRange } from "./util_format.js";
import { showToast } from "./cmp_toast.js";
import { setActiveNav } from "./cmp_layout.js";
import { setPageChrome } from "./cmp_header.js";
import { sectionCard, statusChip, varianceChip } from "./cmp_ui.js";
import { bindR2Subs, buildBoqTab, buildProgressTab, buildResourcesTab } from "./page_projects_r2.js";
import {
  bindR3Subs,
  buildQualityTab,
  buildSafetyTab,
  buildContractsTab,
} from "./page_projects_r3.js";
import {
  bindGovSubs,
  buildContractTab,
  buildDashboardTab,
  buildMeasurementTab,
  buildGovBillingTab,
  buildRetentionTab,
  buildComplianceTab,
  renderGovHomeHealthStrip,
  renderNeedsAttentionBlock,
} from "./page_projects_gov.js";
import {
  bindPrivateSubs,
  buildPrivateContractTab,
  buildPrivateBillingTab,
} from "./page_projects_private.js";
import { bindTeamSubs, buildTeamTab } from "./page_projects_team.js";
import { bindMessagesSubs, buildMessagesTab } from "./page_projects_messages.js";
import { delayCauseLabel, delayCauseOptions } from "./util_milestone.js";
import { isGovProject, PROJECT_TYPES, EMPLOYER_AGENCIES, defaultProjectType } from "./util_govProject.js";
import { setupGovProjectOnCreate } from "./svc_govProject.js";
import { setupPrivateProjectOnCreate, syncProjectProgress } from "./svc_projectSetup.js";
import { syncMilestoneAmounts } from "./svc_privateProject.js";
import {
  enrichProjectList,
  saveProjectWithDetails,
  migrateInlineDetailsIfNeeded,
  saveGovDetail,
  savePrivateDetail,
} from "./svc_projectDetails.js";
import { splitProjectPayload, normalizeProjectType } from "./util_projectDetails.js";
import { getCurrentRole, listRoleUsers, getAssignedProjectIds, workflowButtonsHtml, wireWorkflowButtons as wireGovWorkflowButtons } from "./svc_governance.js";
import {
  DOCUMENT_TYPES,
  requiresExpiry,
  documentDisplayType,
  documentVersion,
  expiryAlertLevel,
  daysUntilExpiry,
} from "./util_projectDocument.js";
import {
  createProjectDocument,
  uploadDocumentRevision,
  listDocumentExpiryAlerts,
} from "./svc_projectDocument.js";
import { RESPONSIBLE_ROLES, roleLabel } from "./util_roles.js";
import { ERP_SELECT_PROJECT_KEY, hasStoredProjectDraft, readGovFieldsFromForm } from "./util_projectForm.js";
import {
  tabsWithGroups,
  groupForTabId,
  renderSidebarProjectItem,
  renderProjectHeader,
  renderGroupedTabNav,
  renderProfileDefinitionList,
  renderProfileDescription,
} from "./cmp_projectHub.js";
import { auditProject, openEditDialog, validateUrl, validatePositiveNumber, renderTabToolbar, resolveManagerLabel } from "./cmp_projectTab.js";
import { computeProjectSupplierOutstanding, mergeSupplierLists } from "./svc_supplier.js";
import { mountPortfolio } from "./cmp_projectPortfolio.js";
import { renderProjectTimeline } from "./cmp_projectTimeline.js";
import { navigateTo, getRouteQuery } from "./util_route.js";

const DRAFT_CHIP_KEY = "proj-draft-chip-dismissed";

function dedupeProjects(projects) {
  const sorted = [...projects].sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
  const seen = new Set();
  const result = [];
  for (const p of sorted) {
    const nameKey = `${(p.name || "").trim().toLowerCase()}|${(p.code || "").trim().toLowerCase()}`;
    if (seen.has(nameKey)) continue;
    seen.add(nameKey);
    result.push(p);
  }
  return result;
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function mountProjects(container) {
  setActiveNav();

  setPageChrome({
    title: "Projects",
    subtitle: "Manage projects, BOQ, progress, and contracts",
    showDateRange: false,
    quickActionLabel: "+ New Project",
    onQuickAction: () => {
      navigateTo("/projects/new");
    },
  });

  const root = document.createElement("div");
  root.className = "projects-page dashboard-page";
  container.appendChild(root);

  const pendingSelectId = (() => {
    const fromStore = sessionStorage.getItem(ERP_SELECT_PROJECT_KEY) || "";
    const params = getRouteQuery();
    const select = params.get("select") || params.get("id");
    if (select) return select;
    return fromStore;
  })();
  const pendingTab = (() => getRouteQuery().get("tab") || "")();
  if (sessionStorage.getItem(ERP_SELECT_PROJECT_KEY)) {
    sessionStorage.removeItem(ERP_SELECT_PROJECT_KEY);
  }

  const state = {
    selectedProjectId: pendingSelectId,
    editProjectId: null,
    activeTab: pendingTab || "home",
    activeTabGroup: "overview",
    filterQuery: "",
    filterStatus: "all",
    filterType: "all",
    projects: [],
    projectsRaw: [],
    phases: [],
    milestones: [],
    documents: [],
    projectMessages: [],
    auditLogs: [],
    boqItems: [],
    projectProgress: [],
    subcontracts: [],
    equipmentLogs: [],
    measurementEntries: [],
    ipcBills: [],
    ipcBillLines: [],
    retentionLedger: [],
    eotRequests: [],
    suppliers: [],
    vendors: [],
    supplierBills: [],
    dashboardDateFrom: "",
    dashboardDateTo: "",
    milestonesByProject: {},
    govComplianceChecklist: [],
    ipcBillFilter: "all",
  };

  let projectForm = null;
  let tabHost = null;
  let listHost = null;

  function parseNestedByProject(root) {
    const out = {};
    if (!root || typeof root !== "object") return out;
    for (const [pid, bucket] of Object.entries(root)) {
      if (!bucket || typeof bucket !== "object") continue;
      out[pid] = Object.entries(bucket).map(([id, row]) => ({ id, ...row }));
    }
    return out;
  }

  const getSelected = () => state.projects.find((p) => p.id === state.selectedProjectId);

  const filteredProjects = () => {
    let list = dedupeProjects(state.projects);
    if (state.filterType !== "all") {
      list = list.filter((p) => (p.projectType || defaultProjectType()) === state.filterType);
    }
    if (state.filterStatus !== "all") {
      list = list.filter((p) => (p.status || "ongoing") === state.filterStatus);
    }
    const q = state.filterQuery.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (p) =>
          (p.name && p.name.toLowerCase().includes(q)) ||
          (p.code && p.code.toLowerCase().includes(q)) ||
          (p.location && p.location.toLowerCase().includes(q))
      );
    }
    const assigned = getAssignedProjectIds(getCurrentUserId(), getCurrentRole());
    if (assigned !== null) {
      list = list.filter((p) => assigned.includes(p.id));
    }
    return list.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
  };

  function renderPortfolioMain() {
    const wrap = document.createElement("div");
    wrap.className = "proj-portfolio-main card section-card";
    wrap.innerHTML = `<div class="section-card-head"><div><h3 class="section-title">Projects portfolio</h3><p class="section-sub">All projects matching sidebar filters</p></div></div><div class="section-card-body" id="proj-portfolio-host"></div>`;
    const host = wrap.querySelector("#proj-portfolio-host");
    mountPortfolio(host, filteredProjects(), state.milestonesByProject, {
      emptyMessage: "No projects match your filters",
    });
    return wrap;
  };

  function renderProjectList() {
    if (!listHost) return;
    const list = filteredProjects();
    const showDraftChip = hasStoredProjectDraft() && sessionStorage.getItem(DRAFT_CHIP_KEY) !== "1";
    listHost.innerHTML = `
      ${showDraftChip ? `<div class="proj-draft-chip"><span>Draft saved</span><a href="/projects/new" class="proj-draft-chip-link">Resume</a><button type="button" class="proj-draft-chip-dismiss" aria-label="Dismiss">×</button></div>` : ""}
      <div class="proj-list-head">
        <input type="search" class="toolbar-input proj-search" id="proj-search" placeholder="Search name or code..." value="${escapeHtml(state.filterQuery)}" />
        <select class="toolbar-select" id="proj-status-filter">
          <option value="all">All statuses</option>
          ${PROJECT_STATUSES.map((s) => `<option value="${s}" ${state.filterStatus === s ? "selected" : ""}>${s}</option>`).join("")}
        </select>
      </div>
      <div class="proj-type-chips" role="group" aria-label="Project type">
        <button type="button" class="proj-type-chip${state.filterType === "all" ? " is-active" : ""}" data-type="all">All</button>
        ${PROJECT_TYPES.map((t) => `<button type="button" class="proj-type-chip${state.filterType === t.id ? " is-active" : ""}" data-type="${t.id}">${escapeHtml(t.label)}</button>`).join("")}
      </div>
      <div class="proj-list-items"></div>
    `;
    const itemsEl = listHost.querySelector(".proj-list-items");
    if (!list.length) {
      const assigned = getAssignedProjectIds(getCurrentUserId(), getCurrentRole());
      const hasGlobal = dedupeProjects(state.projects).length > 0;
      const roleScopedEmpty = assigned !== null && hasGlobal;
      itemsEl.innerHTML = `
        <div class="proj-empty-state">
          <p class="proj-empty">${roleScopedEmpty ? "No projects assigned to your role" : "No projects yet"}</p>
          <p class="proj-empty-sub">${roleScopedEmpty ? "Ask your project manager or admin to assign you to a project." : "Create a project to manage BOQ, sales, and progress."}</p>
          ${roleScopedEmpty ? "" : `<a href="/projects/new" class="btn btn-primary btn-sm proj-create-link">${hasStoredProjectDraft() ? "Resume draft" : "Create your first project"}</a>`}
        </div>
      `;
      return;
    }
    const countEl = root.querySelector("#proj-sidebar-count");
    if (countEl) countEl.textContent = String(list.length);

    for (const p of list) {
      const div = renderSidebarProjectItem(p, state.selectedProjectId === p.id, {
        milestones: state.milestonesByProject[p.id] || [],
      });
      div.onclick = () => {
        state.selectedProjectId = p.id;
        state.editProjectId = null;
        bindProjectSubs();
        renderProjectList();
        renderTabContent();
      };
      itemsEl.appendChild(div);
    }
    listHost.querySelector("#proj-search").oninput = (e) => {
      state.filterQuery = e.target.value;
      renderProjectList();
    };
    listHost.querySelector("#proj-status-filter").onchange = (e) => {
      state.filterStatus = e.target.value;
      renderProjectList();
    };
    listHost.querySelector(".proj-draft-chip-dismiss")?.addEventListener("click", () => {
      sessionStorage.setItem(DRAFT_CHIP_KEY, "1");
      renderProjectList();
    });
    listHost.querySelectorAll(".proj-type-chip").forEach((btn) => {
      btn.addEventListener("click", () => {
        state.filterType = btn.dataset.type || "all";
        renderProjectList();
      });
    });
  }

  function buildMasterTab() {
    const p = getSelected();
    const isEdit = state.editProjectId === state.selectedProjectId && p;
    const card = sectionCard(
      isEdit ? "Edit project" : state.selectedProjectId ? "Project details" : "Project master",
      isEdit
        ? "Update project information"
        : state.selectedProjectId
          ? ""
          : "Select a project from the list or create a new one"
    );
    const body = card.querySelector(".section-card-body");

    if (!state.selectedProjectId && !state.editProjectId) {
      body.innerHTML = `
        <p class="proj-empty">Select a project from the sidebar, or create a new project.</p>
        <a href="/projects/new" class="btn btn-primary btn-sm">${hasStoredProjectDraft() ? "Resume draft" : "Create project"}</a>
      `;
      return card;
    }

    if (p && !isEdit) {
      const extras = [];
      if (isGovProject(p)) {
        if (p.employerAgency) extras.push({ label: "Employer agency", value: p.employerAgency, icon: "landmark" });
        if (p.tenderRef) extras.push({ label: "Tender ref", value: p.tenderRef, icon: "fileText" });
        if (p.workOrderNo) extras.push({ label: "Work order", value: p.workOrderNo, icon: "fileText" });
      }
      if (!isGovProject(p)) {
        const boqCount = state.boqItems.filter(
          (b) => !b.projectId || b.projectId === p.id
        ).length;
        extras.push({
          label: "BOQ lines",
          value: String(boqCount),
          icon: "fileText",
        });
      }
      body.appendChild(renderProfileDefinitionList([
        { label: "Client", value: p.clientName || "—" },
        { label: "Project manager", value: resolveManagerLabel(p.projectManagerId) },
        ...extras,
      ]));
      const desc = renderProfileDescription(p.description);
      if (desc) body.appendChild(desc);
      return card;
    }

    projectForm = document.createElement("form");
    projectForm.className = "form-grid proj-form";
    buildMasterForm(projectForm, p);
    body.appendChild(projectForm);
    wireProjectForm(projectForm, p);
    return card;
  }

  function escAttr(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/"/g, "&quot;")
      .replace(/</g, "&lt;");
  }

  function buildMasterForm(form, p = null) {
    const typeOpts = PROJECT_TYPES.map(
      (t) => `<option value="${t.id}" ${(p?.projectType || defaultProjectType()) === t.id ? "selected" : ""}>${t.label}</option>`
    ).join("");

    form.appendChild(
      renderFormField(
        "name",
        "Project name *",
        `<input name="name" required value="${escAttr(p?.name || "")}" />`
      )
    );
    form.appendChild(
      renderFormField("projectType", "Project type", `<select name="projectType">${typeOpts}</select>`)
    );
    form.appendChild(
      renderFormField("code", "Project code", `<input name="code" value="${escAttr(p?.code || "")}" />`)
    );
    form.appendChild(
      renderFormField(
        "location",
        "Location *",
        `<input name="location" required value="${escAttr(p?.location || "")}" />`
      )
    );
    form.appendChild(
      renderFormField(
        "clientName",
        "Client name",
        `<input name="clientName" value="${escAttr(p?.clientName || "")}" />`
      )
    );
    form.appendChild(
      renderFormField("startDate", "Start date", `<input name="startDate" type="date" value="${p?.startDate || ""}" />`)
    );
    form.appendChild(
      renderFormField("endDate", "End date", `<input name="endDate" type="date" value="${p?.endDate || ""}" />`)
    );
    if (!isGovProject(p)) {
      form.appendChild(
        renderFormField(
          "contractValue",
          "Contract value (BDT)",
          `<input name="contractValue" type="number" step="0.01" min="0" value="${p?.contractValue ?? p?.budgetTotal ?? ""}" />`
        )
      );
    }

    const statusWrap = document.createElement("div");
    statusWrap.className = "form-field form-field--full";
    statusWrap.innerHTML = `<span class="form-field-label">Status</span>`;
    statusWrap.appendChild(renderStatusPills(p?.status || "planning"));
    form.appendChild(statusWrap);

    form.appendChild(
      renderFormField(
        "projectManagerId",
        "Project manager",
        `<input name="projectManagerId" type="hidden" value="${escAttr(p?.projectManagerId || getCurrentUserId())}" />
         <input type="text" class="form-field-readonly" readonly value="${escAttr(getCurrentUserName())}" />`
      )
    );
    form.appendChild(
      renderFormField(
        "description",
        "Description",
        `<textarea name="description" rows="3">${escapeHtml(p?.description || "")}</textarea>`,
        { full: true }
      )
    );

    if (isGovProject(p)) {
      const govWrap = document.createElement("div");
      govWrap.className = "form-field form-field--full proj-gov-fields";
      govWrap.innerHTML = govContractFieldsHtml(buildAgencyOptions(p?.employerAgency), p || {});
      form.appendChild(govWrap);
    }

    const actions = document.createElement("div");
    actions.className = "form-actions form-field--full";
    actions.innerHTML = `
      <button type="submit" class="btn btn-primary">${p ? "Save project" : "Create project"}</button>
      ${p ? '<button type="button" class="btn btn-dark" id="proj-cancel-edit">Cancel</button>' : ""}
    `;
    form.appendChild(actions);
  }

  function wireProjectForm(form, existing) {
    form.onsubmit = async (e) => {
      e.preventDefault();
      const now = Date.now();
      const payload = {
        name: form.name.value.trim(),
        projectType: form.projectType.value,
        code: form.code.value.trim(),
        location: form.location.value.trim(),
        clientName: form.clientName.value.trim(),
        startDate: form.startDate.value,
        endDate: form.endDate.value,
        status: form.status.value,
        projectManagerId: form.projectManagerId.value.trim() || getCurrentUserId(),
        description: form.description.value.trim(),
        updatedAt: now,
      };
      if (form.querySelector('[name="employerAgency"]')) {
        Object.assign(payload, readGovFieldsFromForm(form));
        payload.budgetTotal = Number(payload.contractValue) || 0;
      } else if (form.contractValue || form.budgetTotal) {
        payload.contractValue = Number(form.contractValue?.value ?? form.budgetTotal?.value) || 0;
        payload.budgetTotal = payload.contractValue;
      }
      if (!payload.name || !payload.location) {
        showToast("Name and location are required", "error");
        return;
      }
      try {
        if (existing) {
          await migrateInlineDetailsIfNeeded(existing.id);
          await saveProjectWithDetails(existing.id, payload, { existing });
          if (!isGovProject(payload)) {
            await syncMilestoneAmounts(existing.id);
          }
          await auditProject(state, {
            entityType: "project",
            entityId: existing.id,
            action: "update",
            diffSummary: `Updated project ${payload.name}`,
          });
          state.editProjectId = null;
          showToast("Project saved");
        } else {
          const { base, govDetail, privateDetail } = splitProjectPayload(payload);
          const { type, projectType } = normalizeProjectType(base);
          const id = await create("projects", {
            ...base,
            type,
            projectType,
            createdAt: now,
            createdBy: getCurrentUserId(),
            updatedAt: now,
          });
          if (govDetail) await saveGovDetail(id, govDetail, { audit: false });
          if (privateDetail) await savePrivateDetail(id, privateDetail, { audit: false });
          if (projectType === "government_civil") {
            await setupGovProjectOnCreate(id);
          } else {
            await setupPrivateProjectOnCreate(id);
          }
          await auditProject(state, {
            entityType: "project",
            entityId: id,
            action: "create",
            diffSummary: `Created project ${payload.name}`,
          });
          state.selectedProjectId = id;
          form.reset();
          showToast("Project created");
        }
      } catch (err) {
        showToast(err.message, "error");
      }
    };
    form.querySelector("#proj-cancel-edit")?.addEventListener("click", () => {
      state.editProjectId = null;
      renderTabContent();
    });
  }

  function buildPhasesTab() {
    const card = sectionCard("Phases / Blocks", "Project structure baseline");
    const body = card.querySelector(".section-card-body");
    if (!state.selectedProjectId) {
      body.innerHTML = `<p class="proj-empty">Select a project first</p>`;
      return card;
    }
    const form = document.createElement("form");
    form.className = "form-grid proj-form-inline";
    form.innerHTML = `
      <input name="name" placeholder="Phase name *" required />
      <input name="sequence" type="number" placeholder="Sequence" value="1" />
      <input name="plannedStart" type="date" />
      <input name="plannedEnd" type="date" />
      <select name="status">
        <option value="draft">draft</option>
        <option value="submitted">submitted</option>
        <option value="approved">approved</option>
      </select>
      <button type="submit" class="btn btn-primary btn-sm">Add phase</button>
    `;
    const list = document.createElement("div");
    list.className = "proj-phase-list";
    const sorted = [...state.phases].sort((a, b) => (a.sequence || 0) - (b.sequence || 0));
    if (!sorted.length) list.innerHTML = `<p class="proj-empty">No phases yet</p>`;
    else {
      list.innerHTML = sorted
        .map(
          (ph) => `
        <div class="proj-phase-row">
          <div><strong>${escapeHtml(ph.name)}</strong> <span class="text-muted">#${ph.sequence || 0}</span></div>
          <div>${statusChip(ph.status || "draft")}</div>
          <div class="text-muted">${escapeHtml(ph.plannedStart || "—")} — ${escapeHtml(ph.plannedEnd || "—")}</div>
          ${workflowButtons("phase", ph, `projectPhases/${state.selectedProjectId}/${ph.id}`)}
          <div class="proj-row-actions">
            <button type="button" class="btn btn-ghost btn-sm phase-edit-btn" data-id="${ph.id}">Edit</button>
            ${(ph.status || "draft") === "draft" ? `<button type="button" class="btn btn-ghost btn-sm phase-del-btn" data-id="${ph.id}">Delete</button>` : ""}
          </div>
        </div>`
        )
        .join("");
    }
    body.append(form, list);

    form.onsubmit = async (e) => {
      e.preventDefault();
      const now = Date.now();
      try {
        const id = await create(`projectPhases/${state.selectedProjectId}`, {
          name: form.name.value.trim(),
          sequence: Number(form.sequence.value) || 1,
          plannedStart: form.plannedStart.value,
          plannedEnd: form.plannedEnd.value,
          status: form.status.value,
          createdAt: now,
          updatedAt: now,
        });
        await auditProject(state, {
          entityType: "phase",
          entityId: id,
          action: "create",
          diffSummary: `Phase ${form.name.value} created`,
        });
        form.reset();
        showToast("Phase added");
      } catch (err) {
        showToast(err.message, "error");
      }
    };
    wireWorkflowButtons(list, "phase");
    list.querySelectorAll(".phase-edit-btn").forEach((btn) => {
      btn.onclick = () => {
        const ph = sorted.find((x) => x.id === btn.dataset.id);
        if (!ph) return;
        openEditDialog(
          "Edit phase",
          [
            { name: "name", label: "Phase name *", required: true },
            { name: "sequence", label: "Sequence", type: "number" },
            { name: "plannedStart", label: "Start date", type: "date" },
            { name: "plannedEnd", label: "End date", type: "date" },
          ],
          ph,
          async (vals) => {
            await updatePath(`projectPhases/${state.selectedProjectId}/${ph.id}`, {
              ...ph,
              name: String(vals.name).trim(),
              sequence: Number(vals.sequence) || 1,
              plannedStart: vals.plannedStart || "",
              plannedEnd: vals.plannedEnd || "",
            });
            showToast("Phase updated");
          }
        );
      };
    });
    list.querySelectorAll(".phase-del-btn").forEach((btn) => {
      btn.onclick = async () => {
        if (!confirm("Delete this draft phase?")) return;
        try {
          await removePath(`projectPhases/${state.selectedProjectId}/${btn.dataset.id}`);
          showToast("Phase removed");
        } catch (err) {
          showToast(err.message, "error");
        }
      };
    });
    return card;
  }

  function workflowButtons(entityType, row, path) {
    const st = row.status || "draft";
    const btns = [];
    if (canTransition(st, "submitted")) btns.push(`<button type="button" class="btn btn-ghost btn-sm wf-btn" data-path="${path}" data-to="submitted" data-entity="${entityType}" data-id="${row.id}">Submit</button>`);
    if (canTransition(st, "approved")) btns.push(`<button type="button" class="btn btn-ghost btn-sm wf-btn" data-path="${path}" data-to="approved" data-entity="${entityType}" data-id="${row.id}">Approve</button>`);
    if (canTransition(st, "rejected")) btns.push(`<button type="button" class="btn btn-ghost btn-sm wf-btn" data-path="${path}" data-to="rejected" data-entity="${entityType}" data-id="${row.id}">Reject</button>`);
    if (canTransition(st, "closed")) btns.push(`<button type="button" class="btn btn-ghost btn-sm wf-btn" data-path="${path}" data-to="closed" data-entity="${entityType}" data-id="${row.id}">Close</button>`);
    if (canTransition(st, "draft") && st === "rejected") btns.push(`<button type="button" class="btn btn-ghost btn-sm wf-btn" data-path="${path}" data-to="draft" data-entity="${entityType}" data-id="${row.id}">Reopen</button>`);
    return btns.length ? `<div class="wf-actions">${btns.join("")}</div>` : "";
  }

  function wireMilestoneWorkflow(host) {
    host.querySelectorAll(".wf-btn").forEach((btn) => {
      btn.onclick = async () => {
        const path = btn.dataset.path;
        const to = btn.dataset.to;
        const cur = readRef(path) || {};
        const from = cur.workflowStatus || "draft";
        if (!canTransition(from, to)) {
          showToast("Invalid status transition", "error");
          return;
        }
        const now = Date.now();
        const patch = { workflowStatus: to, updatedAt: now };
        if (to === "submitted") {
          patch.submittedBy = getCurrentUserId();
          patch.submittedAt = now;
        }
        if (to === "approved") {
          patch.approvedBy = getCurrentUserId();
          patch.approvedAt = now;
        }
        await updatePath(path, { ...cur, ...patch });
        await auditProject(state, {
          entityType: "milestone",
          entityId: btn.dataset.id,
          action: "status_change",
          diffSummary: `${cur.title || btn.dataset.id}: ${from} → ${to}`,
        });
        showToast(`Approval: ${to}`);
      };
    });
  }

  function wireWorkflowButtons(host, entityType) {
    host.querySelectorAll(".wf-btn").forEach((btn) => {
      btn.onclick = async () => {
        const path = btn.dataset.path;
        const to = btn.dataset.to;
        const cur = readRef(path) || {};
        if (!canTransition(cur.status, to)) {
          showToast("Invalid status transition", "error");
          return;
        }
        const now = Date.now();
        const patch = { status: to, updatedAt: now };
        if (to === "submitted") {
          patch.submittedBy = getCurrentUserId();
          patch.submittedAt = now;
        }
        if (to === "approved") {
          patch.approvedBy = getCurrentUserId();
          patch.approvedAt = now;
        }
        await updatePath(path, { ...cur, ...patch });
        await auditProject(state, {
          entityType,
          entityId: btn.dataset.id,
          action: "status_change",
          diffSummary: `${cur.name || cur.title || btn.dataset.id}: ${cur.status} → ${to}`,
        });
        showToast(`Status: ${to}`);
      };
    });
  }

  function buildMilestonesTab() {
    const card = sectionCard("Milestones", "Planning baseline with owner, role, and deadline");
    const body = card.querySelector(".section-card-body");
    if (!state.selectedProjectId) {
      body.innerHTML = `<p class="proj-empty">Select a project first</p>`;
      return card;
    }
    const phaseOpts = state.phases
      .map((ph) => `<option value="${ph.id}">${escapeHtml(ph.name)}</option>`)
      .join("");
    const roleUsers = listRoleUsers();
    const roleOpts = RESPONSIBLE_ROLES.map(
      (r) => `<option value="${r}">${escapeHtml(roleLabel(r))}</option>`
    ).join("");
    const userOpts = roleUsers
      .map(
        (u) =>
          `<option value="${u.id}">${escapeHtml(u.displayName || u.email || u.id)} (${escapeHtml(roleLabel(u.role))})</option>`
      )
      .join("");
    const defaultOwner = getCurrentUserId();
    const dependsOpts = state.milestones
      .map((m) => `<option value="${m.id}">${escapeHtml(m.title)}</option>`)
      .join("");
    const form = document.createElement("form");
    form.className = "form-grid proj-form";
    form.innerHTML = `
      <input name="title" placeholder="Milestone title *" required />
      <select name="phaseId"><option value="">No phase</option>${phaseOpts}</select>
      <label>Deadline <input name="plannedDate" type="date" required /></label>
      <select name="dependsOnId" aria-label="Depends on milestone">
        <option value="">Depends on (optional)</option>
        ${dependsOpts}
      </select>
      <select name="responsibleRole" aria-label="Responsible role">
        <option value="">Responsible role</option>
        ${roleOpts}
      </select>
      <select name="ownerId" aria-label="Assigned user">
        <option value="">Assigned user</option>
        ${userOpts}
      </select>
      <input name="actualDate" type="date" />
      <select name="status">
        <option value="pending">pending</option>
        <option value="in_progress">in_progress</option>
        <option value="completed">completed</option>
      </select>
      <input name="remarks" placeholder="Remarks" />
      <button type="submit" class="btn btn-primary btn-sm">Add milestone</button>
    `;
    if (form.ownerId && !form.ownerId.value) form.ownerId.value = defaultOwner;
    const tableHost = document.createElement("div");
    tableHost.className = "table-wrap";
    body.append(form, tableHost);

    const userName = (id) => roleUsers.find((u) => u.id === id)?.displayName || id || "—";

    const rows = state.milestones.map((m) => {
      const v = milestoneVariance(m);
      const phase = state.phases.find((p) => p.id === m.phaseId);
      return {
        ...m,
        _phase: phase?.name || "—",
        _variance: varianceChip(v.key, v.label),
        _owner: userName(m.ownerId),
        _role: m.responsibleRole ? roleLabel(m.responsibleRole) : "—",
        _delayCause: m.delayCause ? `<span class="chip delay-cause--${escapeHtml(m.delayCause)}">${escapeHtml(delayCauseLabel(m.delayCause))}</span>` : "—",
      };
    });

    tableHost.innerHTML = `
      <table class="dash-table">
        <thead><tr><th>Milestone</th><th>Phase</th><th>Deadline</th><th>Owner</th><th>Role</th><th>Variance</th><th>Delay cause</th><th>Status</th><th>Approval</th><th></th></tr></thead>
        <tbody>
          ${rows.length ? rows.map((m) => {
            const wfPath = `projectMilestones/${state.selectedProjectId}/${m.id}`;
            const wfRow = { ...m, status: m.workflowStatus || "draft" };
            return `
            <tr>
              <td><strong>${escapeHtml(m.title)}</strong></td>
              <td>${escapeHtml(m._phase)}</td>
              <td>${m.plannedDate || "—"}</td>
              <td>${escapeHtml(m._owner)}</td>
              <td>${escapeHtml(m._role)}</td>
              <td>${m._variance}</td>
              <td>${m._delayCause}</td>
              <td>${statusChip(m.status)}</td>
              <td>${workflowButtons("milestone", wfRow, wfPath)}</td>
              <td><button type="button" class="btn btn-ghost btn-sm ms-edit-btn" data-id="${m.id}">Edit</button></td>
            </tr>`;
          }).join("") : '<tr class="empty-row"><td colspan="10">No milestones</td></tr>'}
        </tbody>
      </table>
    `;

    form.onsubmit = async (e) => {
      e.preventDefault();
      const now = Date.now();
      try {
        const id = await create(`projectMilestones/${state.selectedProjectId}`, {
          title: form.title.value.trim(),
          phaseId: form.phaseId.value,
          plannedDate: form.plannedDate.value,
          actualDate: form.actualDate.value,
          dependsOnId: form.dependsOnId?.value || "",
          status: form.status.value,
          ownerId: form.ownerId.value || defaultOwner,
          responsibleRole: form.responsibleRole.value,
          remarks: form.remarks.value.trim(),
          workflowStatus: "draft",
          createdAt: now,
          updatedAt: now,
        });
        await syncProjectProgress(state.selectedProjectId);
        await auditProject(state, {
          entityType: "milestone",
          entityId: id,
          action: "create",
          diffSummary: `Milestone ${form.title.value}`,
        });
        form.reset();
        if (form.ownerId) form.ownerId.value = defaultOwner;
        showToast("Milestone added");
      } catch (err) {
        showToast(err.message, "error");
      }
    };

    tableHost.querySelectorAll(".ms-edit-btn").forEach((btn) => {
      btn.onclick = () => {
        const m = rows.find((x) => x.id === btn.dataset.id);
        if (!m) return;
        openEditDialog(
          "Edit milestone",
          [
            { name: "title", label: "Title *", required: true },
            { name: "plannedDate", label: "Deadline", type: "date" },
            { name: "actualDate", label: "Actual date", type: "date" },
            {
              name: "responsibleRole",
              label: "Responsible role",
              type: "select",
              options: [{ value: "", label: "—" }, ...RESPONSIBLE_ROLES.map((r) => ({ value: r, label: roleLabel(r) }))],
            },
            {
              name: "ownerId",
              label: "Assigned user",
              type: "select",
              options: [{ value: "", label: "—" }, ...roleUsers.map((u) => ({ value: u.id, label: u.displayName || u.email || u.id }))],
            },
            {
              name: "dependsOnId",
              label: "Depends on",
              type: "select",
              options: [
                { value: "", label: "—" },
                ...state.milestones
                  .filter((x) => x.id !== m.id)
                  .map((x) => ({ value: x.id, label: x.title })),
              ],
            },
            {
              name: "status",
              label: "Status",
              type: "select",
              options: [
                { value: "pending", label: "Pending" },
                { value: "in_progress", label: "In progress" },
                { value: "completed", label: "Completed" },
              ],
            },
            { name: "remarks", label: "Remarks", type: "textarea" },
            {
              name: "delayCause",
              label: "Delay cause",
              type: "select",
              options: delayCauseOptions(),
            },
            { name: "delayNotes", label: "Delay notes", type: "textarea" },
          ],
          m,
          async (vals) => {
            await updatePath(`projectMilestones/${state.selectedProjectId}/${m.id}`, {
              ...m,
              title: String(vals.title).trim(),
              plannedDate: vals.plannedDate || "",
              actualDate: vals.actualDate || "",
              dependsOnId: vals.dependsOnId || "",
              responsibleRole: vals.responsibleRole || "",
              ownerId: vals.ownerId || "",
              status: vals.status,
              remarks: String(vals.remarks || "").trim(),
              delayCause: vals.delayCause || "",
              delayNotes: String(vals.delayNotes || "").trim(),
            });
            await syncProjectProgress(state.selectedProjectId);
            showToast("Milestone updated");
          }
        );
      };
    });
    wireMilestoneWorkflow(tableHost);
    return card;
  }

  function buildTimelineTab() {
    const card = sectionCard("Timeline", "Phase and milestone schedule with dependencies");
    const body = card.querySelector(".section-card-body");
    if (!state.selectedProjectId) {
      body.innerHTML = `<p class="proj-empty">Select a project first</p>`;
      return card;
    }
    const p = getSelected();
    body.appendChild(renderProjectTimeline(p, state.phases, state.milestones));
    return card;
  }

  function buildDocumentsTab() {
    const card = sectionCard("Documents", "Central repository — version control, permits, and approval workflow (§2.8)");
    const body = card.querySelector(".section-card-body");
    if (!state.selectedProjectId) {
      body.innerHTML = `<p class="proj-empty">Select a project first</p>`;
      return card;
    }

    const expiryAlerts = listDocumentExpiryAlerts(state.documents);
    if (expiryAlerts.length) {
      const banner = document.createElement("div");
      banner.className = "doc-expiry-banner";
      banner.innerHTML = expiryAlerts
        .map(({ doc, level }) => {
          const cls = level === "critical" ? "doc-expiry-critical" : "doc-expiry-warn";
          const days = daysUntilExpiry(doc.expiryDate);
          const msg =
            level === "critical"
              ? `${escapeHtml(doc.title)} expired`
              : `${escapeHtml(doc.title)} expires in ${days} day(s)`;
          return `<div class="doc-expiry-chip ${cls}">${msg}</div>`;
        })
        .join("");
      body.appendChild(banner);
    }

    const form = document.createElement("form");
    form.className = "form-grid proj-form doc-form";
    form.innerHTML = `
      <input name="title" placeholder="Document title *" required />
      <select name="type" aria-label="Document type">
        ${DOCUMENT_TYPES.map((t) => `<option value="${t}">${t}</option>`).join("")}
      </select>
      <input name="fileUrl" placeholder="File URL (link)" />
      <input name="expiryDate" type="date" class="doc-expiry-field" hidden aria-label="Expiry date" />
      <button type="submit" class="btn btn-primary btn-sm">Add document</button>
    `;
    const typeSel = form.type;
    const expiryField = form.expiryDate;
    const syncExpiryField = () => {
      const show = requiresExpiry(typeSel.value);
      expiryField.hidden = !show;
      expiryField.required = show;
    };
    typeSel.onchange = syncExpiryField;
    syncExpiryField();

    const list = document.createElement("div");
    list.className = "table-wrap doc-table-wrap";
    const docs = state.documents || [];
    list.innerHTML = `
      <table class="dash-table">
        <thead><tr>
          <th>Title</th><th>Type</th><th>Ver</th><th>Expiry</th><th>File</th><th>Status</th><th>Actions</th>
        </tr></thead>
        <tbody>
          ${docs.length ? docs.map((d) => {
            const path = `projectDocuments/${state.selectedProjectId}/${d.id}`;
            const dtype = documentDisplayType(d);
            const ver = documentVersion(d);
            const expLvl = requiresExpiry(dtype) ? expiryAlertLevel(d.expiryDate) : null;
            const expCell = d.expiryDate
              ? `<span class="doc-expiry-chip doc-expiry-${expLvl || "ok"}">${formatDate(d.expiryDate)}</span>`
              : "—";
            const link = d.fileUrl
              ? `<a href="${escapeHtml(d.fileUrl)}" target="_blank" rel="noopener">Open</a>`
              : '<span class="text-muted">—</span>';
            const hist = Array.isArray(d.revisionHistory) ? d.revisionHistory : [];
            const histRow = hist.length
              ? `<tr class="doc-revision-history-row"><td colspan="7">
                  <div class="doc-revision-history">
                    <strong>Revision history</strong>
                    <ul>${hist.map((h) => `<li>v${h.version} ${escapeHtml(h.revisionLabel || "")} — ${escapeHtml(h.fileUrl || "no file")}</li>`).join("")}</ul>
                  </div>
                </td></tr>`
              : "";
            return `<tr data-doc-id="${d.id}">
              <td><strong>${escapeHtml(d.title)}</strong><br><small class="text-muted">${escapeHtml(d.revision || `Rev ${ver}`)}</small></td>
              <td>${escapeHtml(dtype)}</td>
              <td>${ver}</td>
              <td>${expCell}</td>
              <td>${link}</td>
              <td>${statusChip(d.status || "draft")}</td>
              <td class="proj-row-actions-cell">
                ${workflowButtonsHtml(d, path, "document")}
                <button type="button" class="btn btn-ghost btn-sm doc-rev-btn" data-id="${d.id}">New revision</button>
              </td>
            </tr>${histRow}`;
          }).join("") : '<tr class="empty-row"><td colspan="7">No documents</td></tr>'}
        </tbody>
      </table>
    `;

    body.append(form, list);

    form.onsubmit = async (e) => {
      e.preventDefault();
      const fileUrl = form.fileUrl.value.trim();
      const urlCheck = validateUrl(fileUrl);
      if (!urlCheck.ok) {
        showToast(urlCheck.message, "error");
        return;
      }
      try {
        await createProjectDocument({
          projectId: state.selectedProjectId,
          title: form.title.value.trim(),
          type: form.type.value,
          fileUrl,
          expiryDate: form.expiryDate.value,
        });
        form.reset();
        syncExpiryField();
        showToast("Document added");
      } catch (err) {
        showToast(err.message, "error");
      }
    };

    wireGovWorkflowButtons(list, (btn) => ({
      projectId: state.selectedProjectId,
      entityType: "document",
      title: docs.find((x) => x.id === btn.dataset.id)?.title,
    }));

    list.querySelectorAll(".doc-rev-btn").forEach((btn) => {
      btn.onclick = () => {
        const doc = docs.find((x) => x.id === btn.dataset.id);
        if (!doc) return;
        openEditDialog(
          "Upload new revision",
          [
            { name: "fileUrl", label: "File URL *", required: true },
            { name: "revisionLabel", label: "Revision label", placeholder: "Rev 2" },
          ],
          { fileUrl: doc.fileUrl || "", revisionLabel: `Rev ${documentVersion(doc) + 1}` },
          async (vals) => {
            const urlCheck = validateUrl(vals.fileUrl);
            if (!urlCheck.ok) {
              showToast(urlCheck.message, "error");
              return;
            }
            await uploadDocumentRevision(state.selectedProjectId, doc.id, {
              fileUrl: vals.fileUrl,
              revisionLabel: vals.revisionLabel,
            });
            showToast("New revision uploaded");
          }
        );
      };
    });

    return card;
  }

  function buildActivityTab() {
    const card = sectionCard("Audit Activity", "Recent changes for this project");
    const body = card.querySelector(".section-card-body");
    const entityLabels = {
      project: "Project",
      unit: "Unit",
      phase: "Phase",
      milestone: "Milestone",
      document: "Document",
      boq: "BOQ",
      progress: "Progress",
      qualityCheck: "Quality",
      safetyIncident: "Safety",
      ncrReport: "NCR",
      changeOrder: "Change order",
      contractClaim: "Claim",
      measurementEntry: "Measurement",
      ipcBill: "IPC bill",
      eotRequest: "EOT",
    };
    const actionLabels = {
      create: "Created",
      update: "Updated",
      status_change: "Status changed",
      contract_update: "Contract updated",
    };
    const logs = state.auditLogs
      .filter((l) => {
        if (!state.selectedProjectId) return true;
        const pid = state.selectedProjectId;
        return l.projectId === pid || l.entityId === pid;
      })
      .sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0))
      .slice(0, 50);
    if (!logs.length) {
      body.innerHTML = `<p class="proj-empty">No audit entries for this project yet</p>`;
      return card;
    }
    body.innerHTML = `
      <ul class="proj-audit-list">
        ${logs
          .map(
            (l) => `
          <li>
            <span class="proj-audit-action">${escapeHtml(actionLabels[l.action] || l.action)}</span>
            <span class="proj-audit-entity">${escapeHtml(entityLabels[l.entityType] || l.entityType)}</span>
            <p>${escapeHtml(l.diffSummary || "")}</p>
            <time>${formatDate(l.timestamp)}</time>
          </li>`
          )
          .join("")}
      </ul>
    `;
    return card;
  }

  function buildProfileDefItems(p) {
    const timeline = formatDateRange(p.startDate, p.endDate);
    const items = [
      { label: "Client", value: p.clientName || "—" },
      { label: "Project manager", value: resolveManagerLabel(p.projectManagerId) },
      { label: "Timeline", value: timeline },
    ];
    if (isGovProject(p)) {
      items.push(
        { label: "Employer agency", value: p.employerAgency || "—" },
        { label: "Tender ref", value: p.tenderRef || "—" },
        { label: "Work order", value: p.workOrderNo || "—" }
      );
    } else {
      const boqCount = state.boqItems.filter(
        (b) => !b.projectId || b.projectId === p.id
      ).length;
      items.push({
        label: "BOQ lines",
        value: String(boqCount),
      });
    }
    return items;
  }

  function renderRecentActivityBlock(limit = 5) {
    const entityLabels = {
      project: "Project",
      unit: "Unit",
      phase: "Phase",
      milestone: "Milestone",
      document: "Document",
      boq: "BOQ",
      progress: "Progress",
      qualityCheck: "Quality",
      safetyIncident: "Safety",
      ncrReport: "NCR",
      changeOrder: "Change order",
      contractClaim: "Claim",
      measurementEntry: "Measurement",
      ipcBill: "IPC bill",
      eotRequest: "EOT",
    };
    const actionLabels = {
      create: "Created",
      update: "Updated",
      status_change: "Status changed",
      contract_update: "Contract updated",
    };
    const logs = state.auditLogs
      .filter((l) => {
        if (!state.selectedProjectId) return false;
        const pid = state.selectedProjectId;
        return l.projectId === pid || l.entityId === pid;
      })
      .sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0))
      .slice(0, limit);

    const section = document.createElement("div");
    section.className = "proj-home-activity";
    section.innerHTML = `<h4 class="proj-home-section-title">Recent activity</h4>`;
    if (!logs.length) {
      section.innerHTML += `<p class="proj-empty">No activity yet</p>`;
      return section;
    }
    section.innerHTML += `
      <ul class="proj-audit-list proj-audit-list--compact">
        ${logs
          .map(
            (l) => `
          <li>
            <span class="proj-audit-action">${escapeHtml(actionLabels[l.action] || l.action)}</span>
            <span class="proj-audit-entity">${escapeHtml(entityLabels[l.entityType] || l.entityType)}</span>
            <p>${escapeHtml(l.diffSummary || "")}</p>
            <time>${formatDate(l.timestamp)}</time>
          </li>`
          )
          .join("")}
      </ul>
    `;
  const viewAll = document.createElement("button");
    viewAll.type = "button";
    viewAll.className = "btn btn-ghost btn-sm proj-home-view-all";
    viewAll.textContent = "View all activity →";
    viewAll.onclick = () => navigateProjectTab("activity");
    section.appendChild(viewAll);
    return section;
  }

  function renderQuickActions(p) {
    const wrap = document.createElement("div");
    wrap.className = "proj-home-actions";
    wrap.innerHTML = `<h4 class="proj-home-section-title">Quick actions</h4>`;
    const actions = document.createElement("div");
    actions.className = "proj-home-action-btns";
    const btns = [
      { label: "Add BOQ line", onclick: () => navigateProjectTab("boq") },
      { label: "Log progress", onclick: () => navigateProjectTab("progress") },
      { label: "New document", onclick: () => navigateProjectTab("documents") },
    ];
    for (const b of btns) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "btn btn-ghost btn-sm";
      btn.textContent = b.label;
      btn.onclick = b.onclick;
      actions.appendChild(btn);
    }
    wrap.appendChild(actions);
    return wrap;
  }

  function renderNonGovHealthStrip(p) {
    const pid = p.id;
    const boqCount = state.boqItems.filter((b) => !b.projectId || b.projectId === pid).length;
    const phases = state.phases.filter((ph) => !ph.projectId || ph.projectId === pid).length;
    const docs = state.documents.length;
    const strip = document.createElement("div");
    strip.className = "proj-home-health-strip";
    const widgets = [
      { label: "BOQ lines", value: String(boqCount), tab: "boq" },
      { label: "Phases", value: String(phases), tab: "phases" },
      { label: "Documents", value: String(docs), tab: "documents" },
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
      btn.addEventListener("click", () => navigateProjectTab(btn.dataset.tab));
    });
    return strip;
  }

  function buildProjectHomeTab() {
    const p = getSelected();
    const isEdit = state.editProjectId === state.selectedProjectId && p;
    if (isEdit) return buildMasterTab();

    const home = document.createElement("div");
    home.className = "proj-home";
    const grid = document.createElement("div");
    grid.className = "proj-home-grid";

    const glance = document.createElement("section");
    glance.className = "proj-home-col proj-home-glance";
    glance.appendChild(renderTabToolbar("At a glance"));
    glance.appendChild(renderProfileDefinitionList(buildProfileDefItems(p)));
    const desc = renderProfileDescription(p.description, { clamp: true });
    if (desc) glance.appendChild(desc);
    if (isGovProject(p)) {
      const contractLink = document.createElement("button");
      contractLink.type = "button";
      contractLink.className = "btn btn-ghost btn-sm proj-home-contract-link";
      contractLink.textContent = "View contract summary →";
      contractLink.onclick = () => navigateProjectTab("contract");
      glance.appendChild(contractLink);
    }

    const healthCol = document.createElement("section");
    healthCol.className = "proj-home-col proj-home-health";
    if (isGovProject(p)) {
      const health = renderGovHomeHealthStrip(state, navigateProjectTab);
      if (health) healthCol.appendChild(health);
    } else {
      healthCol.appendChild(renderNonGovHealthStrip(p));
    }
    const attention = renderNeedsAttentionBlock(state, p, navigateProjectTab);
    if (attention) healthCol.appendChild(attention);

    const supDue = computeProjectSupplierOutstanding(p.id, state.supplierBills);
    if (supDue > 0) {
      const supBanner = document.createElement("div");
      supBanner.className = "proj-home-supplier-due";
      supBanner.innerHTML = `
        <span>Supplier outstanding: <strong>${formatBDT(supDue)}</strong></span>
        <a href="/suppliers" class="btn btn-ghost btn-sm">View suppliers →</a>
      `;
      healthCol.appendChild(supBanner);
    }

    const nextCol = document.createElement("section");
    nextCol.className = "proj-home-col proj-home-next";
    nextCol.appendChild(renderQuickActions(p));
    nextCol.appendChild(renderRecentActivityBlock());

    grid.append(glance, healthCol, nextCol);
    home.appendChild(grid);
    return home;
  }

  function navigateProjectTab(tabId) {
    state.activeTab = tabId;
    state.activeTabGroup = groupForTabId(tabId);
    renderTabContent();
  }

  function renderTabContent() {
    if (!tabHost) return;
    const p = getSelected();
    const tabList = tabsWithGroups(p);
    if (!tabList.some((t) => t.id === state.activeTab)) {
      state.activeTab = "home";
    }
    state.activeTabGroup = groupForTabId(state.activeTab);
    if (!tabList.some((t) => t.group === state.activeTabGroup)) {
      state.activeTabGroup = tabList[0]?.group || "overview";
    }

    tabHost.innerHTML = "";

    if (p) {
      const workspace = document.createElement("div");
      workspace.className = "proj-workspace";

      const header = renderProjectHeader(p, state, {
        onEdit: () => {
          migrateInlineDetailsIfNeeded(p.id).catch(() => {});
          state.editProjectId = p.id;
          state.activeTab = "home";
          state.activeTabGroup = "overview";
          renderTabContent();
        },
        onKpiNavigate: navigateProjectTab,
      });
      workspace.appendChild(header);

      const tabNav = renderGroupedTabNav(
        tabList,
        state.activeTab,
        state.activeTabGroup,
        ({ tab, group }) => {
          state.activeTab = tab;
          state.activeTabGroup = group;
          renderTabContent();
        }
      );
      workspace.appendChild(tabNav);

      const panel = document.createElement("div");
      panel.className = "proj-tab-panel";
      panel.appendChild(buildActiveTabCard());
      workspace.appendChild(panel);

      tabHost.appendChild(workspace);
      return;
    }

    const empty = renderPortfolioMain();
    tabHost.appendChild(empty);
  }

  function buildActiveTabCard() {

    let card;
    switch (state.activeTab) {
      case "home":
        card = buildProjectHomeTab();
        break;
      case "contract": {
        const proj = state.projects.find((p) => p.id === state.selectedProjectId);
        if (isGovProject(proj)) {
          card = buildContractTab(state, {
            onNavigateTab: navigateProjectTab,
            onEditMaster: () => {
              state.editProjectId = state.selectedProjectId;
              state.activeTab = "home";
              state.activeTabGroup = "overview";
              renderTabContent();
            },
          });
        } else {
          card = buildPrivateContractTab(state, {
            onNavigateTab: navigateProjectTab,
            onRefresh: () => renderTabContent(),
          });
        }
        break;
      }
      case "billing": {
        const projBill = state.projects.find((p) => p.id === state.selectedProjectId);
        card = isGovProject(projBill)
          ? buildGovBillingTab(state, {
              onNavigateTab: navigateProjectTab,
              onRefresh: () => renderTabContent(),
            })
          : buildPrivateBillingTab(state, { onRefresh: () => renderTabContent() });
        break;
      }
      case "dashboard":
        card = buildDashboardTab(state, {
          onNavigateTab: navigateProjectTab,
          onRefresh: () => renderTabContent(),
        });
        break;
      case "measurement":
        card = buildMeasurementTab(state, { onRefresh: () => renderTabContent() });
        break;
      case "retention":
        card = buildRetentionTab(state);
        break;
      case "compliance":
        card = buildComplianceTab(state, { onRefresh: () => renderTabContent() });
        break;
      case "phases":
        card = buildPhasesTab();
        break;
      case "milestones":
        card = buildMilestonesTab();
        break;
      case "timeline":
        card = buildTimelineTab();
        break;
      case "documents":
        card = buildDocumentsTab();
        break;
      case "boq":
        card = buildBoqTab(state);
        break;
      case "progress":
        card = buildProgressTab(state);
        break;
      case "resources":
        card = buildResourcesTab(state);
        break;
      case "team":
        card = buildTeamTab(state, { onRefresh: () => renderTabContent() });
        break;
      case "messages":
        card = buildMessagesTab(state);
        break;
      case "quality":
        card = buildQualityTab(state);
        break;
      case "safety":
        card = buildSafetyTab(state);
        break;
      case "contracts":
        card = buildContractsTab(state);
        break;
      case "activity":
        card = buildActivityTab();
        break;
      default:
        card = buildProjectHomeTab();
    }
    return card;
  }

  function ensureLayout() {
    if (root.querySelector("#proj-list-host")) {
      listHost = root.querySelector("#proj-list-host");
      tabHost = root.querySelector("#proj-tab-host");
      return;
    }
    root.innerHTML = `
      <div class="projects-layout">
        <aside class="proj-sidebar card">
          <div class="card-pad proj-sidebar-head">
            <div class="proj-sidebar-title-row">
              <span class="proj-sidebar-title">Projects</span>
              <span class="proj-sidebar-count" id="proj-sidebar-count">0</span>
            </div>
            <a href="/projects/new" class="btn btn-sm btn-primary proj-sidebar-new">+ New</a>
          </div>
          <div id="proj-list-host"></div>
        </aside>
        <main class="proj-main">
          <div id="proj-tab-host"></div>
        </main>
      </div>
    `;
    listHost = root.querySelector("#proj-list-host");
    tabHost = root.querySelector("#proj-tab-host");
  }

  function render() {
    ensureLayout();
    renderProjectList();
    bindProjectSubs();
    renderTabContent();
  }

  let unsubPhases = () => {};
  let unsubMilestones = () => {};
  let unsubDocs = () => {};
  let unsubR2 = () => {};
  let unsubR3 = () => {};
  let unsubGov = () => {};
  let unsubPrivate = () => {};
  let unsubTeam = () => {};
  let unsubMessages = () => {};

  function bindProjectSubs() {
    unsubPhases();
    unsubMilestones();
    unsubDocs();
    unsubR2();
    unsubR3();
    unsubGov();
    unsubPrivate();
    unsubTeam();
    unsubMessages();
    if (!state.selectedProjectId) {
      state.phases = [];
      state.milestones = [];
      state.documents = [];
      state.boqItems = [];
      state.projectProgress = [];
      state.subcontracts = [];
      state.equipmentLogs = [];
      state.qualityChecks = [];
      state.safetyIncidents = [];
      state.changeOrders = [];
      state.contractClaims = [];
      state.measurementEntries = [];
      state.ipcBills = [];
      state.ipcBillLines = [];
      state.retentionLedger = [];
      state.eotRequests = [];
      state.govComplianceChecklist = [];
      state.paymentMilestones = [];
      state.clientInvoices = [];
      state.teamAssignments = [];
      state.responsibilityTasks = [];
      state.projectMessages = [];
      return;
    }
    unsubGov = bindGovSubs(state, listenProjectSub, () => renderTabContent());
    unsubPrivate = bindPrivateSubs(state, listenProjectSub, listenList, () => renderTabContent());
    unsubTeam = bindTeamSubs(state, listenProjectSub, listenList, () => renderTabContent());
    unsubMessages = bindMessagesSubs(state, listenProjectSub, () => renderTabContent());
    unsubR2 = bindR2Subs(state, listenProjectSub, () => renderTabContent());
    unsubR3 = bindR3Subs(state, listenProjectSub, () => renderTabContent());
    unsubPhases = listenProjectSub(state.selectedProjectId, "projectPhases", (list) => {
      state.phases = list;
      if (["phases", "milestones", "timeline", "home"].includes(state.activeTab)) renderTabContent();
    });
    unsubMilestones = listenProjectSub(state.selectedProjectId, "projectMilestones", (list) => {
      state.milestones = list;
      if (state.activeTab === "milestones" || state.activeTab === "timeline" || state.activeTab === "home") renderTabContent();
    });
    unsubDocs = listenProjectSub(state.selectedProjectId, "projectDocuments", (list) => {
      state.documents = list;
      if (state.activeTab === "documents") renderTabContent();
    });
  }

  ensureLayout();
  getCurrentRole();
  renderProjectList();
  renderTabContent();

  const refreshEnrichedProjects = () => {
    state.projects = enrichProjectList(state.projectsRaw);
    renderProjectList();
    bindProjectSubs();
    renderTabContent();
  };

  const unsubProjects = listenList("projects", (list) => {
    state.projectsRaw = list;
    if (pendingSelectId && list.some((p) => p.id === pendingSelectId)) {
      state.selectedProjectId = pendingSelectId;
      migrateInlineDetailsIfNeeded(pendingSelectId).catch(() => {});
    }
    refreshEnrichedProjects();
  });

  const unsubGovDetails = listenList("governmentProjectDetails", () => {
    if (state.projectsRaw.length) refreshEnrichedProjects();
  });

  const unsubPrivateDetails = listenList("privateProjectDetails", () => {
    if (state.projectsRaw.length) refreshEnrichedProjects();
  });

  const unsubAllMilestones = listenValue("projectMilestones", (root) => {
    state.milestonesByProject = parseNestedByProject(root);
    if (!state.selectedProjectId) renderTabContent();
    renderProjectList();
  });

  const unsubAudit = listenList("auditLogs", (list) => {
    state.auditLogs = list;
    if (state.activeTab === "activity" || state.activeTab === "home") renderTabContent();
  });

  const unsubSuppliers = listenList("suppliers", (list) => {
    state.suppliers = mergeSupplierLists(state.vendors, list);
    if (state.activeTab === "resources" || state.activeTab === "home") renderTabContent();
  });
  const unsubVendors = listenList("vendors", (list) => {
    state.vendors = list;
    state.suppliers = mergeSupplierLists(list, state.suppliers);
    if (state.activeTab === "resources" || state.activeTab === "home") renderTabContent();
  });
  const unsubSupplierBills = listenList("supplierBills", (list) => {
    state.supplierBills = list;
    if (state.activeTab === "home") renderTabContent();
  });

  bindProjectSubs();

  return {
    unmount: () => {
      unsubProjects();
      unsubGovDetails();
      unsubPrivateDetails();
      unsubAllMilestones();
      unsubPhases();
      unsubMilestones();
      unsubDocs();
      unsubR2();
      unsubR3();
      unsubGov();
      unsubPrivate();
      unsubTeam();
      unsubAudit();
      unsubSuppliers();
      unsubVendors();
      unsubSupplierBills();
    },
  };
}
