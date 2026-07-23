import { formatDate } from "./util_format.js";
import { showToast } from "./cmp_toast.js";
import { sendProjectMessage } from "./svc_projectMessage.js";
import { renderBoqStatGrid } from "./page_projects_r2.js";

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
  return listenProjectSub(pid, "projectMessages", (list) => {
    state.projectMessages = list.sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
    refresh();
  });
}

function messageOverviewStats(messages) {
  const list = messages || [];
  const contributors = new Set(list.map((m) => m.authorUid).filter(Boolean)).size;
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayEnd = todayStart.getTime() + 86400000;
  const todayCount = list.filter((m) => {
    const t = m.createdAt;
    return t != null && t >= todayStart.getTime() && t < todayEnd;
  }).length;
  const last = list.length ? list[list.length - 1] : null;
  const latestLabel = last?.createdAt ? formatDate(last.createdAt) || "—" : "—";
  return {
    total: list.length,
    contributors,
    todayCount,
    latestLabel,
  };
}

export function buildMessagesTab(state) {
  const root = document.createElement("div");
  root.className = "proj-messages-tab";
  if (!state.selectedProjectId) {
    root.innerHTML = `<p class="proj-empty">Select a project first</p>`;
    return root;
  }

  const messages = state.projectMessages || [];
  const stats = messageOverviewStats(messages);

  const metricsSection = document.createElement("section");
  metricsSection.className = "proj-boq-metrics proj-boq-metrics--planning proj-messages-metrics";
  metricsSection.innerHTML = `<h4 class="proj-boq-section-title">Conversation overview</h4>`;
  metricsSection.appendChild(
    renderBoqStatGrid([
      { label: "Messages", value: stats.total },
      { label: "Contributors", value: stats.contributors },
      { label: "Today", value: stats.todayCount },
      { label: "Latest", value: stats.latestLabel },
    ])
  );
  const statGrid = metricsSection.querySelector(".proj-boq-stat-grid");
  if (statGrid) statGrid.classList.add("proj-messages-stat-grid");

  const feedShell = document.createElement("div");
  feedShell.className = "proj-messages-feed-shell";

  const headRow = document.createElement("div");
  headRow.className = "proj-messages-feed-head-row";
  headRow.innerHTML = `<h4 class="proj-boq-section-title proj-messages-feed-head">Project discussion</h4>`;

  const thread = document.createElement("div");
  thread.className = "proj-message-thread proj-messages-thread";
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
    : `<p class="proj-messages-empty">No messages yet — write below to start the conversation.</p>`;

  const form = document.createElement("form");
  form.className = "proj-message-compose proj-messages-compose";
  form.innerHTML = `
    <textarea name="body" rows="3" placeholder="Write a message to the project team…" required aria-label="Message"></textarea>
    <div class="proj-messages-compose-actions">
      <button type="submit" class="btn btn-primary btn-sm">Send</button>
    </div>
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

  feedShell.append(headRow, thread, form);
  root.append(metricsSection, feedShell);

  requestAnimationFrame(() => {
    thread.scrollTop = thread.scrollHeight;
  });

  return root;
}
