/** Shared hub UI for Workers / Inventory / Assets */

import { icon } from "./cmp_icons.js";
import { statusChip } from "./cmp_ui.js";
import { renderPagination } from "./cmp_supplierHub.js";

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function renderModuleTabBar(tabs, activeId, onSelect) {
  const wrap = document.createElement("div");
  wrap.className = "proj-tab-subnav mod-tab-subnav";
  for (const t of tabs) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = `proj-tab${activeId === t.id ? " is-active" : ""}`;
    btn.textContent = t.label;
    btn.onclick = () => onSelect(t.id);
    wrap.appendChild(btn);
  }
  return wrap;
}

export function renderModuleToolbar({ title, searchPlaceholder = "Search...", searchValue = "", filtersHtml = "", actionsHtml = "" }) {
  const el = document.createElement("div");
  el.className = "proj-tab-toolbar mod-toolbar";
  el.innerHTML = `
    <span class="proj-tab-toolbar-title">${escapeHtml(title)}</span>
    <div class="mod-toolbar-controls">
      <label class="mod-search">${icon("search", { size: 14, className: "icon" })}
        <input type="search" class="mod-search-input" placeholder="${escapeHtml(searchPlaceholder)}" value="${escapeHtml(searchValue)}" />
      </label>
      ${filtersHtml}
      <div class="proj-tab-toolbar-actions">${actionsHtml}</div>
    </div>
  `;
  return el;
}

export function renderModulePillTabBar(tabs, activeId, onSelect) {
  const bar = renderModuleTabBar(tabs, activeId, onSelect);
  bar.className = "proj-tab-subnav mod-tab-subnav mod-pill-tabs";
  return bar;
}

export function renderModuleStatCards(cards) {
  const row = document.createElement("div");
  row.className = "mod-stat-row";
  row.innerHTML = `<div class="mod-stat-cards">${cards
    .map((c) => {
      const iconCls = c.iconCls || "mod-stat-icon--blue";
      const cardCls = c.cardCls || iconCls.replace("mod-stat-icon", "mod-stat-card");
      return `<div class="mod-stat-card ${cardCls}">
        <span class="mod-stat-icon ${iconCls}">${c.icon ? icon(c.icon, { size: 18, className: "icon" }) : ""}</span>
        <div class="mod-stat-body">
          <span class="mod-stat-label">${escapeHtml(c.label)}</span>
          <strong class="mod-stat-value ${c.valueCls || ""}">${escapeHtml(String(c.value))}</strong>
          ${c.sub ? `<span class="mod-stat-sub">${escapeHtml(c.sub)}</span>` : ""}
        </div>
      </div>`;
    })
    .join("")}</div>`;
  return row;
}

export function renderModuleKpiRow(cards) {
  const row = document.createElement("div");
  row.className = "sup-kpi-row mod-kpi-row";
  row.innerHTML = `<div class="sup-kpi-cards">${cards
    .map(
      (c) => `<div class="sup-kpi-card">
        <span class="sup-kpi-card-icon ${c.iconCls || ""}">${c.icon ? icon(c.icon, { size: 18, className: "icon" }) : ""}</span>
        <div class="sup-kpi-card-body">
          <span class="sup-kpi-card-label">${escapeHtml(c.label)}</span>
          <strong class="sup-kpi-card-value">${escapeHtml(String(c.value))}</strong>
          ${c.sub ? `<span class="sup-kpi-card-sub">${escapeHtml(c.sub)}</span>` : ""}
        </div>
      </div>`
    )
    .join("")}</div>`;
  return row;
}

export function renderStatusFilterChips(filters, activeId, onSelect) {
  const wrap = document.createElement("div");
  wrap.className = "sup-type-tabs mod-status-tabs";
  for (const f of filters) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = `sup-type-tab${activeId === f.id ? " is-active" : ""}`;
    btn.textContent = f.label;
    btn.onclick = () => onSelect(f.id);
    wrap.appendChild(btn);
  }
  return wrap;
}

export { renderPagination, statusChip, escapeHtml };
