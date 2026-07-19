import { listenList, readRef } from "./svc_data.js";
import { applyQueueDecision, canPerformAction, getCurrentRole } from "./svc_governance.js";
import { formatDate } from "./util_format.js";
import { showToast } from "./cmp_toast.js";
import { setActiveNav } from "./cmp_layout.js";
import { setPageChrome } from "./cmp_header.js";
import { sectionCard } from "./cmp_ui.js";

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function mountApprovals(container) {
  setActiveNav();
  setPageChrome({
    title: "Approvals",
    subtitle: "Enterprise approval inbox — R3 workflow and R4 arbitration.",
  });

  const root = document.createElement("div");
  root.className = "page-approvals";
  container.appendChild(root);

  let queue = [];
  let projects = [];

  function render() {
    const role = getCurrentRole();
    const pending = queue.filter((q) => q.status === "pending");
    const card = sectionCard(
      "Pending approvals",
      `Role: ${role} · ${pending.length} item(s) awaiting action`
    );
    const body = card.querySelector(".section-card-body");

    if (!canPerformAction("approve")) {
      body.innerHTML = `<p class="proj-empty">Your role cannot approve items. Switch demo role in Settings seed or use owner.</p>`;
    } else if (!pending.length) {
      body.innerHTML = `<p class="proj-empty">No pending approvals</p>`;
    } else {
      const projName = (id) => projects.find((p) => p.id === id)?.name || id;
      body.innerHTML = `
        <div class="table-wrap">
          <table class="dash-table">
            <thead>
              <tr>
                <th>Entity</th>
                <th>Title</th>
                <th>Project</th>
                <th>Submitted</th>
                <th>Age (days)</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              ${pending
                .map((q) => {
                  const age = q.submittedAt
                    ? Math.floor((Date.now() - q.submittedAt) / 86400000)
                    : 0;
                  const isArb = q.workflowProfile === "arbitration" || q.entityType === "dispute";
                  const approveLabel = isArb ? "Accept review" : "Approve";
                  const rejectLabel = isArb ? "Close" : "Reject";
                  return `<tr data-id="${q.id}">
                    <td>${escapeHtml(q.entityType)}</td>
                    <td>${escapeHtml(q.title || q.entityId)}</td>
                    <td>${escapeHtml(projName(q.projectId))}</td>
                    <td>${q.submittedAt ? formatDate(q.submittedAt) : "—"}</td>
                    <td>${age}</td>
                    <td>
                      <button type="button" class="btn btn-primary btn-sm appr-approve" data-id="${q.id}">${approveLabel}</button>
                      <button type="button" class="btn btn-ghost btn-sm appr-reject" data-id="${q.id}">${rejectLabel}</button>
                    </td>
                  </tr>`;
                })
                .join("")}
            </tbody>
          </table>
        </div>
      `;
      body.querySelectorAll(".appr-approve").forEach((btn) => {
        btn.onclick = () => actOnQueue(btn.dataset.id, "approve");
      });
      body.querySelectorAll(".appr-reject").forEach((btn) => {
        btn.onclick = () => actOnQueue(btn.dataset.id, "reject");
      });
    }

    root.innerHTML = "";
    root.appendChild(card);
  }

  async function actOnQueue(queueId, decision) {
    const row = (readRef("approvalQueue") || {})[queueId];
    if (!row?.path) {
      showToast("Queue entry missing path", "error");
      return;
    }
    try {
      await applyQueueDecision({ row, decision });
      showToast(`Item ${decision === "approve" ? "accepted" : "rejected"}`);
    } catch (err) {
      showToast(err.message, "error");
    }
  }

  const unsubQ = listenList("approvalQueue", (list) => {
    queue = list;
    render();
  });
  const unsubP = listenList("projects", (list) => {
    projects = list;
    render();
  });

  render();

  return {
    unmount: () => {
      unsubQ();
      unsubP();
    },
  };
}
