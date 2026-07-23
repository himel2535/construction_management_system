/**
 * Project Team tab — assignments, RACI matrix, tasks & delegation (§2.4)
 */
import { readRef, valToList } from "./svc_data.js";
import { guardAction, listRoleUsers } from "./svc_governance.js";
import { showToast } from "./cmp_toast.js";
import { statusChip } from "./cmp_ui.js";
import { openCustFormDialog, openEditDialog } from "./cmp_projectTab.js";
import { renderBoqStatGrid } from "./page_projects_r2.js";
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

function teamUserSelectOptions(users) {
  return [
    { value: "", label: "Team member" },
    ...users.map((u) => ({
      value: u.id,
      label: `${u.displayName || u.email || u.id} (${roleLabel(u.role)})`,
    })),
  ];
}

function roleSelectOptions() {
  return RESPONSIBLE_ROLES.map((r) => ({ value: r, label: roleLabel(r) }));
}

function raciSelectOptions() {
  return Object.values(RACI_TYPES).map((r) => ({ value: r.key, label: r.label }));
}

function prioritySelectOptions() {
  return Object.values(TASK_PRIORITIES).map((p) => ({ value: p.key, label: p.label }));
}

function parentTaskSelectOptions(tasks) {
  return [
    { value: "", label: "Top-level task" },
    ...(tasks || [])
      .filter((t) => !t.parentTaskId && t.status !== "done")
      .map((t) => ({ value: t.id, label: `Sub-task of: ${t.title}` })),
  ];
}

function allTeamAssignments() {
  return valToList(readRef(TEAM_PATHS.assignments) || {});
}

function openAddTeamMemberDialog(state, opts = {}) {
  if (!state.selectedProjectId) {
    showToast("Select a project first", "error");
    return;
  }
  const users = listRoleUsers().filter((u) => u.role !== "client");
  const defaultRole = RESPONSIBLE_ROLES[0] || "";
  const defaultRaci = Object.values(RACI_TYPES)[0]?.key || "";

  openCustFormDialog({
    title: "Add to team",
    subtitle: "Assign a member with role, RACI, and allocation for this project.",
    submitLabel: "Add to team",
    modalClass: "proj-team-member-modal",
    values: {
      userId: "",
      role: defaultRole,
      raci: defaultRaci,
      allocationPercent: "",
      startDate: "",
      endDate: "",
    },
    sections: [
      {
        title: "Assignment",
        fields: [
          { name: "userId", label: "Team member *", type: "select", options: teamUserSelectOptions(users), required: true },
          { name: "role", label: "Role", type: "select", options: roleSelectOptions() },
          { name: "raci", label: "RACI", type: "select", options: raciSelectOptions() },
          {
            name: "allocationPercent",
            label: "Allocation % *",
            type: "number",
            step: "1",
            required: true,
          },
          { name: "startDate", label: "Start date", type: "date" },
          { name: "endDate", label: "End date", type: "date" },
        ],
      },
    ],
    onReady: ({ form, modal }) => {
      let banner = modal.querySelector(".team-overalloc-banner");
      if (!banner) {
        banner = document.createElement("div");
        banner.className = "team-overalloc-banner";
        banner.hidden = true;
        banner.setAttribute("role", "alert");
        const shell = modal.querySelector(".cust-form-shell");
        shell?.insertAdjacentElement("beforebegin", banner);
      }
      const refreshAllocWarning = () => {
        const userId = form.querySelector('[name="userId"]')?.value;
        const pct = Number(form.querySelector('[name="allocationPercent"]')?.value) || 0;
        if (!userId) {
          banner.hidden = true;
          return;
        }
        const { total } = computeUserAllocation(userId, allTeamAssignments());
        const projected = total + pct;
        if (projected > 100) {
          banner.hidden = false;
          banner.innerHTML = `<strong>Over-allocation warning</strong> — ${projected}% total across active projects (exceeds 100%). You can still save.`;
        } else {
          banner.hidden = true;
        }
      };
      form.querySelector('[name="userId"]')?.addEventListener("change", refreshAllocWarning);
      form.querySelector('[name="allocationPercent"]')?.addEventListener("input", refreshAllocWarning);
    },
    onSave: async (data) => {
      if (!data.userId) {
        showToast("Team member is required", "error");
        throw new Error("validation");
      }
      try {
        guardAction("manage_team");
        await createTeamAssignment({
          projectId: state.selectedProjectId,
          userId: data.userId,
          role: data.role,
          raci: data.raci,
          allocationPercent: Number(data.allocationPercent) || 0,
          startDate: data.startDate || "",
          endDate: data.endDate || "",
        });
        showToast("Team member assigned");
        opts.onRefresh?.();
      } catch (err) {
        if (err?.message !== "validation") showToast(err.message, "error");
        throw err;
      }
    },
  });
}

function openAddTaskDialog(state, opts = {}) {
  if (!state.selectedProjectId) {
    showToast("Select a project first", "error");
    return;
  }
  const users = listRoleUsers().filter((u) => u.role !== "client");
  const tasks = state.responsibilityTasks || [];
  const defaultPriority = Object.values(TASK_PRIORITIES)[0]?.key || "medium";
  const defaultRaci = Object.values(RACI_TYPES)[0]?.key || "";

  openCustFormDialog({
    title: "Add task",
    subtitle: "Create a responsibility task or sub-task for delegation on this project.",
    submitLabel: "Add task",
    modalClass: "proj-team-task-modal",
    values: {
      title: "",
      assigneeUserId: "",
      raci: defaultRaci,
      priority: defaultPriority,
      deadline: "",
      parentTaskId: "",
      description: "",
    },
    sections: [
      {
        title: "Task",
        fields: [
          { name: "title", label: "Title *", type: "text", required: true },
          { name: "assigneeUserId", label: "Assignee", type: "select", options: teamUserSelectOptions(users) },
          { name: "raci", label: "RACI", type: "select", options: raciSelectOptions() },
          { name: "priority", label: "Priority", type: "select", options: prioritySelectOptions() },
          { name: "deadline", label: "Deadline", type: "date" },
          {
            name: "parentTaskId",
            label: "Parent task",
            type: "select",
            options: parentTaskSelectOptions(tasks),
          },
        ],
      },
      {
        title: "Details",
        fields: [{ name: "description", label: "Description", type: "textarea", fullWidth: true }],
      },
    ],
    onSave: async (data) => {
      const title = String(data.title || "").trim();
      if (!title) {
        showToast("Task title is required", "error");
        throw new Error("validation");
      }
      try {
        guardAction("manage_team");
        const payload = {
          title,
          description: String(data.description || ""),
          assigneeUserId: data.assigneeUserId || "",
          raci: data.raci,
          priority: data.priority,
          deadline: data.deadline || "",
        };
        const parentId = data.parentTaskId || "";
        if (parentId) {
          await createSubTask(state.selectedProjectId, parentId, payload);
        } else {
          await createResponsibilityTask(state.selectedProjectId, payload);
        }
        showToast("Task created");
        opts.onRefresh?.();
      } catch (err) {
        if (err?.message !== "validation") showToast(err.message, "error");
        throw err;
      }
    },
  });
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
  const root = document.createElement("div");
  root.className = "proj-team-tab";
  const project = state.projects?.find((p) => p.id === state.selectedProjectId);
  if (!project || !state.selectedProjectId) {
    root.innerHTML = `<p class="proj-empty">Select a project first</p>`;
    return root;
  }

  const users = listRoleUsers().filter((u) => u.role !== "client");
  const assignments = (state.teamAssignments || []).filter((a) => a.status !== "ended");
  const tasks = state.responsibilityTasks || [];
  const matrix = buildRaciMatrix(assignments, tasks, users);
  const flatTasks = flattenTasksForDisplay(tasks);

  const openTasks = flatTasks.filter((t) => (t.status || "open") !== "done").length;
  const doneTasks = flatTasks.filter((t) => (t.status || "open") === "done").length;
  const avgAlloc =
    assignments.length > 0
      ? Math.round(
          assignments.reduce((s, a) => s + (Number(a.allocationPercent) || 0), 0) / assignments.length
        )
      : 0;

  const metricsSection = document.createElement("section");
  metricsSection.className = "proj-boq-metrics proj-boq-metrics--planning proj-team-metrics";
  metricsSection.innerHTML = `<h4 class="proj-boq-section-title">Team overview</h4>`;
  metricsSection.appendChild(
    renderBoqStatGrid([
      { label: "Active members", value: assignments.length },
      { label: "Open tasks", value: openTasks },
      { label: "Completed", value: doneTasks },
      { label: "Avg allocation", value: `${avgAlloc}%` },
    ])
  );
  const statGrid = metricsSection.querySelector(".proj-boq-stat-grid");
  if (statGrid) statGrid.classList.add("proj-team-stat-grid");

  const rosterCountLabel =
    assignments.length === 1
      ? "Showing 1 of 1 member"
      : `Showing ${assignments.length} of ${assignments.length} members`;

  const rosterWrap = document.createElement("div");
  rosterWrap.className = "reports-table-wrap proj-team-table proj-team-roster-shell";
  rosterWrap.innerHTML = `
    <div class="proj-team-table-head-row">
      <h4 class="proj-boq-section-title proj-team-table-head">Team roster</h4>
      <button type="button" class="btn btn-primary btn-sm proj-team-add-btn">Add to team</button>
    </div>
    <table class="dash-table projects-table">
      <colgroup>
        <col class="proj-team-col-name" />
        <col class="proj-team-col-equal" />
        <col class="proj-team-col-equal" />
        <col class="proj-team-col-equal" />
        <col class="proj-team-col-equal" />
        <col class="proj-team-col-equal" />
        <col class="proj-team-col-equal" />
        <col class="proj-team-col-equal" />
      </colgroup>
      <thead>
        <tr>
          <th>Member</th>
          <th>Role</th>
          <th>RACI</th>
          <th class="proj-team-col-pct">%</th>
          <th>Start</th>
          <th>End</th>
          <th>Status</th>
          <th class="rep-col-actions">Actions</th>
        </tr>
      </thead>
      <tbody>
        ${
          assignments.length
            ? assignments
                .map((a) => {
                  const u = users.find((x) => x.id === a.userId);
                  const name = u?.displayName || u?.email || a.userId;
                  const active = isAssignmentActive(a);
                  return `<tr>
            <td><strong class="proj-team-name-main">${escapeHtml(name)}</strong></td>
            <td>${escapeHtml(roleLabel(a.role))}</td>
            <td>${escapeHtml(raciLabel(a.raci))}</td>
            <td class="proj-team-col-pct">${Number(a.allocationPercent) || 0}%</td>
            <td>${escapeHtml(a.startDate || "—")}</td>
            <td>${escapeHtml(a.endDate || "—")}</td>
            <td>${statusChip(active ? "active" : "ended")}</td>
            <td class="rep-col-actions proj-row-actions-cell">
              ${active ? `<button type="button" class="btn btn-ghost btn-sm team-end-btn" data-id="${escapeHtml(a.id)}">End</button>` : "—"}
            </td>
          </tr>`;
                })
                .join("")
            : '<tr class="empty-row"><td colspan="8">No team assignments — click Add to team</td></tr>'
        }
      </tbody>
    </table>
    <div class="reports-widget-foot">
      <span class="reports-widget-foot-meta">${escapeHtml(rosterCountLabel)}</span>
    </div>
  `;

  const raciWrap = document.createElement("div");
  raciWrap.className = "reports-table-wrap proj-team-table proj-team-raci-shell";
  raciWrap.innerHTML = `
    <div class="proj-team-table-head-row proj-team-table-head-row--title-only">
      <h4 class="proj-boq-section-title proj-team-table-head">RACI matrix</h4>
    </div>
    <table class="dash-table projects-table team-raci-matrix">
      <colgroup>
        <col class="proj-team-col-name" />
        <col class="proj-team-col-equal" />
        <col class="proj-team-col-equal" />
        <col class="proj-team-col-equal" />
        <col class="proj-team-col-equal" />
        <col class="proj-team-col-equal" />
        <col class="proj-team-col-equal" />
        <col class="proj-team-col-equal" />
      </colgroup>
      <thead>
        <tr>
          <th>Member</th>
          <th>Role</th>
          <th>R</th>
          <th>A</th>
          <th>C</th>
          <th>I</th>
          <th class="proj-team-col-num">Tasks</th>
          <th class="proj-team-col-num">Alloc %</th>
        </tr>
      </thead>
      <tbody>
        ${
          matrix.length
            ? matrix
                .map(
                  (row) => `
            <tr>
              <td>${escapeHtml(row.displayName)}</td>
              <td>${escapeHtml(row.roleLabel)}</td>
              <td class="proj-team-col-num">${row.raciCounts.R || "—"}</td>
              <td class="proj-team-col-num">${row.raciCounts.A || "—"}</td>
              <td class="proj-team-col-num">${row.raciCounts.C || "—"}</td>
              <td class="proj-team-col-num">${row.raciCounts.I || "—"}</td>
              <td class="proj-team-col-num">${row.taskCount}</td>
              <td class="proj-team-col-num">${row.allocationPercent}%</td>
            </tr>`
                )
                .join("")
            : '<tr class="empty-row"><td colspan="8">Assign team members to build RACI matrix</td></tr>'
        }
      </tbody>
    </table>
  `;

  const taskCountLabel =
    flatTasks.length === 1
      ? "Showing 1 of 1 task"
      : `Showing ${flatTasks.length} of ${flatTasks.length} tasks`;

  const taskWrap = document.createElement("div");
  taskWrap.className = "reports-table-wrap proj-team-table proj-team-tasks-shell";
  taskWrap.innerHTML = `
    <div class="proj-team-table-head-row">
      <h4 class="proj-boq-section-title proj-team-table-head">Tasks & delegation</h4>
      <button type="button" class="btn btn-primary btn-sm proj-team-task-add-btn">Add task</button>
    </div>
    <table class="dash-table projects-table">
      <colgroup>
        <col class="proj-team-task-col-name" />
        <col class="proj-team-task-col-equal" />
        <col class="proj-team-task-col-equal" />
        <col class="proj-team-task-col-equal" />
        <col class="proj-team-task-col-equal" />
        <col class="proj-team-task-col-equal" />
        <col class="proj-team-task-col-equal" />
      </colgroup>
      <thead>
        <tr>
          <th>Task</th>
          <th>Assignee</th>
          <th>RACI</th>
          <th>Priority</th>
          <th>Deadline</th>
          <th>Status</th>
          <th class="rep-col-actions">Actions</th>
        </tr>
      </thead>
      <tbody>
        ${
          flatTasks.length
            ? flatTasks
                .map((t) => {
                  const u = users.find((x) => x.id === t.assigneeUserId);
                  const rowCls = t.depth ? "team-subtask" : "";
                  const actions =
                    t.status !== "done"
                      ? `<button type="button" class="btn btn-ghost btn-sm task-done-btn" data-id="${escapeHtml(t.id)}">Done</button>
                <button type="button" class="btn btn-ghost btn-sm task-delegate-btn" data-id="${escapeHtml(t.id)}">Delegate</button>`
                      : "—";
                  return `<tr class="${rowCls}">
            <td>${t.depth ? "↳ " : ""}${escapeHtml(t.title)}</td>
            <td>${escapeHtml(u?.displayName || u?.email || "—")}</td>
            <td>${escapeHtml(raciLabel(t.raci))}</td>
            <td>${priorityChip(t.priority)}</td>
            <td>${escapeHtml(t.deadline || "—")}</td>
            <td>${statusChip(t.status || "open")}</td>
            <td class="rep-col-actions proj-row-actions-cell">${actions}</td>
          </tr>`;
                })
                .join("")
            : '<tr class="empty-row"><td colspan="7">No tasks yet — click Add task</td></tr>'
        }
      </tbody>
    </table>
    <div class="reports-widget-foot">
      <span class="reports-widget-foot-meta">${escapeHtml(taskCountLabel)}</span>
    </div>
  `;

  root.append(metricsSection, rosterWrap, raciWrap, taskWrap);

  rosterWrap.querySelector(".proj-team-add-btn")?.addEventListener("click", () =>
    openAddTeamMemberDialog(state, opts)
  );
  taskWrap.querySelector(".proj-team-task-add-btn")?.addEventListener("click", () =>
    openAddTaskDialog(state, opts)
  );

  rosterWrap.querySelectorAll(".team-end-btn").forEach((btn) => {
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

  taskWrap.querySelectorAll(".task-done-btn").forEach((btn) => {
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

  taskWrap.querySelectorAll(".task-delegate-btn").forEach((btn) => {
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

  return root;
}
