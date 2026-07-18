import { create } from "./svc_data.js";
import { getCurrentUserId, getCurrentUserName } from "./svc_auth.js";
import { writeAuditLog } from "./svc_workflow.js";
import { showToast } from "./cmp_toast.js";
import { setActiveNav } from "./cmp_layout.js";
import { setPageChrome } from "./cmp_header.js";
import { icon } from "./cmp_icons.js";
import { setupGovProjectOnCreate } from "./svc_govProject.js";
import { setupPrivateProjectOnCreate } from "./svc_projectSetup.js";
import { seedPmTeamAssignment } from "./svc_projectTeam.js";
import { saveGovDetail, savePrivateDetail } from "./svc_projectDetails.js";
import { splitProjectPayload, normalizeProjectType } from "./util_projectDetails.js";
import { defaultProjectType } from "./util_govProject.js";
import {
  readProjectFormPatch,
  readProjectFormFromState,
  validateProjectStep,
  suggestProjectCode,
  ERP_SELECT_PROJECT_KEY,
  loadProjectDraftEnvelope,
  saveProjectDraftEnvelope,
  clearProjectDraft,
  hasMeaningfulProjectDraft,
  emptyProjectDraft,
  WIZARD_STEPS,
  GOV_CONTRACT_FIELD_NAMES,
} from "./util_projectForm.js";
import {
  renderBreadcrumb,
  renderStepIndicator,
  renderTypeCards,
  renderFormField,
  renderStatusPills,
  renderLivePreview,
  renderReviewSummary,
  showFieldErrors,
  govContractFieldsHtml,
  buildAgencyOptions,
} from "./cmp_projectForm.js";

function splitEnvelope(envelope) {
  const { step, codeTouched, updatedAt, ...fields } = envelope;
  return {
    draft: {
      ...emptyProjectDraft(),
      ...fields,
      projectManagerId: fields.projectManagerId || getCurrentUserId(),
    },
    step: Math.min(3, Math.max(1, Number(step) || 1)),
    codeTouched: !!codeTouched,
  };
}

export function mountProjectCreate(container) {
  setActiveNav();

  setPageChrome({
    title: "Create Project",
    subtitle: "Set up a new private or government construction project",
    showDateRange: false,
    quickActionLabel: null,
    onQuickAction: null,
  });

  const loaded = splitEnvelope(loadProjectDraftEnvelope());
  let draft = loaded.draft;
  let step = loaded.step;
  let codeTouched = loaded.codeTouched;

  const root = document.createElement("div");
  root.className = "project-create-page dashboard-page";

  const bannerHost = document.createElement("div");
  bannerHost.className = "draft-resume-banner-host";
  root.appendChild(bannerHost);

  const topBar = document.createElement("div");
  topBar.className = "project-create-top";
  topBar.appendChild(renderBreadcrumb());
  const cancelTop = document.createElement("a");
  cancelTop.href = "#/projects";
  cancelTop.className = "btn btn-ghost btn-sm project-create-cancel-top";
  cancelTop.textContent = "Cancel";
  topBar.appendChild(cancelTop);
  root.appendChild(topBar);

  const stepperHost = document.createElement("div");
  stepperHost.className = "project-create-stepper-host";
  root.appendChild(stepperHost);

  const layout = document.createElement("div");
  layout.className = "project-create-layout";

  const mainCol = document.createElement("div");
  mainCol.className = "project-create-main";

  const stepCard = document.createElement("div");
  stepCard.className = "card project-create-step-card";
  const stepHead = document.createElement("div");
  stepHead.className = "project-create-step-head";
  const stepTitle = document.createElement("h2");
  stepTitle.className = "project-create-step-title";
  const stepSub = document.createElement("p");
  stepSub.className = "project-create-step-sub";
  stepHead.append(stepTitle, stepSub);
  stepCard.appendChild(stepHead);

  const form = document.createElement("form");
  form.className = "project-create-form";
  form.noValidate = true;
  const stepPanels = document.createElement("div");
  stepPanels.className = "project-create-panels";
  form.appendChild(stepPanels);
  stepCard.appendChild(form);
  mainCol.appendChild(stepCard);
  layout.appendChild(mainCol);

  const previewHost = document.createElement("div");
  previewHost.className = "project-create-preview-host";
  layout.appendChild(previewHost);
  root.appendChild(layout);

  const footer = document.createElement("div");
  footer.className = "wizard-footer";
  footer.innerHTML = `
    <button type="button" class="btn btn-dark" id="wizard-back">${icon("chevronLeft", { size: 18, className: "icon" })} Back</button>
    <div class="wizard-footer-right">
      <button type="button" class="btn btn-primary" id="wizard-next">Continue ${icon("chevronRight", { size: 18, className: "icon" })}</button>
    </div>
  `;
  root.appendChild(footer);
  container.appendChild(root);

  const backBtn = footer.querySelector("#wizard-back");
  const nextBtn = footer.querySelector("#wizard-next");

  let saveTimer = null;
  let draftPersistEnabled = true;

  function resetCreateWizard() {
    clearTimeout(saveTimer);
    clearProjectDraft();
    draft = { ...emptyProjectDraft(), projectManagerId: getCurrentUserId() };
    step = 1;
    codeTouched = false;
    bannerHost.innerHTML = "";
    goToStep(1);
  }

  function collectFromDom() {
    const patch = readProjectFormPatch(form, { includeGov: true });
    draft = { ...draft, ...patch };
    return draft;
  }

  function persistDraft() {
    if (!draftPersistEnabled) return;
    saveProjectDraftEnvelope({ ...draft, step, codeTouched });
  }

  function scheduleSave() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => persistDraft(), 300);
  }

  function flushDraft() {
    clearTimeout(saveTimer);
    collectFromDom();
    persistDraft();
  }

  function syncPreview() {
    collectFromDom();
    previewHost.innerHTML = "";
    previewHost.appendChild(renderLivePreview(draft));
    scheduleSave();
  }

  function renderResumeBanner() {
    bannerHost.innerHTML = "";
    if (!hasMeaningfulProjectDraft({ ...draft, step, codeTouched })) return;

    const banner = document.createElement("div");
    banner.className = "draft-resume-banner";
    banner.setAttribute("role", "status");
    banner.innerHTML = `
      <span class="draft-resume-banner-text">You have an unsaved project draft. Your entries are saved while you work.</span>
      <button type="button" class="btn btn-ghost btn-sm" id="draft-discard">Discard draft</button>
    `;
    banner.querySelector("#draft-discard").onclick = () => {
      resetCreateWizard();
      showToast("Draft discarded");
    };
    bannerHost.appendChild(banner);
  }

  function wireAutosave() {
    form.querySelectorAll("input, select, textarea").forEach((el) => {
      el.addEventListener("input", syncPreview);
      el.addEventListener("change", syncPreview);
    });
  }

  function renderStep1() {
    stepPanels.innerHTML = "";
    const panel = document.createElement("div");
    panel.className = "project-create-panel";
    panel.dataset.step = "1";

    const typeHost = document.createElement("div");
    typeHost.className = "form-field form-field--full";
    typeHost.appendChild(
      renderTypeCards(draft.projectType, (id) => {
        draft.projectType = id;
        syncPreview();
        if (step === 3) renderStep3();
      })
    );
    panel.appendChild(typeHost);

    const grid = document.createElement("div");
    grid.className = "form-grid project-create-grid";

    grid.appendChild(
      renderFormField(
        "name",
        "Project name *",
        `<input name="name" required autocomplete="off" value="${escapeAttr(draft.name)}" />`,
        { hint: "Shown on reports and invoices" }
      )
    );
    grid.appendChild(
      renderFormField(
        "code",
        "Project code",
        `<input name="code" value="${escapeAttr(draft.code)}" />`,
        { hint: "Short ID for lists and reports" }
      )
    );
    grid.appendChild(
      renderFormField(
        "location",
        "Location *",
        `<input name="location" required value="${escapeAttr(draft.location)}" />`
      )
    );
    grid.appendChild(
      renderFormField(
        "clientName",
        "Client name",
        `<input name="clientName" value="${escapeAttr(draft.clientName)}" />`
      )
    );

    const statusWrap = document.createElement("div");
    statusWrap.className = "form-field form-field--full";
    statusWrap.innerHTML = `<span class="form-field-label">Status</span>`;
    statusWrap.appendChild(
      renderStatusPills(draft.status, (s) => {
        draft.status = s;
        syncPreview();
      })
    );
    grid.appendChild(statusWrap);

    panel.appendChild(grid);
    stepPanels.appendChild(panel);

    const nameInput = form.querySelector('[name="name"]');
    const codeInput = form.querySelector('[name="code"]');
    nameInput?.addEventListener("input", () => {
      if (!codeTouched) {
        const sug = suggestProjectCode(nameInput.value);
        if (codeInput) codeInput.value = sug;
        draft.code = sug;
      }
      syncPreview();
    });
    codeInput?.addEventListener("input", () => {
      codeTouched = true;
      syncPreview();
    });
    wireAutosave();
  }

  function renderStep2() {
    stepPanels.innerHTML = "";
    const panel = document.createElement("div");
    panel.className = "project-create-panel";
    const grid = document.createElement("div");
    grid.className = "form-grid project-create-grid";

    grid.appendChild(
      renderFormField("startDate", "Start date", `<input name="startDate" type="date" value="${escapeAttr(draft.startDate)}" />`)
    );
    grid.appendChild(
      renderFormField("endDate", "End date", `<input name="endDate" type="date" value="${escapeAttr(draft.endDate)}" />`)
    );
    if (draft.projectType !== "government_civil") {
      grid.appendChild(
        renderFormField(
          "contractValue",
          "Contract value (BDT)",
          `<input name="contractValue" type="number" step="0.01" min="0" value="${escapeAttr(draft.contractValue || draft.budgetTotal)}" />`,
          { hint: "Agreed client contract amount — used for payment milestones" }
        )
      );
    }
    grid.appendChild(
      renderFormField(
        "projectManagerId",
        "Project manager",
        `<input name="projectManagerId" type="hidden" value="${escapeAttr(draft.projectManagerId || getCurrentUserId())}" />
         <input type="text" class="form-field-readonly" readonly value="${escapeAttr(getCurrentUserName())}" />`,
        { hint: "Assigned owner for this project" }
      )
    );
    grid.appendChild(
      renderFormField(
        "description",
        "Description",
        `<textarea name="description" rows="4">${escapeHtml(draft.description)}</textarea>`,
        { full: true }
      )
    );

    panel.appendChild(grid);
    stepPanels.appendChild(panel);
    wireAutosave();
  }

  function renderStep3() {
    stepPanels.innerHTML = "";
    collectFromDom();
    const panel = document.createElement("div");
    panel.className = "project-create-panel";

    if (draft.projectType === "government_civil") {
      const govIntro = document.createElement("p");
      govIntro.className = "project-create-step-sub";
      govIntro.style.marginBottom = "1rem";
      govIntro.textContent = "Contract & tender details for government civil works.";
      panel.appendChild(govIntro);
      const govWrap = document.createElement("div");
      govWrap.innerHTML = govContractFieldsHtml(buildAgencyOptions(draft.employerAgency), draft);
      panel.appendChild(govWrap);
      for (const key of GOV_CONTRACT_FIELD_NAMES) {
        const el = govWrap.querySelector(`[name="${key}"]`);
        if (el && draft[key] !== undefined && draft[key] !== "") el.value = draft[key];
      }
      wireAutosave();
    }

    panel.appendChild(renderReviewSummary(draft, { onEditStep: (s) => goToStep(s) }));
    stepPanels.appendChild(panel);
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

  function updateChrome() {
    const meta = WIZARD_STEPS[step - 1];
    stepTitle.textContent = meta.title;
    stepSub.textContent = `Step ${step} of ${WIZARD_STEPS.length}`;
    stepperHost.innerHTML = "";
    stepperHost.appendChild(renderStepIndicator(step, WIZARD_STEPS));
    backBtn.style.visibility = step === 1 ? "hidden" : "visible";
    if (step < 3) {
      nextBtn.innerHTML = `Continue ${icon("chevronRight", { size: 18, className: "icon" })}`;
      nextBtn.classList.remove("is-loading");
      nextBtn.disabled = false;
    } else {
      nextBtn.innerHTML = "Create project";
      nextBtn.classList.remove("is-loading");
      nextBtn.disabled = false;
    }
  }

  function goToStep(n) {
    collectFromDom();
    step = n;
    persistDraft();
    updateChrome();
    if (step === 1) renderStep1();
    else if (step === 2) renderStep2();
    else renderStep3();
    syncPreview();
  }

  function validateCurrent() {
    collectFromDom();
    const v = validateProjectStep(step, draft);
    if (!v.ok) {
      const errors = {};
      if (v.field) errors[v.field] = v.message;
      showFieldErrors(form, errors);
      showToast(v.message, "error");
      return false;
    }
    showFieldErrors(form, {});
    return true;
  }

  cancelTop.addEventListener("click", (e) => {
    e.preventDefault();
    flushDraft();
    location.hash = "#/projects";
  });

  backBtn.onclick = () => {
    if (step > 1) goToStep(step - 1);
  };

  nextBtn.onclick = async () => {
    if (!validateCurrent()) return;
    collectFromDom();
    persistDraft();

    if (step < 3) {
      goToStep(step + 1);
      return;
    }

    nextBtn.disabled = true;
    nextBtn.classList.add("is-loading");
    nextBtn.textContent = "Creating…";

    const now = Date.now();
    const payload = readProjectFormFromState({
      ...draft,
      projectManagerId: draft.projectManagerId || getCurrentUserId(),
    });
    if (payload.projectType === "government_civil") {
      payload.budgetTotal = Number(payload.contractValue) || 0;
      payload.complianceStatus = payload.complianceStatus || "pending";
    } else {
      payload.contractValue = Number(payload.contractValue) || Number(payload.budgetTotal) || 0;
      payload.budgetTotal = payload.contractValue;
    }

    try {
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

      clearProjectDraft();
      draftPersistEnabled = false;
      resetCreateWizard();
      sessionStorage.setItem(ERP_SELECT_PROJECT_KEY, id);
      showToast("Project created");
      location.hash = "#/projects";
    } catch (err) {
      showToast(err.message || "Failed to create project", "error");
      nextBtn.disabled = false;
      nextBtn.classList.remove("is-loading");
      nextBtn.textContent = "Create project";
    }
  };

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    nextBtn.click();
  });

  renderResumeBanner();
  goToStep(step);

  return {
    unmount: () => {
      clearTimeout(saveTimer);
      if (!draftPersistEnabled) return;
      collectFromDom();
      persistDraft();
    },
  };
}
