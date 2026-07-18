/** Responsibility tasks and compliance alerts for dashboard */

import { milestoneVariance } from "./svc_workflow.js";
import { isGovProject, projectTypeLabel } from "./util_govProject.js";
import { roleLabel, normalizeRole } from "./util_roles.js";
import { detectOverAllocation, prioritySeverity } from "./util_projectTeam.js";
import { expiryAlertLevel, normalizeDocumentType, requiresExpiry } from "./util_projectDocument.js";

const todayISO = () => new Date().toISOString().slice(0, 10);

function daysUntil(dateStr) {
  if (!dateStr) return null;
  const diff = new Date(dateStr).getTime() - Date.now();
  return Math.ceil(diff / 86400000);
}

/**
 * Unified task list for dashboard "My Responsibilities".
 */
export function collectMyTasks({
  userId,
  role,
  projects = [],
  milestonesByProject = {},
  approvalQueue = [],
  qualityByProject = {},
  responsibilityTasksByProject = {},
}) {
  const r = normalizeRole(role);
  const tasks = [];
  const projectMap = new Map(projects.map((p) => [p.id, p]));

  for (const p of projects) {
    const milestones = milestonesByProject[p.id] || [];
    for (const m of milestones) {
      const mine =
        m.ownerId === userId ||
        m.responsibleRole === r ||
        (r === "project_manager" && p.projectManagerId === userId);
      if (!mine) continue;
      if (m.status === "completed") continue;
      const v = milestoneVariance(m, todayISO());
      tasks.push({
        title: m.title,
        projectName: p.name,
        projectId: p.id,
        deadline: m.plannedDate || "—",
        type: "Milestone",
        status: m.status || "pending",
        severity: v.key === "delayed" ? "high" : "normal",
        link: `#/projects?select=${p.id}`,
      });
    }
  }

  for (const q of approvalQueue) {
    if (q.status !== "pending") continue;
    if (r !== "owner" && r !== "project_manager" && r !== "accountant" && r !== "site_engineer") continue;
    const p = projectMap.get(q.projectId);
    tasks.push({
      title: q.title || q.entityType,
      projectName: p?.name || "—",
      projectId: q.projectId,
      deadline: q.submittedAt ? new Date(q.submittedAt).toISOString().slice(0, 10) : "—",
      type: "Approval",
      status: "pending",
      severity: (q.ageDays || 0) > 7 ? "high" : "normal",
      link: "#/approvals",
    });
  }

  if (r === "site_engineer" || r === "owner" || r === "project_manager") {
    for (const p of projects) {
      const checks = qualityByProject[p.id] || [];
      for (const q of checks) {
        if (q.assignee && q.assignee !== userId && r !== "owner") continue;
        if (q.status === "approved" || q.status === "closed") continue;
        tasks.push({
          title: q.title || "Quality check",
          projectName: p.name,
          projectId: p.id,
          deadline: q.dueDate || "—",
          type: "Quality",
          status: q.status || "open",
          severity: "normal",
          link: `#/projects?select=${p.id}`,
        });
      }
    }
  }

  for (const p of projects) {
    const respTasks = responsibilityTasksByProject[p.id] || [];
    for (const t of respTasks) {
      if (t.assigneeUserId !== userId) continue;
      if (t.status === "done") continue;
      tasks.push({
        title: t.title,
        projectName: p.name,
        projectId: p.id,
        deadline: t.deadline || "—",
        type: "Task",
        status: t.status || "open",
        severity: prioritySeverity(t.priority),
        link: `#/projects?select=${p.id}`,
      });
    }
  }

  return tasks.sort((a, b) => {
    if (a.severity === "high" && b.severity !== "high") return -1;
    if (b.severity === "high" && a.severity !== "high") return 1;
    return String(a.deadline).localeCompare(String(b.deadline));
  });
}

/**
 * Compliance alerts for gov/private projects.
 */
export function collectComplianceAlerts({
  projects = [],
  ipcBillsByProject = {},
  clientInvoices = [],
  milestonesByProject = {},
  paymentMilestonesByProject = {},
  documentsByProject = {},
}) {
  const alerts = [];
  const today = todayISO();

  for (const p of projects) {
    if (isGovProject(p)) {
      const ipc = ipcBillsByProject[p.id] || [];
      const openIpc = ipc.filter((b) => b.status === "draft" || b.status === "submitted").length;
      if (openIpc) {
        alerts.push({
          level: "warn",
          projectName: p.name,
          message: `${openIpc} open IPC bill(s) — measurement book certification pending`,
        });
      }
      if (p.complianceStatus === "non_compliant") {
        alerts.push({
          level: "critical",
          projectName: p.name,
          message: "Regulatory compliance checklist incomplete or non-compliant",
        });
      }
      if (p.bgExpiryDate && p.bgExpiryDate <= today) {
        alerts.push({
          level: "critical",
          projectName: p.name,
          message: `Bank guarantee expired (${p.bgType || "BG"} — ${p.bgBank || "bank"})`,
        });
      } else if (p.bgExpiryDate) {
        const days = daysUntil(p.bgExpiryDate);
        if (days !== null && days <= 30) {
          alerts.push({
            level: "warn",
            projectName: p.name,
            message: `Bank guarantee expires in ${days} day(s)`,
          });
        }
      }
    } else {
      const unpaid = clientInvoices.filter(
        (b) =>
          b.projectId === p.id &&
          b.status !== "paid" &&
          b.status !== "cancelled" &&
          Number(b.amount || 0) > Number(b.paidAmount || 0)
      );
      if (unpaid.length) {
        alerts.push({
          level: "warn",
          projectName: p.name,
          message: `${unpaid.length} client bill(s) with outstanding balance`,
        });
      }
      const payMs = paymentMilestonesByProject[p.id] || [];
      const overduePayMs = payMs.filter(
        (m) => m.status === "pending" && m.dueDate && m.dueDate < today
      );
      if (overduePayMs.length) {
        alerts.push({
          level: "warn",
          projectName: p.name,
          message: `${overduePayMs.length} overdue payment milestone(s) — billing pending`,
        });
      }
    }

    const milestones = milestonesByProject[p.id] || [];
    for (const m of milestones) {
      const v = milestoneVariance(m, today);
      if (v.key === "delayed" && m.status !== "completed") {
        alerts.push({
          level: "critical",
          projectName: p.name,
          message: `Overdue milestone: ${m.title} (${roleLabel(m.responsibleRole) || "unassigned"})`,
        });
      }
    }

    const docs = documentsByProject[p.id] || [];
    for (const d of docs) {
      if (!requiresExpiry(normalizeDocumentType(d.type || d.docType))) continue;
      const level = expiryAlertLevel(d.expiryDate);
      if (level === "critical") {
        alerts.push({
          level: "critical",
          projectName: p.name,
          message: `${d.title || "Permit/License"} expired (${d.expiryDate})`,
        });
      } else if (level === "warn") {
        const days = daysUntil(d.expiryDate);
        alerts.push({
          level: "warn",
          projectName: p.name,
          message: `${d.title || "Permit/License"} expires in ${days} day(s)`,
        });
      }
    }
  }

  return alerts;
}

/**
 * Over-allocation alerts for dashboard compliance section.
 * @param {object[]} assignments
 * @param {object[]} users
 */
export function collectAllocationAlerts(assignments = [], users = []) {
  const over = detectOverAllocation(assignments);
  const userMap = new Map((users || []).map((u) => [u.id, u]));
  return over.map((o) => ({
    level: "warn",
    projectName: "Cross-project",
    message: `${userMap.get(o.userId)?.displayName || o.userId} is allocated ${o.total}% across ${o.projects.length} project(s)`,
  }));
}

export function formatProjectTypeShort(project) {
  return projectTypeLabel(project?.projectType);
}
