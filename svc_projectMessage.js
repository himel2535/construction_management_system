import { create, readRef } from "./svc_data.js";
import { getCurrentUserId } from "./svc_auth.js";
import { listRoleUsers } from "./svc_governance.js";
import { createNotification } from "./svc_notifications.js";
import { MESSAGE_PATHS, validateMessageBody } from "./util_projectMessage.js";

/**
 * @param {string} projectId
 * @param {{ body: string, mentions?: string[] }} payload
 */
export async function sendProjectMessage(projectId, payload) {
  const body = validateMessageBody(payload.body);
  const authorUid = getCurrentUserId();
  const users = listRoleUsers();
  const author = users.find((u) => u.id === authorUid);
  const now = Date.now();
  const id = await create(MESSAGE_PATHS.messages(projectId), {
    projectId,
    authorUid,
    authorName: author?.displayName || author?.email || authorUid,
    body,
    mentions: payload.mentions || [],
    createdAt: now,
  });

  const project = readRef(`projects/${projectId}`);
  const pmId = project?.projectManagerId;
  const notifyIds = new Set(payload.mentions || []);
  if (pmId && pmId !== authorUid) notifyIds.add(pmId);

  for (const uid of notifyIds) {
    if (uid === authorUid) continue;
    await createNotification(uid, {
      type: "project_message",
      title: `New message on ${project?.name || "project"}`,
      message: body.slice(0, 120),
      link: `#/projects?id=${encodeURIComponent(projectId)}&tab=messages`,
      projectId,
      meta: { messageId: id },
    });
  }
  return id;
}
