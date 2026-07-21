import { create } from "./svc_data.js";
import { readRef } from "./svc_tenant.js";
import { getCurrentUserId } from "./svc_auth.js";
import { writeAuditLog } from "./svc_workflow.js";
import { showToast } from "./cmp_toast.js";
import { setActiveNav } from "./cmp_layout.js";
import { setPageChrome } from "./cmp_header.js";
import { getRouteQuery, navigateTo } from "./util_route.js";
import { setupGovProjectOnCreate } from "./svc_govProject.js";
import { setupPrivateProjectOnCreate } from "./svc_projectSetup.js";
import { seedPmTeamAssignment } from "./svc_projectTeam.js";
import {
  saveGovDetail,
  savePrivateDetail,
  saveProjectWithDetails,
  enrichProject,
  migrateInlineDetailsIfNeeded,
} from "./svc_projectDetails.js";
import { splitProjectPayload, normalizeProjectType } from "./util_projectDetails.js";
import { defaultProjectType } from "./util_govProject.js";
import { syncMilestoneAmounts } from "./svc_privateProject.js";
import {
  readProjectForm,
  validateProjectStep,
  suggestProjectCode,
  emptyProjectDraft,
} from "./util_projectForm.js";
import {
  renderTypeCards,
  renderStatusPills,
  showFieldErrors,
  govContractFieldsHtml,
  buildAgencyOptions,
} from "./cmp_projectForm.js";
import { resolveManagerLabel } from "./cmp_projectTab.js";
import { PROJECT_STATUSES } from "./svc_workflow.js";

function getEditIdFromRoute() {
  return getRouteQuery().get("edit") || "";
}

function escapeAttr(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;");
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function projectDraftFromRecord(project) {
  if (!project) return { ...emptyProjectDraft(), projectManagerId: getCurrentUserId() };
  const d = { ...emptyProjectDraft(), ...project };
  d.projectManagerId = project.projectManagerId || getCurrentUserId();
  if (d.projectType === "government_civil") {
    d.budgetTotal = d.contractValue ?? d.budgetTotal ?? "";
  } else {
    d.contractValue = d.contractValue ?? d.budgetTotal ?? "";
    d.budgetTotal = d.contractValue;
  }
  return d;
}

function validateProjectForm(payload) {
  for (const step of [1, 2, 3]) {
    const v = validateProjectStep(step, payload);
    if (!v.ok) return v;
  }
  return { ok: true, message: "", field: null };
}

export function mountProjectCreate(container) {
  setActiveNav();

  const editId = getEditIdFromRoute();
  const isEdit = !!editId;
  let existingProject = null;

  if (isEdit) {
    const base = readRef(`projects/${editId}`);
    if (!base) {
      showToast("Project not found", "error");
      navigateTo("/projects");
      return { unmount: () => {} };
    }
    existingProject = enrichProject(base);
  }

  const initial = isEdit
    ? projectDraftFromRecord(existingProject)
    : { ...emptyProjectDraft(), projectManagerId: getCurrentUserId() };

  setPageChrome({
    title: isEdit ? "Edit Project" : "Add Project",
    subtitle: isEdit
      ? `Updating ${existingProject?.name || "project record"}`
      : "Set up a new private or government construction project.",
    showDateRange: false,
    quickActionLabel: null,
    onQuickAction: null,
  });

  const root = document.createElement("div");
  root.className = "projects-page projects-page--project-form dashboard-page dashboard-mockup";

  const formCard = document.createElement("section");
  formCard.className = "dash-widget dash-widget--client-form card cust-form-card is-focused";

  const formBody = document.createElement("div");
  formBody.className = "dash-widget-body";

  const form = document.createElement("form");
  form.className = "cust-form cust-form--full cust-form--compact";
  form.noValidate = true;

  const statusOptions = PROJECT_STATUSES.map(
    (s) => `<option value="${s}"${initial.status === s ? " selected" : ""}>${escapeHtml(s)}</option>`
  ).join("");

  const pmLabel = resolveManagerLabel(initial.projectManagerId || getCurrentUserId());

  form.innerHTML = `
    <div class="cust-form-shell">
      <div class="cust-form-row cust-form-row--top">
        <h2 class="cust-form-page-title">${isEdit ? "Edit Project" : "Add Project"}</h2>
        <p class="cust-form-page-sub">${isEdit ? "Update project profile, schedule, and contract details." : "Enter project details on one page — same layout as client records."}</p>
      </div>
      <div class="cust-form-row cust-form-row--bottom">
        <div class="cust-form-col cust-form-col--project-type">
          <h3 class="cust-form-section-title">Project details</h3>
          <div class="proj-type-host" id="proj-type-host"></div>
        </div>
        <div class="cust-form-col cust-form-col--project-identity">
          <h3 class="cust-form-section-title">Project info</h3>
          <div class="cust-form-grid cust-form-grid--project-identity">
            <label class="cust-field"><span class="cust-label">Project name *</span><input name="name" required autocomplete="off" value="${escapeAttr(initial.name)}" /></label>
            <label class="cust-field"><span class="cust-label">Project code</span><input name="code" value="${escapeAttr(initial.code)}" /></label>
            <label class="cust-field"><span class="cust-label">Location *</span><input name="location" required value="${escapeAttr(initial.location)}" /></label>
            <label class="cust-field"><span class="cust-label">Client name</span><input name="clientName" value="${escapeAttr(initial.clientName)}" /></label>
            <label class="cust-field proj-form-status"><span class="cust-label">Status</span><select name="status">${statusOptions}</select></label>
          </div>
        </div>
      </div>
      <div class="cust-form-row cust-form-row--project-meta">
        <h3 class="cust-form-section-title">Schedule &amp; team</h3>
        <div class="cust-form-grid cust-form-grid--schedule">
          <label class="cust-field"><span class="cust-label">Start date</span><input name="startDate" type="date" value="${escapeAttr(initial.startDate)}" /></label>
          <label class="cust-field"><span class="cust-label">End date</span><input name="endDate" type="date" value="${escapeAttr(initial.endDate)}" /></label>
          <label class="cust-field" id="proj-contract-field"><span class="cust-label">Contract value (BDT)</span><input name="contractValue" type="number" step="0.01" min="0" value="${escapeAttr(initial.contractValue || initial.budgetTotal || "")}" /></label>
          <label class="cust-field">
            <span class="cust-label">Project manager</span>
            <input name="projectManagerId" type="hidden" value="${escapeAttr(initial.projectManagerId || getCurrentUserId())}" />
            <input type="text" class="form-field-readonly" readonly value="${escapeAttr(pmLabel)}" />
          </label>
        </div>
        <label class="cust-field cust-field--full"><span class="cust-label">Description</span><textarea name="description" rows="3">${escapeHtml(initial.description)}</textarea></label>
      </div>
      <div class="cust-form-row cust-form-row--project-gov" id="proj-gov-section" hidden>
        <h3 class="cust-form-section-title">Government contract</h3>
        <div class="proj-gov-fields" id="proj-gov-fields"></div>
      </div>
      <div class="cust-form-footer">
        <button type="submit" class="btn btn-primary" id="proj-submit">${isEdit ? "Save changes" : "Add project"}</button>
        <a href="/projects" class="btn btn-ghost">Cancel</a>
      </div>
    </div>
  `;

  formBody.appendChild(form);
  formCard.appendChild(formBody);
  root.appendChild(formCard);
  container.appendChild(root);

  const typeHost = form.querySelector("#proj-type-host");
  typeHost.appendChild(
    renderTypeCards(initial.projectType || defaultProjectType(), () => {
      syncGovVisibility();
      syncContractField();
    })
  );

  const govHost = form.querySelector("#proj-gov-fields");
  govHost.innerHTML = govContractFieldsHtml(buildAgencyOptions(initial.employerAgency), initial);

  let codeTouched = isEdit || !!String(initial.code || "").trim();

  function readPayload() {
    return readProjectForm(form, { includeGov: true });
  }

  function syncGovVisibility() {
    const pt =
      form.querySelector('input[name="projectType"]:checked')?.value ||
      form.projectType?.value ||
      defaultProjectType();
    const govSection = form.querySelector("#proj-gov-section");
    if (govSection) govSection.hidden = pt !== "government_civil";
  }

  function syncContractField() {
    const pt =
      form.querySelector('input[name="projectType"]:checked')?.value ||
      form.projectType?.value ||
      defaultProjectType();
    const contractField = form.querySelector("#proj-contract-field");
    const isGov = pt === "government_civil";
    if (contractField) {
      contractField.classList.toggle("proj-schedule-field--muted", isGov);
      const contractInput = contractField.querySelector("input");
      if (contractInput) {
        contractInput.toggleAttribute("disabled", isGov);
        if (isGov) contractInput.removeAttribute("name");
        else contractInput.setAttribute("name", "contractValue");
      }
    }
  }

  const statusWrap = document.createElement("div");
  statusWrap.className = "cust-field cust-field--full proj-form-status";
  statusWrap.innerHTML = `<span class="cust-label">Status</span>`;
  const statusSelect = form.querySelector('[name="status"]');
  if (statusSelect) {
    const parent = statusSelect.closest(".cust-field");
    parent.replaceWith(statusWrap);
    statusWrap.appendChild(
      renderStatusPills(initial.status || "planning", () => {})
    );
  }

  syncGovVisibility();
  syncContractField();

  const nameInput = form.querySelector('[name="name"]');
  const codeInput = form.querySelector('[name="code"]');
  nameInput?.addEventListener("input", () => {
    if (!codeTouched && codeInput) {
      const sug = suggestProjectCode(nameInput.value);
      codeInput.value = sug;
    }
  });
  codeInput?.addEventListener("input", () => {
    codeTouched = true;
  });

  form.onsubmit = async (e) => {
    e.preventDefault();
    const payload = readPayload();
    payload.projectManagerId = payload.projectManagerId || getCurrentUserId();

    const validation = validateProjectForm(payload);
    if (!validation.ok) {
      const errors = {};
      if (validation.field) errors[validation.field] = validation.message;
      showFieldErrors(form, errors);
      showToast(validation.message, "error");
      return;
    }
    showFieldErrors(form, {});

    if (payload.projectType === "government_civil") {
      payload.budgetTotal = Number(payload.contractValue) || 0;
      payload.complianceStatus = payload.complianceStatus || "pending";
    } else {
      payload.contractValue = Number(payload.contractValue) || Number(payload.budgetTotal) || 0;
      payload.budgetTotal = payload.contractValue;
    }

    const submitBtn = form.querySelector("#proj-submit");
    submitBtn.disabled = true;
    submitBtn.textContent = isEdit ? "Saving…" : "Creating…";

    const now = Date.now();

    try {
      if (isEdit) {
        await migrateInlineDetailsIfNeeded(editId);
        await saveProjectWithDetails(editId, payload, { existing: existingProject });
        if (payload.projectType !== "government_civil") {
          await syncMilestoneAmounts(editId);
        }
        await writeAuditLog({
          entityType: "project",
          entityId: editId,
          action: "update",
          diffSummary: `Updated project ${payload.name}`,
        });
        showToast("Project saved");
        navigateTo(`/projects?select=${encodeURIComponent(editId)}&hub=1`);
        return;
      }

      const { base, govDetail, privateDetail } = splitProjectPayload(payload);
      const { type, projectType } = normalizeProjectType(base);

      const id = await create("projects", {
        ...base,
        type,
        projectType,
        progressPercent: 0,
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
      await seedPmTeamAssignment(id, payload.projectManagerId || getCurrentUserId());

      await writeAuditLog({
        entityType: "project",
        entityId: id,
        action: "create",
        diffSummary: `Created project ${payload.name}`,
      });

      showToast("Project created");
      navigateTo(`/projects?select=${encodeURIComponent(id)}&hub=1`);
    } catch (err) {
      showToast(err.message || "Failed to save project", "error");
      submitBtn.disabled = false;
      submitBtn.textContent = isEdit ? "Save changes" : "Add project";
    }
  };

  return { unmount: () => {} };
}
