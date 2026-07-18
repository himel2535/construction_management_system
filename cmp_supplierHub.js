/** Suppliers hub UI — KPI row, list, detail header, tabs, pagination */

import { icon } from "./cmp_icons.js";
import { statusChip } from "./cmp_ui.js";
import { formatBDT } from "./util_format.js";
import {
  SUPPLIER_TYPES,
  supplierTypeLabel,
  supplierInitials,
  formatSinceDate,
} from "./util_supplier.js";

export const SUPPLIER_TABS = [
  { id: "overview", label: "Overview" },
  { id: "profile", label: "Profile" },
  { id: "products", label: "Products & Services" },
  { id: "payments", label: "Payments" },
  { id: "projects", label: "Projects" },
  { id: "reports", label: "Reports" },
  { id: "documents", label: "Documents" },
  { id: "notes", label: "Notes" },
  { id: "activity", label: "Activity" },
];

const TYPE_AVATAR_CLASS = {
  material: "sup-avatar--material",
  subcontract: "sup-avatar--subcontract",
  equipment: "sup-avatar--equipment",
  service: "sup-avatar--service",
};

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function renderSupplierAvatar(s, size = "md") {
  const initials = supplierInitials(s?.name);
  const cls = TYPE_AVATAR_CLASS[s?.type] || "sup-avatar--material";
  return `<span class="sup-avatar sup-avatar--${size} ${cls}" aria-hidden="true">${escapeHtml(initials)}</span>`;
}

function menuItemButton(label, iconName, attrs = "") {
  return `<button type="button" class="sup-dropdown-item" ${attrs}>
    ${icon(iconName, { size: 14, className: "icon sup-dropdown-item-icon" })}
    <span>${escapeHtml(label)}</span>
  </button>`;
}

export function renderSupplierKpiRow(kpis, handlers = {}) {
  const row = document.createElement("div");
  row.className = "sup-kpi-row";
  const paidSub = kpis.paidMonthSubtext || "No payments yet";
  const deltaCls =
    paidSub === "No payments yet" ? "" : (kpis.paidMonthDeltaPct || 0) >= 0 ? "is-up" : "is-down";

  row.innerHTML = `
    <div class="sup-kpi-cards">
      <div class="sup-kpi-card">
        <span class="sup-kpi-card-icon">${icon("users", { size: 18, className: "icon" })}</span>
        <div class="sup-kpi-card-body">
          <span class="sup-kpi-card-label">Total Suppliers</span>
          <strong class="sup-kpi-card-value">${kpis.supplierCount}</strong>
          <span class="sup-kpi-card-sub">${kpis.activeSuppliers} active</span>
        </div>
      </div>
      <div class="sup-kpi-card">
        <span class="sup-kpi-card-icon sup-kpi-card-icon--warn">${icon("fileText", { size: 18, className: "icon" })}</span>
        <div class="sup-kpi-card-body">
          <span class="sup-kpi-card-label">Total Outstanding</span>
          <strong class="sup-kpi-card-value">${formatBDT(kpis.totalOutstanding)}</strong>
          <span class="sup-kpi-card-sub">${kpis.outstandingSupplierCount} supplier(s)</span>
        </div>
      </div>
      <div class="sup-kpi-card">
        <span class="sup-kpi-card-icon sup-kpi-card-icon--danger">${icon("calendar", { size: 18, className: "icon" })}</span>
        <div class="sup-kpi-card-body">
          <span class="sup-kpi-card-label">Overdue Amount</span>
          <strong class="sup-kpi-card-value">${formatBDT(kpis.overdueAmount)}</strong>
          <span class="sup-kpi-card-sub">${kpis.overdueSupplierCount} supplier(s)</span>
        </div>
      </div>
      <div class="sup-kpi-card">
        <span class="sup-kpi-card-icon sup-kpi-card-icon--ok">${icon("check", { size: 18, className: "icon" })}</span>
        <div class="sup-kpi-card-body">
          <span class="sup-kpi-card-label">Paid This Month</span>
          <strong class="sup-kpi-card-value">${formatBDT(kpis.paidThisMonth)}</strong>
          <span class="sup-kpi-card-sub ${deltaCls}">${escapeHtml(paidSub)}</span>
        </div>
      </div>
    </div>
    <div class="sup-kpi-actions">
      <button type="button" class="btn btn-ghost btn-sm" id="sup-export-btn">${icon("download", { size: 14, className: "icon" })} Export</button>
      <button type="button" class="btn btn-primary btn-sm" id="sup-kpi-new-btn">+ New Supplier</button>
    </div>
  `;
  row.querySelector("#sup-export-btn")?.addEventListener("click", () => handlers.onExport?.());
  row.querySelector("#sup-kpi-new-btn")?.addEventListener("click", () => handlers.onNew?.());
  return row;
}

export function renderSupplierListItem(s, { selected = false } = {}) {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = `sup-list-item${selected ? " is-selected" : ""}`;
  btn.dataset.id = s.id;
  const meta = [supplierTypeLabel(s.type), s.city].filter(Boolean).join(" · ");
  btn.innerHTML = `
    ${renderSupplierAvatar(s, "sm")}
    <span class="sup-list-body">
      <strong class="sup-list-name">${escapeHtml(s.name)}</strong>
      <span class="sup-list-meta">${escapeHtml(meta || "—")}</span>
    </span>
    ${statusChip(s.status || "active")}
  `;
  return btn;
}

export function renderTypeTabs(counts, activeType, onSelect) {
  const wrap = document.createElement("div");
  wrap.className = "sup-type-tabs";
  const tabs = [
    { id: "all", label: "All" },
    ...SUPPLIER_TYPES.filter((t) => t.id !== "service"),
  ];
  for (const t of tabs) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = `sup-type-tab${activeType === t.id ? " is-active" : ""}`;
    btn.dataset.type = t.id;
    const n = counts[t.id] ?? 0;
    btn.innerHTML = `${escapeHtml(t.label)} <span class="sup-type-tab-count">${n}</span>`;
    btn.onclick = () => onSelect(t.id);
    wrap.appendChild(btn);
  }
  return wrap;
}

export function renderPagination({ page, pageSize, total, onPage, showInfo = true }) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const rangeStart = total ? (page - 1) * pageSize + 1 : 0;
  const rangeEnd = Math.min(page * pageSize, total);
  const wrap = document.createElement("div");
  wrap.className = `sup-pagination${showInfo ? "" : " sup-pagination--compact"}`;

  const pages = [];
  for (let i = 1; i <= totalPages; i++) {
    if (i === 1 || i === totalPages || (i >= page - 1 && i <= page + 1)) pages.push(i);
    else if (pages[pages.length - 1] !== "…") pages.push("…");
  }

  const infoHtml = showInfo
    ? `<span class="sup-pagination-info">Showing ${rangeStart}–${rangeEnd} of ${total}</span>`
    : "";

  wrap.innerHTML = `
    ${infoHtml}
    <div class="sup-pagination-controls">
      <button type="button" class="sup-page-btn" data-page="prev" ${page <= 1 ? "disabled" : ""} aria-label="Previous">${icon("chevronLeft", { size: 14, className: "icon" })}</button>
      ${pages
        .map((p) =>
          p === "…"
            ? `<span class="sup-page-ellipsis">…</span>`
            : `<button type="button" class="sup-page-btn${p === page ? " is-active" : ""}" data-page="${p}">${p}</button>`
        )
        .join("")}
      <button type="button" class="sup-page-btn" data-page="next" ${page >= totalPages ? "disabled" : ""} aria-label="Next">${icon("chevronRight", { size: 14, className: "icon" })}</button>
    </div>
  `;
  wrap.querySelectorAll("[data-page]").forEach((btn) => {
    btn.onclick = () => {
      const v = btn.dataset.page;
      if (v === "prev" && page > 1) onPage(page - 1);
      else if (v === "next" && page < totalPages) onPage(page + 1);
      else if (v !== "prev" && v !== "next") onPage(Number(v));
    };
  });
  return wrap;
}

/**
 * @param {object} s - supplier
 * @param {object} stats - aggregateSupplierStats
 * @param {object} handlers
 */
export function renderSupplierDetailHeader(s, stats, handlers = {}, permissions = {}, menuState = {}) {
  const header = document.createElement("div");
  header.className = "sup-detail-header card";
  const loc = [s.city, s.address].filter(Boolean).join(", ") || "—";
  const since = formatSinceDate(s.createdAt);
  const codeLine = s.code ? `<span class="sup-detail-code">${escapeHtml(s.code)}</span>` : "";
  const canEdit = permissions.canEdit !== false;
  const canPay = permissions.canPay === true;
  const canBill = permissions.canBill === true;
  const canToggleStatus = permissions.canEdit !== false;
  const openMenu = menuState.openMenu || null;
  const onMenuToggle = menuState.onMenuToggle;
  const moreOpen = openMenu === "more";
  const billOpen = openMenu === "bill";

  const moreMenuParts = [];
  if (canPay) moreMenuParts.push(menuItemButton("Record payment", "check", 'data-action="payment"'));
  if (canPay && canToggleStatus) moreMenuParts.push('<hr class="sup-menu-divider" />');
  if (canToggleStatus) {
    moreMenuParts.push(
      menuItemButton(
        s.status === "inactive" ? "Mark active" : "Mark inactive",
        "rotateCcw",
        'data-action="inactive"'
      )
    );
  }

  header.innerHTML = `
    <div class="sup-detail-header-inner">
      ${renderSupplierAvatar(s, "lg")}
      <div class="sup-detail-header-main">
        <div class="sup-detail-title-row">
          <h2 class="sup-detail-title">${escapeHtml(s.name)}</h2>
          ${codeLine}
          ${statusChip(s.status || "active")}
        </div>
        <p class="sup-detail-sub">${escapeHtml(supplierTypeLabel(s.type))} · ${escapeHtml(loc)}</p>
        <p class="sup-detail-since">Since ${escapeHtml(since)}</p>
      </div>
      <div class="sup-detail-header-actions sup-header-actions-root">
        ${canEdit ? '<button type="button" class="btn btn-ghost btn-sm" id="sup-header-edit">Edit</button>' : ""}
        ${
          canPay || canToggleStatus
            ? `<div class="sup-dropdown-wrap">
          <button type="button" class="btn btn-ghost btn-sm sup-dropdown-trigger${moreOpen ? " is-open" : ""}" id="sup-header-more" aria-haspopup="menu" aria-expanded="${moreOpen}">
            More <span class="sup-chevron" aria-hidden="true">▾</span>
          </button>
          <div class="sup-dropdown-menu${moreOpen ? " is-open" : ""}" id="sup-more-menu" role="menu" aria-hidden="${!moreOpen}">
            ${moreMenuParts.join("")}
          </div>
        </div>`
            : ""
        }
        ${
          canBill
            ? `<div class="sup-dropdown-wrap sup-dropdown-wrap--primary">
          <button type="button" class="btn btn-primary btn-sm sup-dropdown-trigger${billOpen ? " is-open" : ""}" id="sup-header-bill" aria-haspopup="menu" aria-expanded="${billOpen}">
            Create Bill <span class="sup-chevron" aria-hidden="true">▾</span>
          </button>
          <div class="sup-dropdown-menu${billOpen ? " is-open" : ""}" id="sup-bill-menu" role="menu" aria-hidden="${!billOpen}">
            ${menuItemButton("Manual bill", "fileText", 'data-bill="manual"')}
            ${menuItemButton("View open bills", "eye", 'data-bill="bills"')}
          </div>
        </div>`
            : ""
        }
      </div>
    </div>
  `;
  header.querySelector("#sup-header-edit")?.addEventListener("click", () => handlers.onEdit?.());
  header.querySelector("#sup-header-more")?.addEventListener("click", (e) => {
    e.stopPropagation();
    onMenuToggle?.(moreOpen ? null : "more");
  });
  header.querySelectorAll("#sup-more-menu .sup-dropdown-item").forEach((btn) => {
    btn.onclick = (e) => {
      e.stopPropagation();
      onMenuToggle?.(null);
      handlers.onMoreAction?.(btn.dataset.action);
    };
  });
  header.querySelector("#sup-header-bill")?.addEventListener("click", (e) => {
    e.stopPropagation();
    onMenuToggle?.(billOpen ? null : "bill");
  });
  header.querySelector('[data-bill="manual"]')?.addEventListener("click", (e) => {
    e.stopPropagation();
    onMenuToggle?.(null);
    handlers.onCreateBill?.();
  });
  header.querySelector('[data-bill="bills"]')?.addEventListener("click", (e) => {
    e.stopPropagation();
    onMenuToggle?.(null);
    handlers.onViewBills?.();
  });
  return header;
}

export function renderSupplierTabBar(activeTab, onChange) {
  const bar = document.createElement("div");
  bar.className = "sup-tab-bar";
  bar.setAttribute("role", "tablist");
  for (const t of SUPPLIER_TABS) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.role = "tab";
    btn.className = `sup-tab${activeTab === t.id ? " is-active" : ""}`;
    btn.textContent = t.label;
    btn.setAttribute("aria-selected", activeTab === t.id ? "true" : "false");
    btn.onclick = () => onChange(t.id);
    bar.appendChild(btn);
  }
  return bar;
}

export function sectionCard(title, subtitle = "") {
  const card = document.createElement("div");
  card.className = "sup-section-card card";
  card.innerHTML = `
    <div class="sup-section-card-head">
      <h4 class="sup-section-card-title">${escapeHtml(title)}</h4>
      ${subtitle ? `<p class="sup-section-card-sub">${escapeHtml(subtitle)}</p>` : ""}
    </div>
    <div class="sup-section-card-body"></div>
  `;
  return card;
}
