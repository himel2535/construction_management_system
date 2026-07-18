import { create, updatePath, readRef, valToList } from "./svc_data.js";
import { getCurrentUserId } from "./svc_auth.js";
import { writeAuditLog } from "./svc_workflow.js";
import { createNotification } from "./svc_notifications.js";
import { TEAM_PATHS, detectOverAllocation } from "./util_projectTeam.js";

function validateAssignment(data) {
  const pct = Number(data.allocationPercent);
  if (!Number.isFinite(pct) || pct < 0 || pct > 100) {
    throw new Error("Allocation must be between 0 and 100%");
  }
  if (!data.userId) throw new Error("Select a team member");
  if (!data.projectId) throw new Error("Project is required");
  if (data.startDate && data.endDate && data.endDate < data.startDate) {
    throw new Error("End date must be on or after start date");
  }
}

async function notifyOverAllocation(userId) {
  const all = valToList(readRef(TEAM_PATHS.assignments) || {});
  const over = detectOverAllocation(all).find((o) => o.userId === userId);
  if (!over) return;
  await createNotification(userId, {
    type: "over_allocation",
    title: "Over-allocation warning",
    message: `Your active project allocation is ${over.total}% (exceeds 100%)`,
    link: "#/dashboard",
  });
}

export async function createTeamAssignment(data) {
  validateAssignment(data);
  const now = Date.now();
  const id = await create(TEAM_PATHS.assignments, {
    projectId: data.projectId,
    userId: data.userId,
    role: data.role || "site_engineer",
    raci: data.raci || "R",
    allocationPercent: Number(data.allocationPercent) || 0,
    startDate: data.startDate || "",
    endDate: data.endDate || "",
    status: "active",
    taskId: data.taskId || "",
    delegatedFromUserId: data.delegatedFromUserId || "",
    createdAt: now,
    updatedAt: now,
    createdBy: getCurrentUserId(),
  });

  if (data.role === "project_manager" && data.projectId) {
    await syncPmFromAssignment(data.projectId, data.userId);
  }

  await createNotification(data.userId, {
    type: "assignment",
    title: "New project assignment",
    message: `You were assigned as ${data.role || "team member"} (${data.raci || "R"})`,
    link: `#/projects?select=${data.projectId}`,
    projectId: data.projectId,
  });

  await notifyOverAllocation(data.userId);

  await writeAuditLog({
    entityType: "teamAssignment",
    entityId: id,
    action: "create",
    diffSummary: `Team assignment: ${data.userId} on project`,
    projectId: data.projectId,
  });

  return id;
}

export async function updateTeamAssignment(id, data) {
  const cur = readRef(`${TEAM_PATHS.assignments}/${id}`) || {};
  const merged = { ...cur, ...data, updatedAt: Date.now() };
  validateAssignment(merged);
  await updatePath(`${TEAM_PATHS.assignments}/${id}`, merged);

  if (merged.role === "project_manager" && merged.projectId) {
    await syncPmFromAssignment(merged.projectId, merged.userId);
  }

  if (data.userId && data.userId !== cur.userId) {
    await createNotification(data.userId, {
      type: "assignment",
      title: "Project assignment updated",
      message: `You were assigned on a project`,
      link: `#/projects?select=${merged.projectId}`,
      projectId: merged.projectId,
    });
  }

  await notifyOverAllocation(merged.userId);

  return merged;
}

export async function endTeamAssignment(id) {
  const cur = readRef(`${TEAM_PATHS.assignments}/${id}`) || {};
  const now = Date.now();
  await updatePath(`${TEAM_PATHS.assignments}/${id}`, {
    ...cur,
    status: "ended",
    endDate: cur.endDate || new Date().toISOString().slice(0, 10),
    updatedAt: now,
  });
}

export async function syncPmFromAssignment(projectId, userId) {
  if (!projectId || !userId) return;
  const project = readRef(`projects/${projectId}`) || {};
  if (project.projectManagerId === userId) return;
  await updatePath(`projects/${projectId}`, {
    ...project,
    projectManagerId: userId,
    updatedAt: Date.now(),
  });
}

/** Seed PM assignment after project create. */
export async function seedPmTeamAssignment(projectId, userId) {
  if (!projectId || !userId) return;
  const existing = valToList(readRef(TEAM_PATHS.assignments) || {}).filter(
    (a) => a.projectId === projectId && a.userId === userId && a.status === "active"
  );
  if (existing.length) return;
  const project = readRef(`projects/${projectId}`) || {};
  await createTeamAssignment({
    projectId,
    userId,
    role: "project_manager",
    raci: "A",
    allocationPercent: 50,
    startDate: project.startDate || new Date().toISOString().slice(0, 10),
  });
}
