import { listenList } from "./svc_data.js";
import {
  applyQueueDecision,
  clearApprovalQueue,
  getCurrentRole,
  isApprovalQueueRowStale,
  isApprovalQueueRowVisible,
} from "./svc_governance.js";
import {
  canApproveExpenseQueueRow,
  canRejectExpenseQueueRow,
  expenseQueueRowAwaitingLabel,
} from "./svc_projectExpense.js";
import { canRoleDecideQueueRow } from "./util_approvalQueue.js";
import { formatDate } from "./util_format.js";
import { showToast } from "./cmp_toast.js";
import { setActiveNav } from "./cmp_layout.js";
import { setPageChrome } from "./cmp_header.js";

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function canActOnQueueRow(row) {
  return canRoleDecideQueueRow(row, getCurrentRole(), {
    canApproveExpense: canApproveExpenseQueueRow,
  });
}

function canRejectQueueRow(row) {
  if (row.entityType === "projectExpense") {
    return canRejectExpenseQueueRow(row);
  }
  return canActOnQueueRow(row);
}

function queueRowActionHtml(q) {
  const isArb = q.workflowProfile === "arbitration" || q.entityType === "dispute";
  const approveLabel = isArb ? "Accept review" : "Approve";
  const rejectLabel = isArb ? "Close" : "Reject";
  const canApprove = canActOnQueueRow(q);
  const canReject = canRejectQueueRow(q);
  if (canApprove || canReject) {
    const approveBtn = canApprove
      ? `<button type="button" class="btn btn-primary btn-sm appr-approve" data-id="${escapeHtml(q.id)}">${approveLabel}</button>`
      : "";
    const rejectBtn = canReject
      ? `<button type="button" class="btn btn-ghost btn-sm appr-reject" data-id="${escapeHtml(q.id)}">${rejectLabel}</button>`
      : "";
    return `${approveBtn} ${rejectBtn}`.trim();
  }
  const waitLabel = q.entityType === "projectExpense" ? expenseQueueRowAwaitingLabel(q) : "";
  if (waitLabel) {
    return `<span class="text-muted appr-awaiting">${escapeHtml(waitLabel)}</span>`;
  }
  return `<span class="text-muted">—</span>`;
}

export function mountApprovals(container) {
  setActiveNav();
  setPageChrome({
    title: "Approvals",
    subtitle: "Enterprise approval inbox — R3 workflow and R4 arbitration.",
  });

  const root = document.createElement("div");
  root.className = "approvals-page page-approvals dashboard-page dashboard-mockup";
  root.innerHTML = `
    <section class="dash-widget dash-widget--approvals-inbox card" id="appr-inbox">
      <div class="dash-widget-head dash-widget-head--split">
        <div>
          <h3 class="dash-widget-title">Pending approvals</h3>
          <p class="dash-widget-sub" id="appr-sub"></p>
        </div>
        <span class="appr-inbox-count cust-toolbar-count" id="appr-count"></span>
      </div>
      <div class="dash-widget-body" id="appr-body"></div>
    </section>
  `;
  container.appendChild(root);

  const subEl = root.querySelector("#appr-sub");
  const countEl = root.querySelector("#appr-count");
  const bodyEl = root.querySelector("#appr-body");

  let queue = [];
  let projects = [];
  const staleReconcileAttempted = new Set();

  function visiblePending() {
    return queue.filter((q) => isApprovalQueueRowVisible(q));
  }

  function reconcileStaleQueue() {
    for (const q of queue) {
      if (q.status !== "pending" || !isApprovalQueueRowStale(q)) continue;
      const key = q.id || `${q.entityType}:${q.entityId}`;
      if (staleReconcileAttempted.has(key)) continue;
      staleReconcileAttempted.add(key);
      if (q.entityType && q.entityId) {
        clearApprovalQueue(q.entityType, q.entityId).catch(() => {});
      }
    }
  }

  function bindActionButtons(scope) {
    scope.querySelectorAll(".appr-approve").forEach((btn) => {
      btn.onclick = () => actOnQueue(btn.dataset.id, "approve");
    });
    scope.querySelectorAll(".appr-reject").forEach((btn) => {
      btn.onclick = () => actOnQueue(btn.dataset.id, "reject");
    });
  }

  function render() {
    const role = getCurrentRole();
    const pending = visiblePending();
    subEl.textContent = `Role: ${role} · review and action queued items`;
    countEl.textContent =
      pending.length === 0
        ? "No items pending"
        : `Showing ${pending.length} pending`;

    if (!pending.length) {
      bodyEl.innerHTML = `<p class="proj-empty">No pending approvals</p>`;
      return;
    }

    const projName = (id) => projects.find((p) => p.id === id)?.name || id;
    bodyEl.innerHTML = `
      <div class="table-wrap projects-table-wrap">
        <table class="dash-table projects-table" id="appr-table">
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
                return `<tr data-id="${escapeHtml(q.id)}">
                  <td>${escapeHtml(q.entityType)}</td>
                  <td>${escapeHtml(q.title || q.entityId)}</td>
                  <td>${escapeHtml(projName(q.projectId))}</td>
                  <td>${q.submittedAt ? formatDate(q.submittedAt) : "—"}</td>
                  <td>${age}</td>
                  <td>${queueRowActionHtml(q)}</td>
                </tr>`;
              })
              .join("")}
          </tbody>
        </table>
      </div>
    `;
    bindActionButtons(bodyEl);
  }

  async function actOnQueue(queueId, decision) {
    const found = queue.find((q) => q.id === queueId);
    const row = found ? { ...found, id: queueId } : null;
    if (!row?.path) {
      showToast("Queue entry missing path", "error");
      return;
    }
    if (decision === "approve" && !canActOnQueueRow(row)) {
      showToast(expenseQueueRowAwaitingLabel(row) || "You cannot approve this item yet", "error");
      return;
    }
    if (decision === "reject" && !canRejectQueueRow(row)) {
      showToast(expenseQueueRowAwaitingLabel(row) || "You cannot reject this item yet", "error");
      return;
    }
    try {
      await applyQueueDecision({ row, decision });
      showToast(`Item ${decision === "approve" ? "accepted" : "rejected"}`);
    } catch (err) {
      showToast(err.message, "error");
    }
  }

  function onQueueOrExpensesUpdate() {
    reconcileStaleQueue();
    render();
  }

  const unsubQ = listenList("approvalQueue", (list) => {
    queue = list;
    onQueueOrExpensesUpdate();
  });
  const unsubP = listenList("projects", (list) => {
    projects = list;
    render();
  });
  const unsubExp = listenList("projectExpenses", () => {
    onQueueOrExpensesUpdate();
  });

  render();

  return {
    unmount: () => {
      unsubQ();
      unsubP();
      unsubExp();
    },
  };
}
