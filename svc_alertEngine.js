import { resolveRead } from "./svc_tenant.js";
import { valToList } from "./svc_clientCache.js";
import { getCurrentUserId } from "./svc_auth.js";
import { listRoleUsers } from "./svc_governance.js";
import { createNotification } from "./svc_notifications.js";
import { listDocumentExpiryAlerts } from "./svc_projectDocument.js";
import { enrichProjectList } from "./svc_projectDetails.js";

const ALERT_WINDOW_DAYS = 14;

function daysUntil(dateStr, today = new Date().toISOString().slice(0, 10)) {
  if (!dateStr) return null;
  return Math.round((new Date(dateStr) - new Date(today)) / 86400000);
}

async function emitAlert(userId, alertKey, payload) {
  if (!userId) return;
  const existing = valToList(resolveRead(`notifications/${userId}`) || {});
  const dup = existing.find(
    (n) => n.meta?.alertKey === alertKey && !n.read && (Date.now() - (n.createdAt || 0)) < 86400000 * 3
  );
  if (dup) return;
  await createNotification(userId, {
    ...payload,
    meta: { alertKey, ...(payload.meta || {}) },
  });
}

/**
 * Scan operational data and emit in-app notifications for key deadlines.
 */
export async function scanAndEmitAlerts() {
  const today = new Date().toISOString().slice(0, 10);
  const users = listRoleUsers();
  const ownerIds = users.filter((u) => u.role === "owner" && u.active !== false).map((u) => u.id);
  const pmIds = users.filter((u) => u.role === "project_manager" && u.active !== false).map((u) => u.id);
  const notifyOwners = ownerIds.length ? ownerIds : [getCurrentUserId()];

  const tasksRoot = resolveRead("responsibilityTasks") || {};
  for (const t of Object.values(tasksRoot)) {
    if (!t || t.status === "done" || t.status === "completed") continue;
    if (!t.dueDate) continue;
    const days = daysUntil(t.dueDate, today);
    if (days == null || days > ALERT_WINDOW_DAYS) continue;
    const target = t.assigneeId || t.ownerId || pmIds[0] || notifyOwners[0];
    const key = `task_deadline:${t.id}:${t.dueDate}`;
    await emitAlert(target, key, {
      type: "task_deadline",
      title: days < 0 ? "Overdue task" : "Task deadline approaching",
      message: `${t.title || "Task"} — due ${t.dueDate}`,
      link: t.projectId ? `#/projects?id=${encodeURIComponent(t.projectId)}&tab=team` : "#/dashboard",
      projectId: t.projectId || "",
    });
  }

  const projects = enrichProjectList(valToList(resolveRead("projects") || {}));
  for (const p of projects) {
    if (!p.bgExpiryDate) continue;
    const days = daysUntil(p.bgExpiryDate, today);
    if (days == null || days > ALERT_WINDOW_DAYS) continue;
    const target = p.projectManagerId || notifyOwners[0];
    const key = `bg_expiry:${p.id}:${p.bgExpiryDate}`;
    await emitAlert(target, key, {
      type: "bg_expiry",
      title: days < 0 ? "Bank guarantee expired" : "Bank guarantee expiring",
      message: `${p.name} — BG expires ${p.bgExpiryDate}`,
      link: `#/projects?id=${encodeURIComponent(p.id)}&tab=compliance`,
      projectId: p.id,
    });
  }

  const invoices = valToList(resolveRead("clientInvoices") || {});
  for (const inv of invoices) {
    if (inv.status === "paid" || inv.status === "cancelled") continue;
    const due = inv.dueDate;
    if (!due) continue;
    const days = daysUntil(due, today);
    if (days == null || days > ALERT_WINDOW_DAYS) continue;
    const dueAmt = Math.max(0, Number(inv.amount || 0) - Number(inv.paidAmount || 0));
    if (dueAmt <= 0) continue;
    const acct = users.find((u) => u.role === "accountant" && u.active !== false);
    const target = acct?.id || notifyOwners[0];
    const key = `bill_due:${inv.id}:${due}`;
    await emitAlert(target, key, {
      type: "bill_due",
      title: days < 0 ? "Bill overdue" : "Bill due soon",
      message: `${inv.clientName || "Client"} — ${due} (${dueAmt})`,
      link: "#/billing",
      projectId: inv.projectId || "",
    });
  }

  const permitAlerts = [];
  const docsRoot = resolveRead("projectDocuments") || {};
  for (const [projectId, bucket] of Object.entries(docsRoot)) {
    const p = projects.find((x) => x.id === projectId);
    const docs = valToList(bucket || {});
    for (const { doc, level } of listDocumentExpiryAlerts(docs)) {
      permitAlerts.push({
        projectId,
        projectName: p?.name || projectId,
        projectManagerId: p?.projectManagerId,
        documentId: doc.id,
        title: doc.title || doc.name || "Document",
        expiryDate: doc.expiryDate,
        level,
      });
    }
  }
  for (const a of permitAlerts) {
    const target = a.projectManagerId || notifyOwners[0];
    const key = `permit_expiry:${a.documentId}:${a.expiryDate}`;
    await emitAlert(target, key, {
      type: "permit_expiry",
      title: a.level === "critical" ? "Permit expired" : "Permit expiring",
      message: `${a.projectName} — ${a.title} expires ${a.expiryDate}`,
      link: `#/projects?id=${encodeURIComponent(a.projectId)}&tab=documents`,
      projectId: a.projectId,
    });
  }
}
