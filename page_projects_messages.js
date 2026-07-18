import { formatDate } from "./util_format.js";
import { showToast } from "./cmp_toast.js";
import { sectionCard } from "./cmp_ui.js";
import { sendProjectMessage } from "./svc_projectMessage.js";
import { MESSAGE_PATHS } from "./util_projectMessage.js";

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export const MESSAGES_TAB_IDS = ["messages"];

export function bindMessagesSubs(state, listenProjectSub, onUpdate) {
  const pid = state.selectedProjectId;
  if (!pid) {
    state.projectMessages = [];
    return () => {};
  }
  const refresh = () => {
    if (MESSAGES_TAB_IDS.includes(state.activeTab)) onUpdate();
  };
  return listenProjectSub(MESSAGE_PATHS.messages(pid), (list) => {
    state.projectMessages = list.sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
    refresh();
  });
}

export function buildMessagesTab(state) {
  const card = sectionCard("Project messages", "In-app messaging scoped to this project (§2.1)");
  const body = card.querySelector(".section-card-body");
  if (!body) return card;
  const messages = state.projectMessages || [];

  const thread = document.createElement("div");
  thread.className = "proj-message-thread";
  thread.innerHTML = messages.length
    ? messages
        .map(
          (m) => `
        <article class="proj-message-item">
          <header class="proj-message-header">
            <strong>${escapeHtml(m.authorName || m.authorUid || "User")}</strong>
            <time>${formatDate(m.createdAt)}</time>
          </header>
          <p class="proj-message-body">${escapeHtml(m.body)}</p>
        </article>`
        )
        .join("")
    : `<p class="proj-empty">No messages yet — start the conversation below.</p>`;

  const form = document.createElement("form");
  form.className = "proj-message-compose";
  form.innerHTML = `
    <textarea name="body" rows="3" placeholder="Write a message to the project team…" required aria-label="Message"></textarea>
    <button type="submit" class="btn btn-primary btn-sm">Send</button>
  `;

  form.onsubmit = async (e) => {
    e.preventDefault();
    const bodyText = form.body.value.trim();
    if (!bodyText) return;
    try {
      await sendProjectMessage(state.selectedProjectId, { body: bodyText });
      form.reset();
      showToast("Message sent");
      thread.scrollTop = thread.scrollHeight;
    } catch (err) {
      showToast(err.message, "error");
    }
  };

  body.append(thread, form);
  requestAnimationFrame(() => {
    thread.scrollTop = thread.scrollHeight;
  });
  return card;
}
