import { create, updatePath, readRef } from "./svc_data.js";
import { getCurrentUserId } from "./svc_auth.js";
import { writeAuditLog } from "./svc_workflow.js";
import { createNotification } from "./svc_notifications.js";
import { TEAM_PATHS } from "./util_projectTeam.js";

export async function createResponsibilityTask(projectId, data) {
  if (!projectId) throw new Error("Project is required");
  if (!data.title?.trim()) throw new Error("Task title is required");
  const now = Date.now();
  const id = await create(`${TEAM_PATHS.tasks}/${projectId}`, {
    title: data.title.trim(),
    description: data.description?.trim() || "",
    assigneeUserId: data.assigneeUserId || "",
    raci: data.raci || "R",
    priority: data.priority || "medium",
    deadline: data.deadline || "",
    parentTaskId: data.parentTaskId || "",
    status: "open",
    delegatedToUserId: "",
    delegatedFromUserId: "",
    assignmentId: data.assignmentId || "",
    createdAt: now,
    updatedAt: now,
    createdBy: getCurrentUserId(),
  });

  if (data.assigneeUserId) {
    await createNotification(data.assigneeUserId, {
      type: "task",
      title: "New task assigned",
      message: data.title.trim(),
      link: `/projects?select=${projectId}`,
      projectId,
    });
  }

  await writeAuditLog({
    entityType: "responsibilityTask",
    entityId: id,
    action: "create",
    diffSummary: `Task: ${data.title}`,
    projectId,
  });

  return id;
}

export async function updateResponsibilityTask(projectId, taskId, patch) {
  const cur = readRef(`${TEAM_PATHS.tasks}/${projectId}/${taskId}`) || {};
  const merged = { ...cur, ...patch, updatedAt: Date.now() };
  await updatePath(`${TEAM_PATHS.tasks}/${projectId}/${taskId}`, merged);

  if (patch.assigneeUserId && patch.assigneeUserId !== cur.assigneeUserId) {
    await createNotification(patch.assigneeUserId, {
      type: "task",
      title: "Task assigned to you",
      message: merged.title || "Task",
      link: `/projects?select=${projectId}`,
      projectId,
    });
  }

  return merged;
}

export async function delegateTask(projectId, taskId, toUserId) {
  if (!toUserId) throw new Error("Select a delegate");
  const cur = readRef(`${TEAM_PATHS.tasks}/${projectId}/${taskId}`) || {};
  const fromUserId = getCurrentUserId();
  await updatePath(`${TEAM_PATHS.tasks}/${projectId}/${taskId}`, {
    ...cur,
    status: "delegated",
    assigneeUserId: toUserId,
    delegatedToUserId: toUserId,
    delegatedFromUserId: fromUserId,
    updatedAt: Date.now(),
  });

  await createNotification(toUserId, {
    type: "task",
    title: "Task delegated to you",
    message: cur.title || "Task",
    link: `/projects?select=${projectId}`,
    projectId,
  });

  await writeAuditLog({
    entityType: "responsibilityTask",
    entityId: taskId,
    action: "delegate",
    diffSummary: `Delegated: ${cur.title} → ${toUserId}`,
    projectId,
  });
}

export async function createSubTask(projectId, parentTaskId, data) {
  const parent = readRef(`${TEAM_PATHS.tasks}/${projectId}/${parentTaskId}`) || {};
  return createResponsibilityTask(projectId, {
    ...data,
    parentTaskId,
    assigneeUserId: data.assigneeUserId || parent.assigneeUserId || "",
    raci: data.raci || parent.raci || "R",
  });
}
