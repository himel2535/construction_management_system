import { reportKpiIcon } from "./cmp_dashboardIcons.js";
import { PERMISSION_GROUPS, MATRIX_ROLES, roleHasPermission, matrixRoleLabel } from "./util_permissions.js";

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
    blue: "#2563eb",
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

function profileDisplayValue(val) {
  const t = String(val ?? "").trim();
  if (!t) {
    return `<span class="settings-profile-card-value is-empty">Not set</span>`;
  }
  return `<span class="settings-profile-card-value">${escapeHtml(t)}</span>`;
}

/** Read-only company profile cards for Settings view mode */
export function renderCompanyProfileViewHtml(profile) {
  const p = profile || {};
  return `
    <div class="settings-profile-grid">
      <div class="settings-profile-card settings-profile-card--name">
        <span class="settings-profile-card-title">Company name</span>
        ${profileDisplayValue(p.name)}
      </div>
      <div class="settings-profile-card settings-profile-card--address">
        <span class="settings-profile-card-title">Address</span>
        ${profileDisplayValue(p.address)}
      </div>
      <div class="settings-profile-card settings-profile-card--phone">
        <span class="settings-profile-card-title">Phone</span>
        ${profileDisplayValue(p.phone)}
      </div>
    </div>
    <p class="settings-profile-foot">Shown on reports and documents</p>`;
}

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
  accountant: "accountant",
};

const PERM_ROLE_SHORT = {
  owner: { label: "Owner", title: "Owner / Admin" },
  project_manager: { label: "Project Manager", title: "Project Manager" },
  site_engineer: { label: "Engineer", title: "Site Engineer" },
  accountant: { label: "Finance", title: "Accountant / Finance" },
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
            <col span="4" class="settings-perm-col-role" />
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

/** RBAC permission matrix — per-module cards, fixed columns */
export function renderPermissionMatrixHtml() {
  const groupCards = PERMISSION_GROUPS.map(renderPermGroupTable).join("");

  return `
    <div class="settings-perm-matrix">
      <div class="settings-perm-legend">
        <span class="settings-perm-legend-hint">Green check = role can perform the action</span>
        <div class="settings-perm-legend-badges">
          <span class="settings-perm-legend-item"><span class="settings-perm-badge settings-perm-badge--yes" aria-hidden="true">✓</span> Allowed</span>
          <span class="settings-perm-legend-item"><span class="settings-perm-badge settings-perm-badge--no" aria-hidden="true">—</span> Not allowed</span>
        </div>
      </div>
      <div class="settings-perm-groups">${groupCards}</div>
    </div>`;
}
