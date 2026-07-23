/** Shared UI + helpers for project tab panels */

import { getCurrentUserId, getCurrentUserName } from "./svc_auth.js";
import { readRef } from "./svc_data.js";
import { writeAuditLog } from "./svc_workflow.js";
import { renderFormField } from "./cmp_projectForm.js";
import { icon } from "./cmp_icons.js";

export function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function escAttr(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;");
}

export function resolveManagerLabel(managerId) {
  if (!managerId) return "—";
  if (managerId === getCurrentUserId()) return getCurrentUserName();
  const roleRow = readRef(`roles/${managerId}`);
  const fromRole = roleRow?.displayName || roleRow?.name;
  if (fromRole?.trim()) return fromRole.trim();
  return String(managerId)
    .split(/[-_]/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

export async function auditProject(state, payload) {
  return writeAuditLog({
    ...payload,
    projectId: state.selectedProjectId || payload.projectId || "",
  });
}

export function validateUrl(url) {
  const s = String(url || "").trim();
  if (!s) return { ok: true };
  try {
    const u = new URL(s);
    if (u.protocol === "http:" || u.protocol === "https:") return { ok: true };
    return { ok: false, message: "URL must start with http:// or https://" };
  } catch {
    return { ok: false, message: "Enter a valid URL" };
  }
}

export function validatePositiveNumber(value, label = "Value") {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return { ok: false, message: `${label} must be greater than zero` };
  return { ok: true, value: n };
}

export function renderEmptyState(message, actionHtml = "") {
  const div = document.createElement("div");
  div.className = "proj-tab-empty";
  div.innerHTML = `<p class="proj-empty">${escapeHtml(message)}</p>${actionHtml}`;
  return div;
}

export function renderTabToolbar(title, actionsHtml = "") {
  const el = document.createElement("div");
  el.className = "proj-tab-toolbar";
  el.innerHTML = `<span class="proj-tab-toolbar-title">${escapeHtml(title)}</span><div class="proj-tab-toolbar-actions">${actionsHtml}</div>`;
  return el;
}

/** @param {{columns:Array<{key:string,label:string,render?:(row:object)=>string}>,rows:object[],emptyMessage?:string,rowActions?:(row:object)=>string}} opts */
export function renderDataTable({ columns, rows, emptyMessage = "No records", rowActions }) {
  const wrap = document.createElement("div");
  wrap.className = "table-wrap";
  const colSpan = columns.length + (rowActions ? 1 : 0);
  const head = columns.map((c) => `<th>${escapeHtml(c.label)}</th>`).join("");
  const body = rows.length
    ? rows
        .map((row) => {
          const cells = columns
            .map((c) => `<td>${c.render ? c.render(row) : escapeHtml(String(row[c.key] ?? "—"))}</td>`)
            .join("");
          const actions = rowActions ? `<td class="proj-row-actions-cell">${rowActions(row)}</td>` : "";
          return `<tr>${cells}${actions}</tr>`;
        })
        .join("")
    : `<tr class="empty-row"><td colspan="${colSpan}">${escapeHtml(emptyMessage)}</td></tr>`;
  wrap.innerHTML = `<table class="dash-table"><thead><tr>${head}${rowActions ? "<th></th>" : ""}</tr></thead><tbody>${body}</tbody></table>`;
  return wrap;
}

export function renderInlineForm(fieldsHtml, submitLabel = "Save") {
  const form = document.createElement("form");
  form.className = "form-grid proj-form";
  form.innerHTML = `${fieldsHtml}<button type="submit" class="btn btn-primary btn-sm">${escapeHtml(submitLabel)}</button>`;
  return form;
}

/** @param {Array<{name:string,label:string,type?:string,required?:boolean,step?:string,hint?:string,options?:Array<{value:string,label:string}>}>} fields */
export function openEditDialog(title, fields, values, onSave) {
  const overlay = document.createElement("div");
  overlay.className = "proj-edit-overlay";
  const dialog = document.createElement("div");
  dialog.className = "proj-edit-dialog card";
  dialog.setAttribute("role", "dialog");
  dialog.innerHTML = `<h3 class="proj-edit-title">${escapeHtml(title)}</h3>`;
  const form = document.createElement("form");
  form.className = "proj-edit-form";

  for (const f of fields) {
    const val = values[f.name] ?? "";
    let input = "";
    if (f.type === "textarea") {
      input = `<textarea name="${f.name}" rows="3">${escapeHtml(val)}</textarea>`;
    } else if (f.type === "select" && f.options) {
      input = `<select name="${f.name}">${f.options
        .map(
          (o) =>
            `<option value="${escAttr(o.value)}" ${String(val) === String(o.value) ? "selected" : ""}>${escapeHtml(o.label)}</option>`
        )
        .join("")}</select>`;
    } else {
      input = `<input name="${f.name}" type="${f.type || "text"}" value="${escAttr(val)}" ${f.required ? "required" : ""} ${f.step ? `step="${f.step}"` : ""} />`;
    }
    form.appendChild(renderFormField(f.name, f.label, input, { hint: f.hint || "" }));
  }

  const actions = document.createElement("div");
  actions.className = "proj-edit-actions";
  actions.innerHTML = `
    <button type="button" class="btn btn-dark btn-sm" data-cancel>Cancel</button>
    <button type="submit" class="btn btn-primary btn-sm">Save</button>
  `;

  form.appendChild(actions);
  dialog.appendChild(form);
  overlay.appendChild(dialog);
  document.body.appendChild(overlay);

  const close = () => overlay.remove();
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) close();
  });
  actions.querySelector("[data-cancel]").onclick = close;

  form.onsubmit = async (e) => {
    e.preventDefault();
    const next = {};
    for (const f of fields) next[f.name] = new FormData(form).get(f.name);
    await onSave(next);
    close();
  };

  return { close, form };
}

function renderCustFormFieldHtml(f, val) {
  const name = escapeHtml(f.name);
  const req = f.required ? "required" : "";
  const step = f.step ? ` step="${escAttr(f.step)}"` : "";
  const min = f.min != null ? ` min="${escAttr(f.min)}"` : "";
  const aria = ` aria-label="${escAttr(f.label.replace(/\s*\*?\s*$/, ""))}"`;

  if (f.type === "textarea") {
    return `<textarea name="${name}" class="cust-form-input cust-form-textarea" rows="${f.rows || 3}" ${req}${aria}>${escapeHtml(val)}</textarea>`;
  }
  if (f.type === "select" && f.options) {
    return `<select name="${name}" class="cust-form-input" ${req}${aria}>${f.options
      .map(
        (o) =>
          `<option value="${escAttr(o.value)}" ${String(val) === String(o.value) ? "selected" : ""}>${escapeHtml(o.label)}</option>`
      )
      .join("")}</select>`;
  }
  if (f.type === "checkbox") {
    const checked = val === true || val === "on" || val === "1";
    const text = f.checkboxLabel != null ? f.checkboxLabel : f.label;
    return `<label class="cust-form-checkbox"><input type="checkbox" name="${name}" ${checked ? "checked" : ""}${aria} /> ${escapeHtml(text)}</label>`;
  }
  return `<input name="${name}" type="${f.type || "text"}" class="cust-form-input" value="${escAttr(val)}" ${req}${step}${min}${aria} />`;
}

/**
 * @param {{
 *   title: string,
 *   subtitle?: string,
 *   sections: Array<{ title: string, fields: Array<{name:string,label:string,type?:string,required?:boolean,step?:string,hint?:string,fullWidth?:boolean,options?:Array<{value:string,label:string}>}> }>,
 *   values: object,
 *   submitLabel?: string,
 *   modalClass?: string,
 *   onSave: (vals: object) => Promise<void>|void,
 *   onReady?: (ctx: { form: HTMLFormElement, modal: HTMLElement, close: () => void }) => void,
 * }} opts
 */
export function openCustFormDialog({ title, subtitle = "", sections, values, submitLabel = "Save", modalClass = "", onSave, onReady }) {
  const titleId = `cust-form-modal-title-${Math.random().toString(36).slice(2, 9)}`;
  const overlay = document.createElement("div");
  overlay.className = "cust-detail-overlay";
  overlay.setAttribute("role", "presentation");

  const modal = document.createElement("div");
  modal.className = `cust-detail-modal card${modalClass ? ` ${modalClass}` : ""}`;
  modal.setAttribute("role", "dialog");
  modal.setAttribute("aria-modal", "true");
  modal.setAttribute("aria-labelledby", titleId);
  modal.setAttribute("tabindex", "-1");

  const subtitleHtml = subtitle ? `<span class="text-muted">${escapeHtml(subtitle)}</span>` : "";
  modal.innerHTML = `
    <div class="cust-detail-head">
      <div class="cust-detail-title">
        <strong id="${titleId}">${escapeHtml(title)}</strong>
        ${subtitleHtml}
      </div>
      <button type="button" class="icon-btn icon-btn--sm cust-detail-close" data-close aria-label="Close">${icon("x", { size: 16 })}</button>
    </div>
  `;

  const form = document.createElement("form");
  form.className = "cust-form cust-form--compact";

  const shell = document.createElement("div");
  shell.className = "cust-form-shell";

  const allFields = [];
  for (const section of sections) {
    const row = document.createElement("div");
    row.className = "cust-form-row";
    const sectionEl = document.createElement("div");
    sectionEl.className = "cust-form-section";
    sectionEl.innerHTML = `
      <div class="cust-form-section-head">
        <h4 class="cust-form-section-title">${escapeHtml(section.title)}</h4>
      </div>
    `;
    const body = document.createElement("div");
    body.className = "cust-form-section-body";
    const grid = document.createElement("div");
    grid.className = "cust-form-grid cust-form-grid--2";

    for (const f of section.fields) {
      allFields.push(f);
      const val = values[f.name] ?? "";
      const full = f.fullWidth || f.type === "textarea" || f.type === "checkbox";
      let fieldCls = full ? "cust-form-field cust-form-field--full" : "cust-form-field";
      if (f.wrapperClass) fieldCls += ` ${f.wrapperClass}`;
      const label = document.createElement(f.type === "checkbox" ? "div" : "label");
      label.className = fieldCls;
      if (f.hidden) label.hidden = true;
      if (f.type === "checkbox") {
        label.innerHTML = `
        <span class="cust-form-label">${escapeHtml(f.label)}</span>
        ${renderCustFormFieldHtml(f, val)}
        ${f.hint ? `<span class="cust-form-help">${escapeHtml(f.hint)}</span>` : ""}
      `;
      } else {
        label.innerHTML = `
        <span class="cust-form-label">${escapeHtml(f.label)}</span>
        ${renderCustFormFieldHtml(f, val)}
        ${f.hint ? `<span class="cust-form-help">${escapeHtml(f.hint)}</span>` : ""}
      `;
      }
      grid.appendChild(label);
    }

    body.appendChild(grid);
    sectionEl.appendChild(body);
    row.appendChild(sectionEl);
    shell.appendChild(row);
  }

  form.appendChild(shell);

  const footer = document.createElement("div");
  footer.className = "cust-form-footer";
  footer.innerHTML = `
    <div class="form-actions cust-form-actions">
      <button type="submit" class="btn btn-primary">${escapeHtml(submitLabel)}</button>
      <button type="button" class="btn btn-ghost" data-cancel>Cancel</button>
    </div>
  `;
  form.appendChild(footer);

  modal.appendChild(form);
  overlay.appendChild(modal);
  document.body.appendChild(overlay);
  document.body.classList.add("cust-detail-open");

  const close = () => {
    overlay.remove();
    document.body.classList.remove("cust-detail-open");
  };

  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) close();
  });
  modal.querySelector("[data-close]").onclick = close;
  footer.querySelector("[data-cancel]").onclick = close;

  form.onsubmit = async (e) => {
    e.preventDefault();
    const next = {};
    for (const f of allFields) {
      if (f.type === "checkbox") {
        next[f.name] = form.querySelector(`[name="${CSS.escape(f.name)}"]`)?.checked ? "on" : "";
      } else {
        next[f.name] = new FormData(form).get(f.name);
      }
    }
    try {
      await onSave(next);
      close();
    } catch {
      /* caller shows toast; keep modal open */
    }
  };

  modal.focus();
  onReady?.({ form, modal, close });
  return { close, form, modal, overlay };
}
