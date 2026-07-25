import { reportKpiIcon } from "./cmp_dashboardIcons.js";
import { PERMISSION_GROUPS, MATRIX_ROLES, roleHasPermission, matrixRoleLabel } from "./util_permissions.js";
import { approvalResponsibilityRows } from "./util_approvalResponsibility.js";

function escapeHtml(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function settingsSparkline(values = [], tone = "green") {
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
    blue: "#8a2e2e",
    green: "#047857",
    orange: "#d97706",
    teal: "#0d9488",
    yellow: "#CA8A04",
  };
  const stroke = strokes[tone] || strokes.green;
  return `<svg class="dash-sparkline dash-sparkline--${tone}" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none"><polyline points="${coords}" fill="none" stroke="${stroke}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
}

function countSpark(n) {
  const v = Math.max(0, Number(n) || 0);
  if (v <= 0) return [2, 2, 3, 3, 2, 3, 2];
  const peak = Math.min(8, 2 + v);
  return [peak - 1, peak, peak, peak + 1, peak, peak, peak].map((x) => Math.max(1, x));
}

function renderSettingsKpiCard(c) {
  return `<div class="dash-kpi-card card cust-kpi-card ${c.extraClass || ""}">
      <div class="cust-kpi-spark">${c.spark}</div>
      <div class="dash-kpi-head">
        <div class="dash-kpi-icon dash-kpi-icon--flat">${reportKpiIcon(c.icon)}</div>
        <div class="dash-kpi-main">
          <span class="dash-kpi-label">${escapeHtml(c.label)}</span>
          <div class="dash-kpi-value">${escapeHtml(c.value ?? "")}</div>
        </div>
      </div>
      <div class="dash-kpi-foot">
        <div class="dash-kpi-foot-left">${escapeHtml(c.footLeft)}</div>
      </div>
    </div>`;
}

export const SETTINGS_SECTION_TABS = [
  { id: "profile", label: "Company" },
  { id: "users", label: "Users & roles" },
  { id: "rbac", label: "RBAC" },
  { id: "audit", label: "Audit log" },
  { id: "backup", label: "Backup" },
  { id: "guide", label: "Product Guide" },
];

export const SETTINGS_TAB_STORAGE_KEY = "settingsActiveTab";

/** @param {{ activeUsers?: number, auditCount?: number, roleCount?: number, profileComplete?: boolean }} stats */
export function renderSettingsKpiRow(stats) {
  const {
    activeUsers = 0,
    auditCount = 0,
    roleCount = 0,
    profileComplete = false,
  } = stats || {};
  const cards = [
    {
      label: "Active users",
      value: String(activeUsers),
      icon: "receivable",
      tone: "blue",
      footLeft: activeUsers ? "Non-deactivated accounts" : "No active users",
      spark: settingsSparkline(countSpark(activeUsers), activeUsers ? "blue" : "green"),
    },
    {
      label: "Audit entries",
      value: String(auditCount),
      icon: "expense",
      tone: "yellow",
      extraClass: "cust-kpi-card--yellow",
      footLeft: auditCount ? "Logged in this workspace" : "No audit entries yet",
      spark: settingsSparkline(countSpark(Math.min(auditCount, 6)), auditCount ? "yellow" : "green"),
    },
    {
      label: "System roles",
      value: String(roleCount),
      icon: "subcontract",
      tone: "teal",
      footLeft: "Defined RBAC roles",
      spark: settingsSparkline(countSpark(roleCount), "teal"),
    },
    {
      label: "Company profile",
      value: profileComplete ? "Complete" : "Incomplete",
      icon: "billed",
      tone: profileComplete ? "green" : "orange",
      extraClass: profileComplete ? "" : "dash-kpi-card--attention",
      footLeft: profileComplete ? "Name on file" : "Add company name",
      spark: settingsSparkline(profileComplete ? [4, 5, 5, 6, 6, 7, 7] : [2, 2, 3, 2, 3, 2, 2], profileComplete ? "green" : "orange"),
    },
  ];
  return cards.map(renderSettingsKpiCard).join("");
}

function profileValue(val, { link } = {}) {
  const t = String(val ?? "").trim();
  if (!t) return `<span class="co-profile-value is-empty">Not set</span>`;
  if (link === "mailto") {
    return `<a class="co-profile-link" href="mailto:${escapeHtml(t)}">${escapeHtml(t)}</a>`;
  }
  if (link === "url") {
    const href = /^https?:\/\//i.test(t) ? t : `https://${t}`;
    return `<a class="co-profile-link" href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer">${escapeHtml(t)}</a>`;
  }
  return `<span class="co-profile-value">${escapeHtml(t)}</span>`;
}

function profileDlRow(label, valueHtml) {
  return `<div class="co-profile-dl__row"><dt>${escapeHtml(label)}</dt><dd>${valueHtml}</dd></div>`;
}

const CO_PROFILE_BUILDING_ICON = `<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 21h18M5 21V7l7-4 7 4v14M9 21v-6h6v6M9 9h.01M15 9h.01M9 13h.01M15 13h.01"/></svg>`;

/** Read-only company profile — hero + panel layout */
export function renderCompanyProfileViewHtml(profile) {
  const p = getCompanyProfileFormValues(profile);
  const displayName = p.name.trim() || "Company name not set";
  const tradingLine = p.tradingName.trim()
    ? `<p class="co-profile-hero__trade">Trading as <strong>${escapeHtml(p.tradingName)}</strong></p>`
    : "";
  const aboutLine = p.about.trim()
    ? `<p class="co-profile-hero__about">${escapeHtml(p.about)}</p>`
    : `<p class="co-profile-hero__about co-profile-hero__about--empty">Add a short company description for reports and the client portal.</p>`;

  return `
    <div class="co-profile">
      <header class="co-profile-hero">
        <div class="co-profile-hero__icon" aria-hidden="true">${CO_PROFILE_BUILDING_ICON}</div>
        <div class="co-profile-hero__copy">
          <h3 class="co-profile-hero__name">${escapeHtml(displayName)}</h3>
          ${tradingLine}
          ${aboutLine}
        </div>
      </header>
      <div class="co-profile-layout">
        <section class="co-profile-panel">
          <h4 class="co-profile-panel__title">Contact</h4>
          <dl class="co-profile-dl">
            ${profileDlRow("Registered address", profileValue(p.address))}
            ${profileDlRow("Phone", profileValue(p.phone))}
            ${profileDlRow("Email", profileValue(p.email, { link: "mailto" }))}
            ${profileDlRow("Website", profileValue(p.website, { link: "url" }))}
          </dl>
        </section>
        <section class="co-profile-panel">
          <h4 class="co-profile-panel__title">Registration &amp; compliance</h4>
          <dl class="co-profile-dl">
            ${profileDlRow("Trade license no.", profileValue(p.tradeLicense))}
            ${profileDlRow("TIN / VAT no.", profileValue(p.tinVatNo))}
            ${profileDlRow("Company registration (RJSC)", profileValue(p.companyRegNo))}
          </dl>
        </section>
      </div>
      <section class="co-profile-panel co-profile-panel--finance">
        <h4 class="co-profile-panel__title">Finance &amp; banking</h4>
        <dl class="co-profile-dl co-profile-dl--finance">
          ${profileDlRow("Default currency", profileValue(p.currency))}
          ${profileDlRow("Receipt / voucher prefix", profileValue(p.receiptPrefix))}
          ${profileDlRow("Bank name", profileValue(p.bankName))}
          ${profileDlRow("Bank account no.", profileValue(p.bankAccount))}
        </dl>
      </section>
      <p class="settings-profile-foot">Used on reports, vouchers, and client documents.</p>
    </div>`;
}

/** @param {Record<string, unknown> | null | undefined} profile */
export function getCompanyProfileFormValues(profile) {
  const p = profile || {};
  return {
    name: String(p.name ?? ""),
    tradingName: String(p.tradingName ?? ""),
    about: String(p.about ?? ""),
    address: String(p.address ?? ""),
    phone: String(p.phone ?? ""),
    email: String(p.email ?? ""),
    website: String(p.website ?? ""),
    tradeLicense: String(p.tradeLicense ?? ""),
    tinVatNo: String(p.tinVatNo ?? ""),
    companyRegNo: String(p.companyRegNo ?? ""),
    currency: String(p.currency ?? "BDT"),
    receiptPrefix: String(p.receiptPrefix ?? ""),
    bankName: String(p.bankName ?? ""),
    bankAccount: String(p.bankAccount ?? ""),
  };
}

/** @param {HTMLFormElement} form */
export function readCompanyProfileFromForm(form) {
  const keys = Object.keys(getCompanyProfileFormValues({}));
  /** @type {Record<string, string>} */
  const out = {};
  for (const key of keys) {
    const el = form.elements.namedItem(key);
    if (el && "value" in el) out[key] = String(el.value ?? "").trim();
    else out[key] = "";
  }
  if (!out.currency) out.currency = "BDT";
  return out;
}

export const COMPANY_PROFILE_CURRENCY_OPTIONS = [
  { value: "BDT", label: "BDT — Bangladeshi Taka" },
  { value: "USD", label: "USD — US Dollar" },
  { value: "EUR", label: "EUR — Euro" },
];

export function isCompanyProfileComplete(profile) {
  return Boolean(String(profile?.name ?? "").trim());
}

function formatMatrixActionLabel(action) {
  return String(action)
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

const PERM_ROLE_TH_CLASS = {
  owner: "owner",
  project_manager: "pm",
  site_engineer: "engineer",
  site_supervisor: "supervisor",
  accountant: "accountant",
  procurement_officer: "procurement",
};

const PERM_ROLE_SHORT = {
  owner: { label: "Owner", title: "Owner / Admin" },
  project_manager: { label: "PM", title: "Project Manager" },
  site_engineer: { label: "Engineer", title: "Site Engineer" },
  site_supervisor: { label: "Supervisor", title: "Site Supervisor" },
  accountant: { label: "Finance", title: "Accountant / Finance" },
  procurement_officer: { label: "Procure", title: "Procurement Officer" },
};

function renderPermRoleHeaders() {
  return MATRIX_ROLES.map((r) => {
    const meta = PERM_ROLE_SHORT[r] || { label: matrixRoleLabel(r), title: matrixRoleLabel(r) };
    return `<th class="settings-perm-th settings-perm-th--${PERM_ROLE_TH_CLASS[r] || r}" title="${escapeHtml(meta.title)}">${escapeHtml(meta.label)}</th>`;
  }).join("");
}

function renderPermActionRows(actions) {
  return actions
    .map((action) => {
      const cells = MATRIX_ROLES.map((r) => {
        const ok = roleHasPermission(r, action);
        return `<td class="settings-perm-cell">${ok
          ? `<span class="settings-perm-badge settings-perm-badge--yes" title="Allowed"><span aria-hidden="true">✓</span></span>`
          : `<span class="settings-perm-badge settings-perm-badge--no" title="Not allowed"><span aria-hidden="true">—</span></span>`
        }</td>`;
      }).join("");
      return `<tr class="settings-perm-action-row">
          <td class="settings-perm-action-name">
            <span class="settings-perm-action-label">${escapeHtml(formatMatrixActionLabel(action))}</span>
            <span class="settings-perm-action-key">${escapeHtml(action)}</span>
          </td>
          ${cells}
        </tr>`;
    })
    .join("");
}

function renderPermGroupTable(group) {
  return `
    <section class="settings-perm-group-card settings-perm-group-card--${escapeHtml(group.id)}">
      <h4 class="settings-perm-group-card-title">${escapeHtml(group.label)}</h4>
      <div class="reports-table-wrap settings-perm-table-wrap">
        <table class="dash-table projects-table settings-perm-table">
          <colgroup>
            <col class="settings-perm-col-name" />
            <col span="${MATRIX_ROLES.length}" class="settings-perm-col-role" />
          </colgroup>
          <thead>
            <tr>
              <th class="settings-perm-th-permission">Permission</th>
              ${renderPermRoleHeaders()}
            </tr>
          </thead>
          <tbody>${renderPermActionRows(group.actions)}</tbody>
        </table>
      </div>
    </section>`;
}

/** Who approves what — production responsibility guide */
function renderApprovalResponsibilitiesTable() {
  const rows = approvalResponsibilityRows();
  const body = rows
    .map(
      (r) => `
        <tr>
          <td><strong>${escapeHtml(r.label)}</strong></td>
          <td>${escapeHtml(r.approverRoles)}</td>
          <td class="settings-approval-resp-pages">${escapeHtml(r.approvePages)}</td>
        </tr>`
    )
    .join("");
  return `
    <section class="settings-approval-responsibilities">
      <h3 class="settings-approval-resp-title">Approval responsibilities</h3>
      <p class="settings-approval-resp-intro text-muted">
        Production segregation of duties — who approves each workflow and where to action it.
      </p>
      <div class="reports-table-wrap settings-approval-resp-table-wrap">
        <table class="dash-table projects-table settings-approval-resp-table">
          <thead>
            <tr>
              <th>Entity</th>
              <th>Approver role(s)</th>
              <th>Page to action</th>
            </tr>
          </thead>
          <tbody>${body}</tbody>
        </table>
      </div>
    </section>`;
}

/** RBAC permission matrix — per-module cards, fixed columns */
export function renderPermissionMatrixHtml() {
  const groupCards = PERMISSION_GROUPS.map(renderPermGroupTable).join("");

  return `
    <div class="settings-perm-matrix">
      <p class="settings-perm-site-note text-muted">
        <strong>Site In-charge</strong> is a per-project assignment (Site Management module), not a login role.
        Field attendance and vouchers use the assigned site in-charge user; diary approval uses
        <code>approve_site_diary</code> on PM / Engineer roles below.
      </p>
      <div class="settings-perm-legend">
        <span class="settings-perm-legend-hint">Green check = role can perform the action</span>
        <div class="settings-perm-legend-badges">
          <span class="settings-perm-legend-item"><span class="settings-perm-badge settings-perm-badge--yes" aria-hidden="true">✓</span> Allowed</span>
          <span class="settings-perm-legend-item"><span class="settings-perm-badge settings-perm-badge--no" aria-hidden="true">—</span> Not allowed</span>
        </div>
      </div>
      <div class="settings-perm-groups">${groupCards}</div>
      ${renderApprovalResponsibilitiesTable()}
    </div>`;
}
