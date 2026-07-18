import { workerInitials, designationLabel, workerAvatarTone } from "./util_workers.js";
import { renderModuleTabBar, renderModuleToolbar, renderModulePillTabBar, renderModuleStatCards, escapeHtml } from "./cmp_moduleHub.js";
import { icon } from "./cmp_icons.js";

export const WORKER_TABS = [
  { id: "list", label: "Worker List" },
  { id: "attendance", label: "Attendance" },
  { id: "salary", label: "Salary" },
  { id: "reports", label: "Reports" },
];

export const WORKER_PROFILE_TABS = [
  { id: "overview", label: "Overview" },
  { id: "attendance", label: "Attendance" },
  { id: "salary", label: "Salary" },
  { id: "items", label: "Items Issued" },
  { id: "documents", label: "Documents" },
];

export function renderWorkerAvatar(worker, size = "md") {
  const initials = workerInitials(worker?.name);
  const tone = workerAvatarTone(worker?.name);
  const toneCls = ` wrk-avatar--tone-${tone}`;
  const url = String(worker?.photoUrl || "").trim();
  const safeInitials = initials.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
  let inner;
  if (url) {
    inner = `<img src="${escapeHtml(url)}" alt="" class="wrk-avatar-img" onerror="var el=this.parentElement;el.classList.add('wrk-avatar--tone-${tone}');this.replaceWith(document.createTextNode('${safeInitials}'));" />`;
  } else {
    inner = escapeHtml(initials);
  }
  return `<span class="wrk-avatar wrk-avatar--${size}${url ? "" : toneCls}" aria-hidden="true">${inner}</span>`;
}

export function renderWorkerNameCell(worker) {
  const code = worker?.workerCode ? `<small>${escapeHtml(worker.workerCode)}</small>` : "";
  return `<div class="wrk-name-cell">${renderWorkerAvatar(worker, "sm")}<div><strong>${escapeHtml(worker?.name || "—")}</strong>${code}</div></div>`;
}

export function renderWorkerListNameCell(worker) {
  return `<div class="wrk-name-cell wrk-name-cell--list">${renderWorkerAvatar(worker, "sm")}<strong>${escapeHtml(worker?.name || "—")}</strong></div>`;
}

export function renderWorkerStatusBadge(status) {
  const s = status || "active";
  if (s === "active") return `<span class="wrk-badge wrk-badge--success">Active</span>`;
  if (s === "on_leave") return `<span class="wrk-badge wrk-badge--danger">On leave</span>`;
  return `<span class="wrk-badge wrk-badge--inactive">Inactive</span>`;
}

export function renderReturnStatusBadge(status) {
  const s = String(status || "not_returned").toLowerCase();
  if (s === "returned") return `<span class="wrk-badge wrk-badge--success">Returned</span>`;
  if (s === "damaged") return `<span class="wrk-badge wrk-badge--danger">Damaged</span>`;
  return `<span class="wrk-badge wrk-badge--warning">Not Returned</span>`;
}

export function renderAttendanceCell(status) {
  const map = {
    present: { cls: "present", text: "P" },
    absent: { cls: "absent", text: "A" },
    half_day: { cls: "half", text: "H" },
    leave: { cls: "leave", text: "-" },
  };
  const m = map[status] || { cls: "empty", text: "-" };
  return `<button type="button" class="wrk-att-cell wrk-att-cell--${m.cls}" aria-label="${status || "No data"}">${m.text}</button>`;
}

export function renderAttendanceLegend() {
  return `<div class="wrk-att-legend" aria-hidden="true">
    <span><span class="wrk-att-cell wrk-att-cell--present">P</span> P = present</span>
    <span><span class="wrk-att-cell wrk-att-cell--absent">A</span> A = absent</span>
    <span><span class="wrk-att-cell wrk-att-cell--half">H</span> H = half-day</span>
  </div>`;
}

export function renderMonthPicker(inputId, value, label = "") {
  return `<label class="wrk-month-picker">
    ${icon("calendar", { size: 16, className: "icon wrk-month-icon" })}
    ${label ? `<span class="wrk-month-label">${escapeHtml(label)}</span>` : ""}
    <input type="month" id="${escapeHtml(inputId)}" value="${escapeHtml(value)}" />
  </label>`;
}

export function renderWorkerStatCards(cards) {
  return renderModuleStatCards(cards);
}

export function renderWorkerEmptyState({ title = "No workers added yet", onAdd }) {
  const el = document.createElement("div");
  el.className = "wrk-empty-state";
  el.innerHTML = `
    <span class="wrk-empty-icon">${icon("users", { size: 32, className: "icon" })}</span>
    <p class="wrk-empty-title">${escapeHtml(title)}</p>
    <button type="button" class="btn btn-primary btn-sm" id="wrk-empty-add">+ Add Worker</button>
  `;
  el.querySelector("#wrk-empty-add")?.addEventListener("click", onAdd);
  return el;
}

export function renderWorkerTabBar(tabs, activeId, onSelect) {
  return renderModulePillTabBar(tabs, activeId, onSelect);
}

export function renderWorkerDetailHeader(worker, projectName, onBack, listStatus) {
  const header = document.createElement("div");
  header.className = "wrk-detail-header";
  const badgeStatus = listStatus || worker.status || "active";
  header.innerHTML = `
    <button type="button" class="btn btn-ghost btn-sm wrk-back-btn">${icon("chevronLeft", { size: 14, className: "icon" })} Back</button>
    <div class="wrk-detail-main">
      ${renderWorkerAvatar(worker, "lg")}
      <div class="wrk-detail-text">
        <h2 class="wrk-detail-name">${escapeHtml(worker.name)}</h2>
        <p class="wrk-detail-meta">${escapeHtml(worker.workerCode || "—")} · ${escapeHtml(designationLabel(worker.designation))} · ${escapeHtml(projectName || "Unassigned")}</p>
      </div>
      ${renderWorkerStatusBadge(badgeStatus)}
    </div>
  `;
  header.querySelector(".wrk-back-btn")?.addEventListener("click", onBack);
  return header;
}

export function renderProfileCard({ title, subtitle = "", actionsHtml = "", bodyEl = null, bodyHtml = "" }) {
  const card = document.createElement("section");
  card.className = "wrk-profile-card";
  const actionsBlock = actionsHtml ? `<div class="wrk-profile-card-actions">${actionsHtml}</div>` : "";
  const subtitleBlock = subtitle ? `<p class="wrk-profile-card-sub">${escapeHtml(subtitle)}</p>` : "";
  card.innerHTML = `
    <div class="wrk-profile-card-head">
      <div class="wrk-profile-card-head-text">
        <h4 class="wrk-profile-card-title">${escapeHtml(title)}</h4>
        ${subtitleBlock}
      </div>
      ${actionsBlock}
    </div>
    <div class="wrk-profile-card-body"></div>
  `;
  const body = card.querySelector(".wrk-profile-card-body");
  if (bodyEl) body.appendChild(bodyEl);
  else if (bodyHtml) body.innerHTML = bodyHtml;
  return card;
}

export function renderIconBtn(actionClass, iconName, label, workerId) {
  return `<button type="button" class="wrk-icon-btn ${actionClass}" data-id="${escapeHtml(workerId)}" aria-label="${escapeHtml(label)}" title="${escapeHtml(label)}">${icon(iconName, { size: 16, className: "icon" })}</button>`;
}

export function renderListDetailsBtn(workerId) {
  return `<button type="button" class="wrk-list-details-btn wrk-view-btn" data-id="${escapeHtml(workerId)}" aria-label="See details">See details</button>`;
}

export function renderMobileDetailsBadge(workerId) {
  return `<button type="button" class="wrk-mobile-details-badge wrk-view-btn" data-id="${escapeHtml(workerId)}" aria-label="See full details">See full details</button>`;
}

export function renderListViewBtn(workerId) {
  return `<button type="button" class="wrk-list-view-btn wrk-view-btn" data-id="${escapeHtml(workerId)}" aria-label="View profile" title="View profile">${icon("eye", { size: 18, className: "icon" })}</button>`;
}

export { renderModuleTabBar, renderModuleToolbar };
