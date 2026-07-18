/** Shared UI + helpers for project tab panels */

import { getCurrentUserId, getCurrentUserName } from "./svc_auth.js";
import { writeAuditLog } from "./svc_workflow.js";
import { renderFormField } from "./cmp_projectForm.js";

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
