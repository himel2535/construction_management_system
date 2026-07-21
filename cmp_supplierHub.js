/** Suppliers hub UI — KPI row, list, detail header, tabs, pagination */

import { icon } from "./cmp_icons.js";
import { statusChip } from "./cmp_ui.js";
import { supplierKpiIcon } from "./cmp_dashboardIcons.js";
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

function supSparklineSvg(values = [], tone = "green") {
  const pts = values.length ? values : [3, 4, 4, 5, 5, 6, 6];
  const max = Math.max(...pts, 1);
  const w = 56;
  const h = 22;
  const coords = pts
    .map((v, i) => {
      const x = (i / (pts.length - 1 || 1)) * w;
      const y = h - (v / max) * (h - 4) - 2;
      return `${x},${y}`;
    })
    .join(" ");
  const strokes = {
    blue: "#2563eb",
    green: "#047857",
    orange: "#d97706",
    teal: "#0d9488",
    red: "#B91C1C",
    yellow: "#CA8A04",
  };
  const stroke = strokes[tone] || strokes.green;
  return `<svg class="dash-sparkline dash-sparkline--${tone}" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none"><polyline points="${coords}" fill="none" stroke="${stroke}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
}

export function renderSupplierKpiStripHtml(kpis) {
  const paidSub = kpis.paidMonthSubtext || "No payments yet";
  const footTone =
    paidSub === "No payments yet"
      ? ""
      : (kpis.paidMonthDeltaPct || 0) >= 0
        ? " sup-kpi-foot--up"
        : " sup-kpi-foot--down";
  const cards = [
    {
      label: "Total suppliers",
      value: String(kpis.supplierCount ?? 0),
      iconKey: "suppliers",
      tone: "blue",
      footLeft: `${kpis.activeSuppliers ?? 0} active`,
      spark: supSparklineSvg([kpis.supplierCount || 1, 2, 2, kpis.activeSuppliers || 1, 2, 2, 2], "blue"),
    },
    {
      label: "Total outstanding",
      value: formatBDT(kpis.totalOutstanding),
      iconKey: "outstanding",
      tone: "orange",
      footLeft: `${kpis.outstandingSupplierCount ?? 0} supplier(s)`,
      spark: supSparklineSvg([3, 4, 5, 4, 5, 6, 5], "orange"),
    },
    {
      label: "Overdue amount",
      value: formatBDT(kpis.overdueAmount),
      iconKey: "overdue",
      tone: "red",
      footLeft: `${kpis.overdueSupplierCount ?? 0} supplier(s)`,
      spark: supSparklineSvg([2, 3, 4, 3, 4, 5, 4], "red"),
    },
    {
      label: "Paid this month",
      value: formatBDT(kpis.paidThisMonth),
      iconKey: "paidMonth",
      tone: "green",
      footLeft: paidSub,
      footCls: footTone,
      spark: supSparklineSvg([2, 3, 4, 5, 5, 6, 6], "green"),
    },
  ];
  return cards
    .map(
      (c) => `<div class="dash-kpi-card card cust-kpi-card">
      <div class="cust-kpi-spark">${c.spark}</div>
      <div class="dash-kpi-head">
        <div class="dash-kpi-icon dash-kpi-icon--flat">${supplierKpiIcon(c.iconKey)}</div>
        <div class="dash-kpi-main">
          <span class="dash-kpi-label">${escapeHtml(c.label)}</span>
          <div class="dash-kpi-value">${escapeHtml(c.value)}</div>
        </div>
      </div>
      <div class="dash-kpi-foot">
        <div class="dash-kpi-foot-left${c.footCls || ""}">${escapeHtml(c.footLeft)}</div>
      </div>
    </div>`
    )
    .join("");
}

/** @deprecated use renderSupplierKpiStripHtml */
export function renderSupplierKpiRow(kpis, handlers = {}) {
  const row = document.createElement("div");
  row.className = "dash-kpi-row";
  row.innerHTML = renderSupplierKpiStripHtml(kpis);
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
  const header = document.createElement("section");
  header.className = "dash-widget dash-widget--projects card sup-detail-header";
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
    <div class="dash-widget-head dash-widget-head--split sup-detail-header-inner">
      <div class="sup-detail-header-main">
        ${renderSupplierAvatar(s, "lg")}
        <div>
          <div class="sup-detail-title-row">
            <h2 class="dash-widget-title sup-detail-title">${escapeHtml(s.name)}</h2>
            ${codeLine}
            ${statusChip(s.status || "active")}
          </div>
          <p class="dash-widget-sub">${escapeHtml(supplierTypeLabel(s.type))} · ${escapeHtml(loc)}</p>
          <p class="sup-detail-since">Since ${escapeHtml(since)}</p>
        </div>
      </div>
      <div class="sup-detail-header-actions sup-header-actions-root cust-toolbar-btn-group">
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
  bar.className = "proj-tab-subnav sup-pill-tabs sup-pill-tabs--sup-main sup-tab-bar";
  bar.setAttribute("role", "tablist");
  for (const t of SUPPLIER_TABS) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.role = "tab";
    btn.className = `sup-tab-pill sup-tab-pill--${t.id}${activeTab === t.id ? " is-active" : ""}`;
    btn.textContent = t.label;
    btn.setAttribute("aria-selected", activeTab === t.id ? "true" : "false");
    btn.onclick = () => onChange(t.id);
    bar.appendChild(btn);
  }
  return bar;
}

export function sectionCard(title, subtitle = "") {
  const card = document.createElement("section");
  card.className = "dash-widget dash-widget--projects card sup-report-block sup-section-card";
  card.innerHTML = `
    <div class="dash-widget-head">
      <h3 class="dash-widget-title sup-section-card-title">${escapeHtml(title)}</h3>
      ${subtitle ? `<p class="dash-widget-sub sup-section-card-sub">${escapeHtml(subtitle)}</p>` : ""}
    </div>
    <div class="dash-widget-body sup-section-card-body"></div>
  `;
  return card;
}
