import { icon } from "./cmp_icons.js";
import { PROJECT_TYPES, EMPLOYER_AGENCIES, defaultProjectType, BG_TYPES } from "./util_govProject.js";
import { PROJECT_STATUSES } from "./svc_workflow.js";
import { statusChip } from "./cmp_ui.js";
import { formatBDT, formatDateRange } from "./util_format.js";
import { projectTypeLabel } from "./util_govProject.js";

const TYPE_META = {
  government_civil: { icon: "landmark", tone: "type-gov", desc: "Tender, work order, measurement book, bank guarantee, IPC" },
  private_civil: { icon: "hardHat", tone: "type-pvt", desc: "Private clients — flexible billing and faster approvals" },
};

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function renderBreadcrumb() {
  const el = document.createElement("nav");
  el.className = "page-breadcrumb";
  el.setAttribute("aria-label", "Breadcrumb");
  el.innerHTML = `
    <a href="/projects">Projects</a>
    <span class="page-breadcrumb-sep">›</span>
    <span>Create project</span>
  `;
  return el;
}

export function renderStepIndicator(currentStep, steps) {
  const el = document.createElement("div");
  el.className = "wizard-steps";
  el.setAttribute("role", "list");
  steps.forEach((step, i) => {
    const num = i + 1;
    const done = num < currentStep;
    const active = num === currentStep;
    const item = document.createElement("div");
    item.className = `wizard-step${active ? " is-active" : ""}${done ? " is-done" : ""}`;
    item.setAttribute("role", "listitem");
    item.innerHTML = `
      <span class="wizard-step-num">${done ? icon("check", { size: 14, className: "icon wizard-check" }) : num}</span>
      <span class="wizard-step-label">${escapeHtml(step.title)}</span>
    `;
    if (i < steps.length - 1) {
      const line = document.createElement("span");
      line.className = "wizard-step-line";
      el.appendChild(item);
      el.appendChild(line);
    } else {
      el.appendChild(item);
    }
  });
  return el;
}

export function renderTypeCards(selectedId, onSelect) {
  const wrap = document.createElement("div");
  wrap.className = "type-card-grid";
  const hidden = document.createElement("input");
  hidden.type = "hidden";
  hidden.name = "projectType";
  hidden.value = selectedId || defaultProjectType();
  wrap.appendChild(hidden);

  for (const t of PROJECT_TYPES) {
    const meta = TYPE_META[t.id] || TYPE_META.private_civil;
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = `type-card ${meta.tone}${selectedId === t.id ? " is-selected" : ""}`;
    btn.dataset.typeId = t.id;
    btn.innerHTML = `
      <span class="type-card-icon">${icon(meta.icon, { size: 28, className: "icon type-card-svg" })}</span>
      <strong class="type-card-title">${escapeHtml(t.label)}</strong>
      <span class="type-card-desc">${escapeHtml(meta.desc)}</span>
      <span class="type-card-check">${icon("check", { size: 16, className: "icon" })}</span>
    `;
    btn.onclick = () => {
      hidden.value = t.id;
      wrap.querySelectorAll(".type-card").forEach((c) => c.classList.remove("is-selected"));
      btn.classList.add("is-selected");
      onSelect?.(t.id);
    };
    wrap.appendChild(btn);
  }
  return wrap;
}

export function renderFormField(name, label, inputHtml, { error = "", hint = "", full = false } = {}) {
  const wrap = document.createElement("div");
  wrap.className = `form-field${error ? " has-error" : ""}${full ? " form-field--full" : ""}`;
  wrap.dataset.field = name;
  wrap.innerHTML = `
    <label class="form-field-label" for="field-${name}">${label}</label>
    <div class="form-field-control">${inputHtml}</div>
    ${hint ? `<span class="form-field-hint">${escapeHtml(hint)}</span>` : ""}
    ${error ? `<span class="form-field-error" role="alert">${escapeHtml(error)}</span>` : ""}
  `;
  const control = wrap.querySelector(".form-field-control");
  const input = control.firstElementChild;
  if (input && !input.id) input.id = `field-${name}`;
  return wrap;
}

export function showFieldErrors(form, errors) {
  form.querySelectorAll(".form-field").forEach((el) => {
    el.classList.remove("has-error");
    const errEl = el.querySelector(".form-field-error");
    if (errEl) errEl.remove();
  });
  for (const [name, message] of Object.entries(errors)) {
    const field = form.querySelector(`[data-field="${name}"]`) || form.querySelector(`[name="${name}"]`)?.closest(".form-field");
    if (!field) continue;
    field.classList.add("has-error");
    let errEl = field.querySelector(".form-field-error");
    if (!errEl) {
      errEl = document.createElement("span");
      errEl.className = "form-field-error";
      errEl.setAttribute("role", "alert");
      field.appendChild(errEl);
    }
    errEl.textContent = message;
  }
}

export function renderStatusPills(selected, onSelect) {
  const wrap = document.createElement("div");
  wrap.className = "status-pills";
  const hidden = document.createElement("input");
  hidden.type = "hidden";
  hidden.name = "status";
  hidden.value = selected || "planning";
  wrap.appendChild(hidden);

  for (const s of PROJECT_STATUSES) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = `status-pill${selected === s ? " is-selected" : ""}`;
    btn.textContent = s.replace("_", " ");
    btn.onclick = () => {
      hidden.value = s;
      wrap.querySelectorAll(".status-pill").forEach((p) => p.classList.remove("is-selected"));
      btn.classList.add("is-selected");
      onSelect?.(s);
    };
    wrap.appendChild(btn);
  }
  return wrap;
}

export function renderLivePreview(payload) {
  const el = document.createElement("aside");
  el.className = "wizard-preview card";
  const name = payload.name?.trim() || "Project preview";
  const code = payload.code?.trim() || "—";
  const location = payload.location?.trim() || "Not set";
  const type = projectTypeLabel(payload.projectType);
  const status = payload.status || "planning";
  const dates = formatDateRange(payload.startDate, payload.endDate);
  const datesLabel = dates === "Not set" ? "Dates not set" : dates;

  let govBlock = "";
  if (payload.projectType === "government_civil") {
    govBlock = `
      <div class="preview-gov">
        <span>${escapeHtml(payload.employerAgency || "Agency TBD")}</span>
        ${payload.contractValue ? `<strong>${escapeHtml(formatBDT(payload.contractValue))}</strong>` : ""}
      </div>
    `;
  }

  el.innerHTML = `
    <div class="wizard-preview-head">
      <span class="wizard-preview-label">Live preview</span>
      <span class="wizard-preview-hint">Updates as you type</span>
    </div>
    <div class="wizard-preview-body">
      <h3 class="wizard-preview-name">${escapeHtml(name)}</h3>
      <p class="wizard-preview-meta">${escapeHtml(code)} · ${escapeHtml(type)}</p>
      <p class="wizard-preview-loc">${icon("folder", { size: 14, className: "icon preview-icon" })} ${escapeHtml(location)}</p>
      <div class="wizard-preview-chips">${statusChip(status)}</div>
      <p class="wizard-preview-dates">${escapeHtml(datesLabel)}</p>
      ${govBlock}
    </div>
  `;
  return el;
}

export function renderReviewSummary(payload, { onEditStep } = {}) {
  const card = document.createElement("div");
  card.className = "review-summary card";
  const rows = [
    ["Name", payload.name],
    ["Type", projectTypeLabel(payload.projectType)],
    ["Code", payload.code || "—"],
    ["Location", payload.location],
    ["Client", payload.clientName || "—"],
    ["Status", payload.status],
    ["Timeline", formatDateRange(payload.startDate, payload.endDate) || "—"],
    ["Description", payload.description || "—"],
  ];
  if (payload.projectType === "government_civil") {
    rows.push(
      ["Agency", payload.employerAgency || "—"],
      ["Work order", payload.workOrderNo || "—"],
      ["Contract value", payload.contractValue ? formatBDT(payload.contractValue) : "—"]
    );
  } else {
    const cv = payload.contractValue || payload.budgetTotal;
    rows.splice(6, 0, ["Contract value", cv ? formatBDT(cv) : "—"]);
  }

  card.innerHTML = `
    <div class="review-summary-head">
      <h3 class="section-title">Review &amp; create</h3>
      <p class="section-sub">Confirm details before saving the project.</p>
    </div>
    <dl class="review-summary-grid">
      ${rows.map(([k, v]) => `<dt>${escapeHtml(k)}</dt><dd>${escapeHtml(String(v || "—"))}</dd>`).join("")}
    </dl>
    <div class="review-summary-actions">
      <button type="button" class="btn btn-ghost btn-sm" data-edit-step="1">Edit basics</button>
      <button type="button" class="btn btn-ghost btn-sm" data-edit-step="2">Edit schedule</button>
    </div>
  `;
  card.querySelectorAll("[data-edit-step]").forEach((btn) => {
    btn.onclick = () => onEditStep?.(Number(btn.dataset.editStep));
  });
  return card;
}

export function govContractFieldsHtml(agencyOpts, values = {}) {
  const v = values;
  return `
    <section class="gov-form-section">
    <h4 class="r3-subhead">Tender / e-GP</h4>
    <div class="form-grid form-grid--gov gov-tender-block">
      ${renderFormField(
        "employerAgency",
        "Employer agency",
        `<select name="employerAgency" id="field-employerAgency"><option value="">Select agency</option>${agencyOpts}</select>`,
        { hint: "LGED, PWD, RHD, etc." }
      ).outerHTML}
      ${renderFormField("tenderRef", "Tender ref / e-GP ID", `<input name="tenderRef" id="field-tenderRef" value="${escapeHtml(v.tenderRef || "")}" />`).outerHTML}
      ${renderFormField("tenderNoticeDate", "Notice date", `<input name="tenderNoticeDate" type="date" id="field-tenderNoticeDate" value="${v.tenderNoticeDate || ""}" />`).outerHTML}
      ${renderFormField("tenderSubmissionDeadline", "Submission deadline", `<input name="tenderSubmissionDeadline" type="date" id="field-tenderSubmissionDeadline" value="${v.tenderSubmissionDeadline || ""}" />`).outerHTML}
      ${renderFormField("tenderDocUrl", "Tender document URL", `<input name="tenderDocUrl" type="url" id="field-tenderDocUrl" placeholder="https://..." value="${escapeHtml(v.tenderDocUrl || "")}" />`, { full: true }).outerHTML}
      ${renderFormField("nitNo", "NIT no", `<input name="nitNo" id="field-nitNo" value="${escapeHtml(v.nitNo || "")}" />`).outerHTML}
    </div>
    </section>
    <section class="gov-form-section">
    <h4 class="r3-subhead">Work order (কার্যাদেশ)</h4>
    <div class="form-grid form-grid--gov gov-wo-block">
      ${renderFormField("workOrderNo", "Work order reference", `<input name="workOrderNo" id="field-workOrderNo" value="${escapeHtml(v.workOrderNo || "")}" />`).outerHTML}
      ${renderFormField("workOrderIssueDate", "Issue date", `<input name="workOrderIssueDate" type="date" id="field-workOrderIssueDate" value="${v.workOrderIssueDate || ""}" />`).outerHTML}
      ${renderFormField("workOrderScope", "Scope of work", `<textarea name="workOrderScope" id="field-workOrderScope" rows="3">${escapeHtml(v.workOrderScope || "")}</textarea>`, { full: true }).outerHTML}
    </div>
    </section>
    <section class="gov-form-section">
    <h4 class="r3-subhead">Contract &amp; retention</h4>
    <div class="form-grid form-grid--gov">
      ${renderFormField(
        "contractValue",
        "Contract value (BDT)",
        `<input name="contractValue" type="number" step="0.01" min="0" id="field-contractValue" value="${v.contractValue || ""}" />`
      ).outerHTML}
      ${renderFormField("contractDate", "Contract date", `<input name="contractDate" type="date" id="field-contractDate" value="${v.contractDate || ""}" />`).outerHTML}
      ${renderFormField("completionDate", "Completion date", `<input name="completionDate" type="date" id="field-completionDate" value="${v.completionDate || ""}" />`).outerHTML}
      ${renderFormField(
        "retentionPercent",
        "Retention %",
        `<input name="retentionPercent" type="number" step="0.01" id="field-retentionPercent" value="${v.retentionPercent ?? 10}" />`
      ).outerHTML}
      ${renderFormField("ldRate", "LD rate / day (BDT)", `<input name="ldRate" type="number" step="0.01" min="0" id="field-ldRate" value="${v.ldRate ?? 0}" />`).outerHTML}
      ${renderFormField(
        "retentionReleaseConditions",
        "Retention release conditions",
        `<textarea name="retentionReleaseConditions" id="field-retentionReleaseConditions" rows="2">${escapeHtml(v.retentionReleaseConditions || "")}</textarea>`,
        { full: true }
      ).outerHTML}
    </div>
    </section>
    <section class="gov-form-section">
    <h4 class="r3-subhead">Guarantees</h4>
    <div class="form-grid form-grid--gov">
      ${renderFormField(
        "performanceGuaranteeAmount",
        "Performance guarantee (BDT)",
        `<input name="performanceGuaranteeAmount" type="number" step="0.01" min="0" id="field-performanceGuaranteeAmount" value="${v.performanceGuaranteeAmount || ""}" />`
      ).outerHTML}
      ${renderFormField(
        "securityDeposit",
        "Security deposit",
        `<input name="securityDeposit" type="number" step="0.01" min="0" id="field-securityDeposit" value="${v.securityDeposit || ""}" />`
      ).outerHTML}
    </div>
    </section>
    <section class="gov-form-section">
    <h4 class="r3-subhead">Bank guarantee</h4>
    <div class="form-grid form-grid--gov">
      ${renderFormField(
        "bgType",
        "BG type",
        `<select name="bgType" id="field-bgType">${BG_TYPES.map((t) => `<option value="${t.id}" ${(v.bgType || "performance") === t.id ? "selected" : ""}>${escapeHtml(t.label)}</option>`).join("")}</select>`
      ).outerHTML}
      ${renderFormField(
        "bgAmount",
        "BG amount (BDT)",
        `<input name="bgAmount" type="number" step="0.01" min="0" id="field-bgAmount" value="${v.bgAmount || ""}" />`
      ).outerHTML}
      ${renderFormField("bgBank", "Issuing bank", `<input name="bgBank" id="field-bgBank" value="${escapeHtml(v.bgBank || "")}" />`).outerHTML}
      ${renderFormField("bgExpiryDate", "BG expiry", `<input name="bgExpiryDate" type="date" id="field-bgExpiryDate" value="${v.bgExpiryDate || ""}" />`).outerHTML}
      ${renderFormField(
        "bgStatus",
        "BG status",
        `<select name="bgStatus" id="field-bgStatus">
          <option value="active" ${(v.bgStatus || "active") === "active" ? "selected" : ""}>Active</option>
          <option value="expired" ${v.bgStatus === "expired" ? "selected" : ""}>Expired</option>
          <option value="released" ${v.bgStatus === "released" ? "selected" : ""}>Released</option>
        </select>`
      ).outerHTML}
    </div>
    </section>
  `;
}

export function buildAgencyOptions(selected = "") {
  return EMPLOYER_AGENCIES.map(
    (a) => `<option value="${escapeHtml(a)}" ${selected === a ? "selected" : ""}>${escapeHtml(a)}</option>`
  ).join("");
}
