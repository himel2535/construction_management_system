import { create, updatePath, readRef, listenList } from "./svc_data.js";
import { getCurrentUserId } from "./svc_auth.js";

/**
 * Create an in-app notification for a user.
 * @param {string} userId
 * @param {{ type?: string, title: string, message?: string, link?: string, projectId?: string }} payload
 */
export async function createNotification(userId, payload) {
  if (!userId) return null;
  const now = Date.now();
  return create(`notifications/${userId}`, {
    type: payload.type || "assignment",
    title: payload.title || "Notification",
    message: payload.message || "",
    link: payload.link || "",
    projectId: payload.projectId || "",
    meta: payload.meta || null,
    read: false,
    createdAt: now,
    createdBy: getCurrentUserId(),
  });
}

export async function markNotificationRead(userId, notificationId) {
  const cur = readRef(`notifications/${userId}/${notificationId}`) || {};
  await updatePath(`notifications/${userId}/${notificationId}`, {
    ...cur,
    read: true,
    readAt: Date.now(),
  });
}

export async function markAllNotificationsRead(userId) {
  const root = readRef(`notifications/${userId}`) || {};
  const now = Date.now();
  for (const [id, row] of Object.entries(root)) {
    if (!row || row.read) continue;
    await updatePath(`notifications/${userId}/${id}`, { ...row, read: true, readAt: now });
  }
}

/**
 * Subscribe to notifications for a user (nested under userId).
 * @param {string} userId
 * @param {(list: object[]) => void} cb
 */
export function listenUserNotifications(userId, cb) {
  if (!userId) {
    cb([]);
    return () => {};
  }
  return listenList(`notifications/${userId}`, cb);
}

export function unreadNotificationCount(notifications = []) {
  return (notifications || []).filter((n) => !n.read).length;
}
