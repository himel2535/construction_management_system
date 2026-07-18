/**
 * Project Team tab — assignments, RACI matrix, tasks & delegation (§2.4)
 */
import { removePath } from "./svc_data.js";
import { guardAction, listRoleUsers } from "./svc_governance.js";
import { formatDate } from "./util_format.js";
import { showToast } from "./cmp_toast.js";
import { sectionCard, statusChip } from "./cmp_ui.js";
import { openEditDialog } from "./cmp_projectTab.js";
import { RESPONSIBLE_ROLES, roleLabel } from "./util_roles.js";
import {
  TEAM_PATHS,
  RACI_TYPES,
  TASK_PRIORITIES,
  buildRaciMatrix,
  flattenTasksForDisplay,
  raciLabel,
  priorityLabel,
  isAssignmentActive,
  computeUserAllocation,
} from "./util_projectTeam.js";
import { readRef, valToList } from "./svc_data.js";
import {
  createTeamAssignment,
  endTeamAssignment,
} from "./svc_projectTeam.js";
import {
  createResponsibilityTask,
  delegateTask,
  createSubTask,
  updateResponsibilityTask,
} from "./svc_responsibilityTasks.js";

export const TEAM_TAB_IDS = ["team", "home"];

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function priorityChip(priority) {
  const p = String(priority || "medium").toLowerCase();
  const cls = `chip task-priority--${p.replace("_", "-")}`;
  return `<span class="${cls}">${escapeHtml(priorityLabel(p))}</span>`;
}

export function bindTeamSubs(state, listenProjectSub, listenList, onUpdate) {
  const pid = state.selectedProjectId;
  if (!pid) {
    state.teamAssignments = [];
    state.responsibilityTasks = [];
    return () => {};
  }
  const refresh = () => {
    if (TEAM_TAB_IDS.includes(state.activeTab)) onUpdate();
  };
  const u1 = listenList(TEAM_PATHS.assignments, (list) => {
    state.teamAssignments = list.filter((a) => a.projectId === pid);
    refresh();
  });
  const u2 = listenProjectSub(pid, TEAM_PATHS.tasks, (list) => {
    state.responsibilityTasks = list;
    refresh();
  });
  return () => {
    u1();
    u2();
  };
}

export function buildTeamTab(state, opts = {}) {
  const project = state.projects.find((p) => p.id === state.selectedProjectId);
  const card = sectionCard("Team & Responsibilities", "Role assignments, RACI matrix, and delegated tasks");
  const body = card.querySelector(".section-card-body");
  if (!project || !state.selectedProjectId) {
    body.innerHTML = `<p class="proj-empty">Select a project first</p>`;
    return card;
  }

  const users = listRoleUsers().filter((u) => u.role !== "client");
  const userOpts = users
    .map((u) => `<option value="${u.id}">${escapeHtml(u.displayName || u.email || u.id)} (${roleLabel(u.role)})</option>`)
    .join("");
  const roleOpts = RESPONSIBLE_ROLES.map(
    (r) => `<option value="${r}">${escapeHtml(roleLabel(r))}</option>`
  ).join("");
  const raciOpts = Object.values(RACI_TYPES)
    .map((r) => `<option value="${r.key}">${escapeHtml(r.label)}</option>`)
    .join("");
  const priorityOpts = Object.values(TASK_PRIORITIES)
    .map((p) => `<option value="${p.key}">${escapeHtml(p.label)}</option>`)
    .join("");

  const assignments = (state.teamAssignments || []).filter((a) => a.status !== "ended");
  const tasks = state.responsibilityTasks || [];
  const matrix = buildRaciMatrix(assignments, tasks, users);
  const flatTasks = flattenTasksForDisplay(tasks);

  const assignForm = document.createElement("form");
  assignForm.className = "form-grid proj-form team-assign-form";
  assignForm.innerHTML = `
    <select name="userId" required aria-label="Team member"><option value="">Team member</option>${userOpts}</select>
    <select name="role" aria-label="Role">${roleOpts}</select>
    <select name="raci" aria-label="RACI">${raciOpts}</select>
    <input name="allocationPercent" type="number" min="0" max="100" step="1" placeholder="Allocation %" required />
    <input name="startDate" type="date" aria-label="Start date" />
    <input name="endDate" type="date" aria-label="End date" />
    <button type="submit" class="btn btn-primary btn-sm">Add to team</button>
  `;

  const allocWarn = document.createElement("div");
  allocWarn.className = "team-overalloc-banner form-field--full";
  allocWarn.hidden = true;
  allocWarn.setAttribute("role", "alert");

  const allAssignments = () => valToList(readRef(TEAM_PATHS.assignments) || {});

  function refreshAllocWarning() {
    const userId = assignForm.querySelector('[name="userId"]')?.value;
    const pct = Number(assignForm.querySelector('[name="allocationPercent"]')?.value) || 0;
    if (!userId) {
      allocWarn.hidden = true;
      return;
    }
    const { total } = computeUserAllocation(userId, allAssignments());
    const projected = total + pct;
    if (projected > 100) {
      allocWarn.hidden = false;
      allocWarn.innerHTML = `<strong>Over-allocation warning</strong> — ${projected}% total across active projects (exceeds 100%). You can still save.`;
    } else {
      allocWarn.hidden = true;
    }
  }

  assignForm.querySelector('[name="userId"]')?.addEventListener("change", refreshAllocWarning);
  assignForm.querySelector('[name="allocationPercent"]')?.addEventListener("input", refreshAllocWarning);
  assignForm.onsubmit = async (e) => {
    e.preventDefault();
    try {
      guardAction("manage_team");
      const fd = new FormData(assignForm);
      await createTeamAssignment({
        projectId: state.selectedProjectId,
        userId: fd.get("userId"),
        role: fd.get("role"),
        raci: fd.get("raci"),
        allocationPercent: Number(fd.get("allocationPercent")) || 0,
        startDate: fd.get("startDate") || "",
        endDate: fd.get("endDate") || "",
      });
      assignForm.reset();
      showToast("Team member assigned");
      opts.onRefresh?.();
    } catch (err) {
      showToast(err.message, "error");
    }
  };

  const rosterTable = document.createElement("div");
  rosterTable.className = "table-wrap team-roster-table";
  rosterTable.innerHTML = `
    <h4 class="r3-subhead">Team roster</h4>
    <table class="dash-table">
      <thead><tr>
        <th>Member</th><th>Role</th><th>RACI</th><th class="text-right">%</th>
        <th>Start</th><th>End</th><th>Status</th><th>Actions</th>
      </tr></thead>
      <tbody>
        ${assignments.length ? assignments.map((a) => {
          const u = users.find((x) => x.id === a.userId);
          const name = u?.displayName || u?.email || a.userId;
          const active = isAssignmentActive(a);
          return `<tr>
            <td>${escapeHtml(name)}</td>
            <td>${escapeHtml(roleLabel(a.role))}</td>
            <td>${escapeHtml(raciLabel(a.raci))}</td>
            <td class="text-right">${Number(a.allocationPercent) || 0}%</td>
            <td>${escapeHtml(a.startDate || "—")}</td>
            <td>${escapeHtml(a.endDate || "—")}</td>
            <td>${statusChip(active ? "active" : "ended")}</td>
            <td class="proj-row-actions-cell">
              ${active ? `<button type="button" class="btn btn-ghost btn-sm team-end-btn" data-id="${a.id}">End</button>` : "—"}
            </td>
          </tr>`;
        }).join("") : '<tr class="empty-row"><td colspan="8">No team assignments — add members above</td></tr>'}
      </tbody>
    </table>
  `;

  rosterTable.querySelectorAll(".team-end-btn").forEach((btn) => {
    btn.onclick = async () => {
      try {
        guardAction("manage_team");
        await endTeamAssignment(btn.dataset.id);
        showToast("Assignment ended");
        opts.onRefresh?.();
      } catch (err) {
        showToast(err.message, "error");
      }
    };
  });

  const matrixEl = document.createElement("div");
  matrixEl.className = "team-raci-matrix-wrap";
  matrixEl.innerHTML = `
    <h4 class="r3-subhead">RACI matrix</h4>
    <div class="table-wrap">
      <table class="dash-table team-raci-matrix">
        <thead><tr>
          <th>Member</th><th>Role</th><th>R</th><th>A</th><th>C</th><th>I</th>
          <th class="text-right">Tasks</th><th class="text-right">Alloc %</th>
        </tr></thead>
        <tbody>
          ${matrix.length ? matrix.map((row) => `
            <tr>
              <td>${escapeHtml(row.displayName)}</td>
              <td>${escapeHtml(row.roleLabel)}</td>
              <td>${row.raciCounts.R || "—"}</td>
              <td>${row.raciCounts.A || "—"}</td>
              <td>${row.raciCounts.C || "—"}</td>
              <td>${row.raciCounts.I || "—"}</td>
              <td class="text-right">${row.taskCount}</td>
              <td class="text-right">${row.allocationPercent}%</td>
            </tr>
          `).join("") : '<tr class="empty-row"><td colspan="8">Assign team members to build RACI matrix</td></tr>'}
        </tbody>
      </table>
    </div>
  `;

  const taskForm = document.createElement("form");
  taskForm.className = "form-grid proj-form team-task-form";
  const parentOpts = tasks
    .filter((t) => !t.parentTaskId && t.status !== "done")
    .map((t) => `<option value="${t.id}">Sub-task of: ${escapeHtml(t.title)}</option>`)
    .join("");
  taskForm.innerHTML = `
    <input name="title" placeholder="Task title *" required />
    <select name="assigneeUserId" aria-label="Assignee"><option value="">Assignee</option>${userOpts}</select>
    <select name="raci" aria-label="RACI">${raciOpts}</select>
    <select name="priority" aria-label="Priority">${priorityOpts}</select>
    <input name="deadline" type="date" aria-label="Deadline" />
    <select name="parentTaskId" aria-label="Parent task"><option value="">Top-level task</option>${parentOpts}</select>
    <textarea name="description" placeholder="Description" rows="2"></textarea>
    <button type="submit" class="btn btn-primary btn-sm">Add task</button>
  `;
  taskForm.onsubmit = async (e) => {
    e.preventDefault();
    try {
      guardAction("manage_team");
      const fd = new FormData(taskForm);
      const parentId = fd.get("parentTaskId");
      const payload = {
        title: fd.get("title"),
        description: fd.get("description"),
        assigneeUserId: fd.get("assigneeUserId"),
        raci: fd.get("raci"),
        priority: fd.get("priority"),
        deadline: fd.get("deadline"),
      };
      if (parentId) {
        await createSubTask(state.selectedProjectId, parentId, payload);
      } else {
        await createResponsibilityTask(state.selectedProjectId, payload);
      }
      taskForm.reset();
      showToast("Task created");
      opts.onRefresh?.();
    } catch (err) {
      showToast(err.message, "error");
    }
  };

  const taskTable = document.createElement("div");
  taskTable.className = "table-wrap team-task-table";
  taskTable.innerHTML = `
    <h4 class="r3-subhead">Tasks & delegation</h4>
    <table class="dash-table">
      <thead><tr>
        <th>Task</th><th>Assignee</th><th>RACI</th><th>Priority</th>
        <th>Deadline</th><th>Status</th><th>Actions</th>
      </tr></thead>
      <tbody>
        ${flatTasks.length ? flatTasks.map((t) => {
          const u = users.find((x) => x.id === t.assigneeUserId);
          const indent = t.depth ? "team-subtask" : "";
          return `<tr class="${indent}">
            <td>${t.depth ? "↳ " : ""}${escapeHtml(t.title)}</td>
            <td>${escapeHtml(u?.displayName || u?.email || "—")}</td>
            <td>${escapeHtml(raciLabel(t.raci))}</td>
            <td>${priorityChip(t.priority)}</td>
            <td>${escapeHtml(t.deadline || "—")}</td>
            <td>${statusChip(t.status || "open")}</td>
            <td class="proj-row-actions-cell">
              ${t.status !== "done" ? `<button type="button" class="btn btn-ghost btn-sm task-done-btn" data-id="${t.id}">Done</button>` : ""}
              ${t.status !== "done" ? `<button type="button" class="btn btn-ghost btn-sm task-delegate-btn" data-id="${t.id}">Delegate</button>` : "—"}
            </td>
          </tr>`;
        }).join("") : '<tr class="empty-row"><td colspan="7">No tasks yet</td></tr>'}
      </tbody>
    </table>
  `;

  taskTable.querySelectorAll(".task-done-btn").forEach((btn) => {
    btn.onclick = async () => {
      try {
        await updateResponsibilityTask(state.selectedProjectId, btn.dataset.id, { status: "done" });
        showToast("Task completed");
        opts.onRefresh?.();
      } catch (err) {
        showToast(err.message, "error");
      }
    };
  });

  taskTable.querySelectorAll(".task-delegate-btn").forEach((btn) => {
    btn.onclick = () => {
      const task = tasks.find((x) => x.id === btn.dataset.id);
      openEditDialog(
        "Delegate task",
        [
          {
            name: "toUserId",
            label: "Delegate to",
            type: "select",
            required: true,
            options: users.map((u) => ({
              value: u.id,
              label: `${u.displayName || u.email} (${roleLabel(u.role)})`,
            })),
          },
        ],
        {},
        async (vals) => {
          try {
            await delegateTask(state.selectedProjectId, btn.dataset.id, vals.toUserId);
            showToast(`Delegated: ${task?.title || "task"}`);
            opts.onRefresh?.();
          } catch (err) {
            showToast(err.message, "error");
          }
        }
      );
    };
  });

  body.innerHTML = "";
  body.append(assignForm, allocWarn, rosterTable, matrixEl, taskForm, taskTable);
  return card;
}
