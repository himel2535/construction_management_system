import { listenValue, updatePath, listenList } from "./svc_data.js";
import { triggerBackupMetaClient } from "./svc_operations.js";
import { showToast } from "./cmp_toast.js";
import { setActiveNav, refreshSidebarNav } from "./cmp_layout.js";
import { setPageChrome, syncHeaderUser } from "./cmp_header.js";
import { getCurrentUserId, setCurrentUser } from "./svc_auth.js";
import { getCurrentRole } from "./svc_governance.js";
import {
  invalidateRoleCache,
  listRoleUsers,
  guardAction,
  canPerformAction,
} from "./svc_governance.js";
import { ALL_ROLES, roleLabel, roleDescription, defaultRouteForRole } from "./util_roles.js";
import { navigateTo } from "./util_route.js";
import { PERMISSION_GROUPS, MATRIX_ROLES, roleHasPermission, matrixRoleLabel } from "./util_permissions.js";
import { createEmployee, deactivateUser, reactivateUser, removeEmployee } from "./svc_userManagement.js";
import { formatDate } from "./util_format.js";
import { buildAuditDiff } from "./util_audit.js";

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function renderPermissionMatrix() {
  const actionRows = PERMISSION_GROUPS.flatMap((g) =>
    g.actions.map((action) => ({ group: g.label, action }))
  );
  return `
    <div class="table-wrap settings-perm-matrix">
      <table class="dash-table">
        <thead><tr><th>Permission</th>${MATRIX_ROLES.map((r) => `<th>${escapeHtml(matrixRoleLabel(r))}</th>`).join("")}</tr></thead>
        <tbody>
          ${actionRows.map((row) => `
            <tr>
              <td><span class="text-muted">${escapeHtml(row.group)}</span> — ${escapeHtml(row.action)}</td>
              ${MATRIX_ROLES.map((r) => `<td class="perm-cell">${roleHasPermission(r, row.action) ? "✓" : "—"}</td>`).join("")}
            </tr>`).join("")}
        </tbody>
      </table>
    </div>
  `;
}

function renderSystemRolesTable() {
  return `
    <div class="table-wrap settings-roles-table">
      <table class="dash-table">
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
    subtitle: "Company profile, users, RBAC, audit log, and backup (§2.12).",
    showDateRange: false,
  });

  const root = document.createElement("div");
  root.className = "page-content content-grid-2";

  const homeRoute = defaultRouteForRole(getCurrentRole());
  const backLabel = getCurrentRole() === "client" ? "Back to Portal" : "Back to Dashboard";
  const backBar = document.createElement("div");
  backBar.className = "settings-back-bar";
  backBar.innerHTML = `<a href="#${homeRoute}" class="settings-back-link">← ${backLabel}</a>`;
  root.appendChild(backBar);

  const form = document.createElement("form");
  form.className = "card card-pad";
  form.innerHTML = `
    <h3 class="section-title">Company Profile</h3>
    <input name="name" placeholder="Company name" style="width:100%;margin-bottom:0.5rem" />
    <input name="address" placeholder="Address" style="width:100%;margin-bottom:0.5rem" />
    <input name="phone" placeholder="Phone" style="width:100%;margin-bottom:0.5rem" />
    <button type="submit" class="btn btn-primary" style="width:100%">Save</button>
  `;

  const rolesCard = document.createElement("div");
  rolesCard.className = "card card-pad";
  rolesCard.innerHTML = `
    <h3 class="section-title">Users &amp; Roles (§2.12)</h3>
    <p class="section-sub" id="settings-roles-note">Demo mode — switch active user role to test permissions.</p>
    <form id="settings-add-user-form" class="settings-add-user-form">
      <input name="displayName" placeholder="Full name" required />
      <input name="email" type="email" placeholder="Email" required />
      <select name="role" aria-label="Role">${ALL_ROLES.filter((r) => r !== "client").map((r) => `<option value="${r}">${escapeHtml(roleLabel(r))}</option>`).join("")}</select>
      <button type="submit" class="btn btn-primary btn-sm">Add employee</button>
    </form>
    <div id="settings-roles-list"></div>
  `;

  const permCard = document.createElement("div");
  permCard.className = "card card-pad settings-perm-card";
  permCard.innerHTML = `
    <h3 class="section-title">Permission matrix (RBAC)</h3>
    <p class="section-sub">Role-based access — Owner, PM, Engineer, Accountant (§2.12).</p>
    <div id="settings-perm-matrix"></div>
  `;

  const auditCard = document.createElement("div");
  auditCard.className = "card card-pad settings-audit-card";
  auditCard.innerHTML = `
    <h3 class="section-title">Audit log</h3>
    <p class="section-sub">Create, update, and delete actions with before/after snapshots.</p>
    <div id="settings-audit-list"></div>
  `;

  const systemRolesCard = document.createElement("div");
  systemRolesCard.className = "card card-pad settings-system-roles";
  systemRolesCard.innerHTML = `
    <h3 class="section-title">System Roles</h3>
    <p class="section-sub">Requirements §1.3 — system-wide role definitions.</p>
    <div id="settings-system-roles-table"></div>
  `;

  const backupBox = document.createElement("div");
  backupBox.className = "card card-pad";
  backupBox.innerHTML = `
    <h3 class="section-title">Backup</h3>
    <p class="section-sub">Mock mode — metadata marker only</p>
    <button type="button" class="btn btn-dark" id="backup-btn">Request backup</button>
    <p id="backup-status" style="margin-top:0.5rem;font-size:0.875rem"></p>
  `;

  root.append(form, rolesCard, permCard, auditCard, systemRolesCard, backupBox);
  container.appendChild(root);

  permCard.querySelector("#settings-perm-matrix").innerHTML = renderPermissionMatrix();

  systemRolesCard.querySelector("#settings-system-roles-table").innerHTML = renderSystemRolesTable();

  const rolesHost = rolesCard.querySelector("#settings-roles-list");
  const rolesNote = rolesCard.querySelector("#settings-roles-note");

  function canManageUsers() {
    return canPerformAction("manage_users");
  }

  function renderRolesList() {
    const users = listRoleUsers();
    const currentId = getCurrentUserId();
    const manage = canManageUsers();

    rolesNote.textContent = manage
      ? "Demo mode — switch active user role to test permissions."
      : "Only Owner can change roles (demo mode).";

    if (!users.length) {
      rolesHost.innerHTML = `<p class="proj-empty">No users seeded</p>`;
      return;
    }

    rolesHost.innerHTML = users
      .filter((u) => !u.deletedAt)
      .map((u) => {
        const desc = roleDescription(u.role);
        const inactive = u.active === false;
        const roleControl = manage
          ? `<select class="toolbar-select settings-role-select" data-uid="${u.id}" aria-label="Role for ${escapeHtml(u.displayName || u.id)}" ${inactive ? "disabled" : ""}>
              ${ALL_ROLES.map(
                (r) =>
                  `<option value="${r}" ${u.role === r ? "selected" : ""}>${escapeHtml(roleLabel(r))}</option>`
              ).join("")}
            </select>`
          : `<span class="chip">${escapeHtml(roleLabel(u.role))}</span>`;
        const switchBtn =
          manage && u.id !== currentId && !inactive
            ? `<button type="button" class="btn btn-ghost btn-sm settings-switch-user" data-uid="${u.id}">Switch to</button>`
            : u.id === currentId
              ? `<span class="chip">Active session</span>`
              : "";
        const statusChip = inactive
          ? `<span class="chip chip--warn">Deactivated</span>`
          : `<span class="chip chip--ok">Active</span>`;
        const adminBtns = manage && u.id !== currentId
          ? inactive
            ? `<button type="button" class="btn btn-ghost btn-sm settings-reactivate-user" data-uid="${u.id}">Reactivate</button>
               <button type="button" class="btn btn-ghost btn-sm settings-remove-user" data-uid="${u.id}">Remove</button>`
            : `<button type="button" class="btn btn-ghost btn-sm settings-deactivate-user" data-uid="${u.id}">Deactivate</button>`
          : "";

        return `
      <div class="settings-role-row${u.id === currentId ? " is-active-user" : ""}${inactive ? " is-inactive-user" : ""}" data-uid="${u.id}">
        <div class="settings-role-info">
          <strong>${escapeHtml(u.displayName || u.email || u.id)}</strong>
          <span class="text-muted">${escapeHtml(u.email || "")}</span>
          ${desc ? `<span class="settings-role-desc">${escapeHtml(desc)}</span>` : ""}
          ${statusChip}
        </div>
        <div class="settings-role-actions">
          ${roleControl}
          ${switchBtn}
          ${adminBtns}
        </div>
      </div>`;
      })
      .join("");

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
          const user = users.find((x) => x.id === uid);
          if (!user) return;
          try {
            guardAction("manage_users");
            setCurrentUser({
              id: uid,
              name: user.displayName || user.email,
              email: user.email,
              role: user.role,
            });
        invalidateRoleCache();
        refreshSidebarNav();
        syncHeaderUser();
        renderRolesList();
            showToast(`Switched to ${user.displayName || user.email}`);
            navigateTo(defaultRouteForRole(user.role));
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
  }

  function renderAuditList(logs = []) {
    const host = root.querySelector("#settings-audit-list");
    if (!host) return;
    if (!canPerformAction("manage_users")) {
      host.innerHTML = `<p class="proj-empty">Audit log is visible to Owner / Admin only.</p>`;
      return;
    }
    const sorted = [...logs].sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0)).slice(0, 40);
    if (!sorted.length) {
      host.innerHTML = `<p class="proj-empty">No audit entries yet</p>`;
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
  }

  renderRolesList();

  const addUserForm = rolesCard.querySelector("#settings-add-user-form");
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
      if (p) {
        form.name.value = p.name || "";
        form.address.value = p.address || "";
        form.phone.value = p.phone || "";
      }
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
      showToast("Saved");
    } catch (err) {
      showToast(err.message, "error");
    }
  };

  backupBox.querySelector("#backup-btn").onclick = async () => {
    try {
      await triggerBackupMetaClient();
      backupBox.querySelector("#backup-status").textContent = "Backup marker saved";
      showToast("Backup requested");
    } catch (err) {
      showToast(err.message, "error");
    }
  };

  return { unmount: () => unsubs.forEach((u) => u()) };
}
