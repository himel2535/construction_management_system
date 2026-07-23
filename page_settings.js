import { listenValue, updatePath, listenList } from "./svc_data.js";
import { triggerBackupMetaClient } from "./svc_operations.js";
import { showToast } from "./cmp_toast.js";
import { setActiveNav, refreshSidebarNav } from "./cmp_layout.js";
import { setPageChrome, syncHeaderUser } from "./cmp_header.js";
import { getCurrentUserId, setCurrentUser } from "./svc_auth.js";
import {
  invalidateRoleCache,
  listRoleUsers,
  guardAction,
  canPerformAction,
} from "./svc_governance.js";
import { ALL_ROLES, roleLabel, roleDescription } from "./util_roles.js";
import { createEmployee, deactivateUser, reactivateUser, removeEmployee } from "./svc_userManagement.js";
import { switchDemoUser, DEMO_ROLE_USERS } from "./svc_demoSession.js";
import { formatDate } from "./util_format.js";
import { buildAuditDiff } from "./util_audit.js";
import { reportsWidgetShell, renderReportsTabBar, wrapReportsTabPanel } from "./cmp_reports.js";
import {
  SETTINGS_SECTION_TABS,
  SETTINGS_TAB_STORAGE_KEY,
  renderSettingsKpiRow,
  renderCompanyProfileViewHtml,
  isCompanyProfileComplete,
  renderPermissionMatrixHtml,
} from "./cmp_settings.js";

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function simpleSettingsWidget(title, sub, bodyId, opts = {}) {
  const el = document.createElement("div");
  el.innerHTML = reportsWidgetShell({ title, sub, bodyId, ...opts });
  return el.firstElementChild;
}

function renderSystemRolesTable() {
  return `
    <div class="reports-table-wrap settings-roles-table">
      <table class="dash-table projects-table">
        <thead><tr><th>Role</th><th>Description</th></tr></thead>
        <tbody>
          ${ALL_ROLES.map(
            (r) => `
            <tr>
              <td><strong>${escapeHtml(roleLabel(r))}</strong></td>
              <td>${escapeHtml(roleDescription(r))}</td>
            </tr>`
          ).join("")}
        </tbody>
      </table>
    </div>
  `;
}

export function mountSettings(container) {
  setActiveNav();
  setPageChrome({
    title: "Settings",
    subtitle: "Company profile, users, RBAC, audit log, and backup — use tabs below to switch areas.",
    showDateRange: false,
  });

  const root = document.createElement("div");
  root.className = "reports-page settings-page dashboard-page dashboard-mockup";

  const stats = document.createElement("div");
  stats.className = "dash-kpi-row";
  stats.id = "settings-stats";
  root.appendChild(stats);

  const tabHostEl = document.createElement("div");
  tabHostEl.className = "rep-tab-host";

  const contentHostEl = document.createElement("div");
  contentHostEl.className = "rep-content-host";

  let activeTab = sessionStorage.getItem(SETTINGS_TAB_STORAGE_KEY) || "profile";
  if (!SETTINGS_SECTION_TABS.some((t) => t.id === activeTab)) activeTab = "profile";

  function setActiveTab(id) {
    if (!SETTINGS_SECTION_TABS.some((t) => t.id === id)) return;
    activeTab = id;
    try {
      sessionStorage.setItem(SETTINGS_TAB_STORAGE_KEY, id);
    } catch {
      /* ignore */
    }
    contentHostEl.querySelectorAll(".rep-tab-panel").forEach((panel) => {
      const on = panel.dataset.repTab === id;
      panel.hidden = !on;
    });
    tabHostEl.querySelectorAll(".rep-tab-pill").forEach((btn) => {
      const on = btn.dataset.repTab === id;
      btn.classList.toggle("is-active", on);
      btn.setAttribute("aria-selected", on ? "true" : "false");
    });
  }

  const profileWidget = simpleSettingsWidget(
    "Company profile",
    "Legal name and contact details for reports and documents",
    "settings-profile-body",
    { headerIcon: "profile" }
  );
  profileWidget.querySelector("#settings-profile-body").innerHTML = `
    <div class="settings-profile-panel">
      <div class="settings-profile-toolbar">
        <span id="settings-profile-status-chip" class="chip chip--warn">Incomplete</span>
        <div class="settings-profile-actions">
          <button type="button" class="btn btn-primary btn-sm" id="settings-profile-edit-btn">Edit company profile</button>
          <button type="submit" form="settings-profile-form" class="btn btn-primary btn-sm" id="settings-profile-save-btn" hidden>Save</button>
          <button type="button" class="btn btn-ghost btn-sm" id="settings-profile-cancel-btn" hidden>Cancel</button>
        </div>
      </div>
      <div id="settings-profile-view"></div>
      <div id="settings-profile-edit" hidden>
        <form id="settings-profile-form" class="settings-profile-form settings-profile-form--edit">
          <label class="settings-profile-field">
            <span class="settings-profile-field-label">Company name</span>
            <input name="name" placeholder="Company name" />
          </label>
          <label class="settings-profile-field">
            <span class="settings-profile-field-label">Address</span>
            <input name="address" placeholder="Address" />
          </label>
          <label class="settings-profile-field">
            <span class="settings-profile-field-label">Phone</span>
            <input name="phone" placeholder="Phone" />
          </label>
        </form>
      </div>
    </div>
  `;
  const form = profileWidget.querySelector("#settings-profile-form");
  const profileViewHost = profileWidget.querySelector("#settings-profile-view");
  const profileEditHost = profileWidget.querySelector("#settings-profile-edit");
  const profileStatusChip = profileWidget.querySelector("#settings-profile-status-chip");
  const profileEditBtn = profileWidget.querySelector("#settings-profile-edit-btn");
  const profileSaveBtn = profileWidget.querySelector("#settings-profile-save-btn");
  const profileCancelBtn = profileWidget.querySelector("#settings-profile-cancel-btn");

  let profileMode = "view";

  function populateProfileForm(p) {
    const data = p || {};
    form.name.value = data.name || "";
    form.address.value = data.address || "";
    form.phone.value = data.phone || "";
  }

  function updateProfileStatusChip(p) {
    const complete = isCompanyProfileComplete(p);
    profileStatusChip.textContent = complete ? "Complete" : "Incomplete";
    profileStatusChip.className = complete ? "chip chip--ok" : "chip chip--warn";
  }

  function syncProfileView(p) {
    profileViewHost.innerHTML = renderCompanyProfileViewHtml(p);
    updateProfileStatusChip(p);
  }

  function setProfileMode(mode) {
    profileMode = mode;
    const editing = mode === "edit";
    profileViewHost.hidden = editing;
    profileEditHost.hidden = !editing;
    profileEditBtn.hidden = editing;
    profileSaveBtn.hidden = !editing;
    profileCancelBtn.hidden = !editing;
    profileWidget.classList.toggle("is-profile-editing", editing);
  }

  profileEditBtn.onclick = () => {
    populateProfileForm(companyProfile);
    setProfileMode("edit");
    form.name.focus();
  };

  profileCancelBtn.onclick = () => {
    populateProfileForm(companyProfile);
    setProfileMode("view");
  };

  syncProfileView(null);
  setProfileMode("view");

  const usersWidget = simpleSettingsWidget(
    "Users & roles",
    "Demo mode — employees, roles, and session switching",
    "settings-users-body",
    { headerIcon: "users" }
  );
  usersWidget.querySelector("#settings-users-body").innerHTML = `
    <p class="section-sub" id="settings-roles-note">Demo mode — switch role via the <strong>header user menu</strong> or below. Demo emails: ${DEMO_ROLE_USERS.map((u) => escapeHtml(u.email)).join(", ")}.</p>
    <form id="settings-add-user-form" class="settings-add-user-form">
      <input name="displayName" placeholder="Full name" required />
      <input name="email" type="email" placeholder="Email" required />
      <select name="role" aria-label="Role">${ALL_ROLES.filter((r) => r !== "client").map((r) => `<option value="${r}">${escapeHtml(roleLabel(r))}</option>`).join("")}</select>
      <button type="submit" class="btn btn-primary btn-sm">Add employee</button>
    </form>
    <div id="settings-roles-list"></div>
  `;

  const permWidget = simpleSettingsWidget(
    "Permission matrix",
    "Role-based access by Owner, Project Manager, Engineer, and Accountant",
    "settings-perm-matrix-host",
    { headerIcon: "rbac" }
  );
  permWidget.querySelector("#settings-perm-matrix-host").innerHTML = `<div id="settings-perm-matrix"></div>`;

  const systemRolesWidget = simpleSettingsWidget(
    "System roles",
    "System-wide role definitions and descriptions",
    "settings-system-roles-host",
    { headerIcon: "rbac" }
  );
  systemRolesWidget.querySelector("#settings-system-roles-host").innerHTML = `<div id="settings-system-roles-table"></div>`;

  const rbacStack = document.createElement("div");
  rbacStack.className = "settings-rbac-stack";
  rbacStack.append(permWidget, systemRolesWidget);

  const auditWidget = simpleSettingsWidget(
    "Audit log",
    "Create, update, and delete actions with before/after snapshots",
    "settings-audit-body",
    { headerIcon: "audit" }
  );
  auditWidget.querySelector("#settings-audit-body").innerHTML = `<div id="settings-audit-list"></div>`;

  const backupWidget = simpleSettingsWidget(
    "Backup",
    "Mock mode — metadata marker only",
    "settings-backup-body",
    { headerIcon: "backup" }
  );
  backupWidget.querySelector("#settings-backup-body").innerHTML = `
    <button type="button" class="btn btn-dark" id="backup-btn">Request backup</button>
    <p id="backup-status" class="settings-backup-status"></p>
  `;

  const sectionNodes = [
    ["profile", profileWidget],
    ["users", usersWidget],
    ["rbac", rbacStack],
    ["audit", auditWidget],
    ["backup", backupWidget],
  ];

  for (const [tabId, node] of sectionNodes) {
    contentHostEl.appendChild(wrapReportsTabPanel(tabId, node, activeTab === tabId));
  }

  root.append(tabHostEl, contentHostEl);
  container.appendChild(root);

  tabHostEl.appendChild(renderReportsTabBar(SETTINGS_SECTION_TABS, activeTab, setActiveTab));
  setActiveTab(activeTab);

  root.querySelector("#settings-perm-matrix").innerHTML = renderPermissionMatrixHtml();
  root.querySelector("#settings-system-roles-table").innerHTML = renderSystemRolesTable();

  const rolesHost = root.querySelector("#settings-roles-list");
  const rolesNote = root.querySelector("#settings-roles-note");

  let companyProfile = null;
  let auditLogsCache = [];

  function updateSettingsKpi() {
    const users = listRoleUsers().filter((u) => !u.deletedAt && u.active !== false);
    stats.innerHTML = renderSettingsKpiRow({
      activeUsers: users.length,
      auditCount: auditLogsCache.length,
      roleCount: ALL_ROLES.length,
      profileComplete: isCompanyProfileComplete(companyProfile),
    });
  }

  function canManageUsers() {
    return canPerformAction("manage_users");
  }

  function renderRolesList() {
    const users = listRoleUsers();
    const currentId = getCurrentUserId();
    const manage = canManageUsers();

    rolesNote.textContent = manage
      ? "Demo mode — switch active user role to test permissions."
      : "Switch user via the header profile menu (top right) or Switch to below. Only Owner can add or change roles.";

    if (!users.length) {
      rolesHost.innerHTML = `<p class="proj-empty">No users seeded</p>`;
      updateSettingsKpi();
      return;
    }

    const rows = users
      .filter((u) => !u.deletedAt)
      .map((u) => {
        const desc = roleDescription(u.role);
        const inactive = u.active === false;
        const isSession = u.id === currentId;

        const roleControl = manage
          ? `<select class="toolbar-select settings-role-select" data-uid="${u.id}" aria-label="Role for ${escapeHtml(u.displayName || u.id)}" ${inactive ? "disabled" : ""}>
              ${ALL_ROLES.map(
                (r) =>
                  `<option value="${r}" ${u.role === r ? "selected" : ""}>${escapeHtml(roleLabel(r))}</option>`
              ).join("")}
            </select>`
          : `<span class="chip">${escapeHtml(roleLabel(u.role))}</span>`;

        let statusHtml;
        if (isSession) {
          statusHtml = `<span class="settings-user-status settings-user-status--session">Active session</span>`;
        } else if (inactive) {
          statusHtml = `<span class="settings-user-status settings-user-status--inactive">Deactivated</span>`;
        } else {
          statusHtml = `<span class="settings-user-status settings-user-status--active">Active</span>`;
        }

        const actionParts = [];
        if (u.id !== currentId && !inactive) {
          actionParts.push(
            `<button type="button" class="btn btn-sm btn-pastel btn-pastel--switch settings-switch-user" data-uid="${u.id}">Switch to</button>`
          );
        }
        if (manage && u.id !== currentId) {
          if (inactive) {
            actionParts.push(
              `<button type="button" class="btn btn-sm btn-pastel btn-pastel--reactivate settings-reactivate-user" data-uid="${u.id}">Reactivate</button>`,
              `<button type="button" class="btn btn-sm btn-pastel btn-pastel--remove settings-remove-user" data-uid="${u.id}">Remove</button>`
            );
          } else {
            actionParts.push(
              `<button type="button" class="btn btn-sm btn-pastel btn-pastel--deactivate settings-deactivate-user" data-uid="${u.id}">Deactivate</button>`
            );
          }
        }
        const actionsHtml = actionParts.length
          ? `<div class="settings-users-actions">${actionParts.join("")}</div>`
          : `<span class="text-muted settings-users-actions-empty">—</span>`;

        const rowClass = [
          "settings-users-row",
          isSession ? "settings-users-row--session" : "",
          inactive ? "settings-users-row--inactive" : "",
        ]
          .filter(Boolean)
          .join(" ");

        return `<tr class="${rowClass}" data-uid="${u.id}">
          <td class="settings-users-cell-user">
            <strong class="settings-users-name">${escapeHtml(u.displayName || u.email || u.id)}</strong>
            <span class="settings-users-email">${escapeHtml(u.email || "")}</span>
          </td>
          <td class="settings-users-cell-desc">${desc ? escapeHtml(desc) : "—"}</td>
          <td class="settings-users-cell-status">${statusHtml}</td>
          <td class="settings-users-cell-role">${roleControl}</td>
          <td class="settings-users-cell-actions">${actionsHtml}</td>
        </tr>`;
      })
      .join("");

    rolesHost.innerHTML = `
      <div class="reports-table-wrap settings-users-table-wrap">
        <table class="dash-table projects-table settings-users-table">
          <thead>
            <tr>
              <th>User</th>
              <th>Responsibilities</th>
              <th class="settings-users-th-status">Status</th>
              <th class="settings-users-th-role">Role</th>
              <th class="settings-users-th-actions settings-users-actions-col">Actions</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>`;

    if (manage) {
      rolesHost.querySelectorAll(".settings-role-select").forEach((sel) => {
        sel.onchange = async () => {
          const uid = sel.dataset.uid;
          const user = users.find((x) => x.id === uid);
          try {
            guardAction("manage_users");
            await updatePath(`roles/${uid}`, {
              ...user,
              role: sel.value,
              updatedAt: Date.now(),
            });
            invalidateRoleCache();
            showToast(`Role updated: ${roleLabel(sel.value)}`);
            if (uid === currentId) {
              setCurrentUser({
                id: uid,
                name: user.displayName || user.email,
                email: user.email,
                role: sel.value,
              });
              refreshSidebarNav();
              syncHeaderUser();
            }
            renderRolesList();
          } catch (err) {
            showToast(err.message, "error");
            sel.value = user.role;
          }
        };
      });

      rolesHost.querySelectorAll(".settings-switch-user").forEach((btn) => {
        btn.onclick = async () => {
          const uid = btn.dataset.uid;
          try {
            switchDemoUser(uid);
            renderRolesList();
          } catch (err) {
            showToast(err.message, "error");
          }
        };
      });

      rolesHost.querySelectorAll(".settings-deactivate-user").forEach((btn) => {
        btn.onclick = async () => {
          try {
            await deactivateUser(btn.dataset.uid);
            invalidateRoleCache();
            renderRolesList();
            showToast("User deactivated");
          } catch (err) {
            showToast(err.message, "error");
          }
        };
      });

      rolesHost.querySelectorAll(".settings-reactivate-user").forEach((btn) => {
        btn.onclick = async () => {
          try {
            await reactivateUser(btn.dataset.uid);
            renderRolesList();
            showToast("User reactivated");
          } catch (err) {
            showToast(err.message, "error");
          }
        };
      });

      rolesHost.querySelectorAll(".settings-remove-user").forEach((btn) => {
        btn.onclick = async () => {
          try {
            await removeEmployee(btn.dataset.uid);
            renderRolesList();
            showToast("User removed");
          } catch (err) {
            showToast(err.message, "error");
          }
        };
      });
    }

    updateSettingsKpi();
  }

  function renderAuditList(logs = []) {
    auditLogsCache = logs || [];
    const host = root.querySelector("#settings-audit-list");
    if (!host) return;
    if (!canPerformAction("manage_users")) {
      host.innerHTML = `<p class="proj-empty">Audit log is visible to Owner / Admin only.</p>`;
      updateSettingsKpi();
      return;
    }
    const sorted = [...auditLogsCache].sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0)).slice(0, 40);
    if (!sorted.length) {
      host.innerHTML = `<p class="proj-empty">No audit entries yet</p>`;
      updateSettingsKpi();
      return;
    }
    host.innerHTML = `
      <ul class="proj-audit-list settings-audit-list">
        ${sorted.map((l) => {
          const diff = l.diffSummary || buildAuditDiff(l.beforeState, l.afterState);
          const before = l.beforeState ? `<pre class="audit-diff">${escapeHtml(JSON.stringify(l.beforeState, null, 2))}</pre>` : "";
          const after = l.afterState ? `<pre class="audit-diff">${escapeHtml(JSON.stringify(l.afterState, null, 2))}</pre>` : "";
          return `
          <li>
            <span class="proj-audit-action">${escapeHtml(l.actionType || l.action)}</span>
            <span class="proj-audit-entity">${escapeHtml(l.entityType)} · ${escapeHtml(l.entityId || "")}</span>
            <p>${escapeHtml(diff)}</p>
            ${before || after ? `<details class="audit-diff-details"><summary>Before / after</summary>${before}${after}</details>` : ""}
            <time>${formatDate(l.timestamp)} · ${escapeHtml(l.actorId || "")}</time>
          </li>`;
        }).join("")}
      </ul>
    `;
    updateSettingsKpi();
  }

  renderRolesList();
  updateSettingsKpi();

  const addUserForm = root.querySelector("#settings-add-user-form");
  if (addUserForm) {
    addUserForm.style.display = canManageUsers() ? "" : "none";
    addUserForm.onsubmit = async (e) => {
      e.preventDefault();
      try {
        await createEmployee({
          displayName: addUserForm.displayName.value,
          email: addUserForm.email.value,
          role: addUserForm.role.value,
        });
        addUserForm.reset();
        renderRolesList();
        showToast("Employee added");
      } catch (err) {
        showToast(err.message, "error");
      }
    };
  }

  const unsubs = [
    listenValue("companyProfile/main", (p) => {
      companyProfile = p || null;
      syncProfileView(companyProfile);
      if (profileMode !== "edit") {
        populateProfileForm(companyProfile);
      }
      updateSettingsKpi();
    }),
    listenValue("roles", () => {
      invalidateRoleCache();
      renderRolesList();
    }),
    listenList("auditLogs", (list) => renderAuditList(list)),
  ];

  form.onsubmit = async (e) => {
    e.preventDefault();
    try {
      await updatePath("companyProfile/main", {
        name: form.name.value,
        address: form.address.value,
        phone: form.phone.value,
      });
      companyProfile = {
        name: form.name.value,
        address: form.address.value,
        phone: form.phone.value,
      };
      syncProfileView(companyProfile);
      setProfileMode("view");
      updateSettingsKpi();
      showToast("Saved");
    } catch (err) {
      showToast(err.message, "error");
    }
  };

  root.querySelector("#backup-btn").onclick = async () => {
    try {
      await triggerBackupMetaClient();
      root.querySelector("#backup-status").textContent = "Backup marker saved";
      showToast("Backup requested");
    } catch (err) {
      showToast(err.message, "error");
    }
  };

  return { unmount: () => unsubs.forEach((u) => u()) };
}
