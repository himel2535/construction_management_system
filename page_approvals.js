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
import {
  approvalEntityLabel,
  approvalResponsibilityFor,
  approvePageLabels,
  approvableEntitiesForRole,
} from "./util_approvalResponsibility.js";
import { roleLabel } from "./util_roles.js";
import { formatDate } from "./util_format.js";
import { showToast, actionFeedback } from "./cmp_toast.js";
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

function entityTypeBadge(entityType) {
  const label = approvalEntityLabel(entityType);
  return `<span class="appr-entity-badge">${escapeHtml(label)}</span>`;
}

function approverPrimaryLabel(entityType) {
  const row = approvalResponsibilityFor(entityType);
  if (!row?.approverRoles?.length) return "Approver";
  return roleLabel(row.approverRoles[0]);
}

function approverChipsHtml(entityType) {
  const row = approvalResponsibilityFor(entityType);
  if (!row?.approverRoles?.length) {
    return '<span class="appr-role-chips"><span class="appr-role-chip">Approver</span></span>';
  }
  const labels = row.approverRoles.map((r) => roleLabel(r));
  const chips = labels.map((l) => `<span class="appr-role-chip">${escapeHtml(l)}</span>`).join("");
  return `<span class="appr-role-chips">${chips}</span>`;
}

function queueRowWaitingHtml(q) {
  const waitLabel = q.entityType === "projectExpense" ? expenseQueueRowAwaitingLabel(q) : "";
  if (waitLabel) {
    return `<span class="text-muted appr-awaiting">${escapeHtml(waitLabel)}</span>`;
  }
  return `<div class="appr-status-block">
    <span class="appr-needs-badge">Needs ${escapeHtml(approverPrimaryLabel(q.entityType))}</span>
    <span class="appr-needs-route">${escapeHtml(approvePageLabels(q.entityType))}</span>
  </div>`;
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
      ? `<button type="button" class="btn btn-reject btn-sm appr-reject" data-id="${escapeHtml(q.id)}">${rejectLabel}</button>`
      : "";
    return `<div class="appr-action-btns">${approveBtn}${rejectBtn}</div>`;
  }
  return queueRowWaitingHtml(q);
}

function submittedMetaHtml(q) {
  const age = q.submittedAt ? Math.floor((Date.now() - q.submittedAt) / 86400000) : 0;
  const dateLabel = q.submittedAt ? formatDate(q.submittedAt) : "—";
  const ageLabel = `${age} day${age === 1 ? "" : "s"}`;
  return `<span class="appr-meta-date">${escapeHtml(dateLabel)}</span><span class="appr-meta-sub">${escapeHtml(ageLabel)}</span>`;
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
      btn.onclick = () => actOnQueue(btn.dataset.id, "approve", btn);
    });
    scope.querySelectorAll(".appr-reject").forEach((btn) => {
      btn.onclick = () => actOnQueue(btn.dataset.id, "reject", btn);
    });
  }

  function render() {
    const role = getCurrentRole();
    const pending = visiblePending();
    const approvable = approvableEntitiesForRole(role);
    subEl.textContent =
      approvable.length > 0
        ? `Role: ${roleLabel(role)} · You can approve: ${approvable.join(", ")}`
        : `Role: ${roleLabel(role)} · No approval actions for this role`;
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
      <div class="table-wrap projects-table-wrap appr-table-wrap">
        <table class="dash-table projects-table" id="appr-table">
          <colgroup>
            <col class="appr-col-entity" />
            <col class="appr-col-title" />
            <col class="appr-col-project" />
            <col class="appr-col-approver" />
            <col class="appr-col-meta" />
            <col class="appr-col-actions" />
          </colgroup>
          <thead>
            <tr>
              <th class="appr-col-entity">Entity</th>
              <th class="appr-col-title">Request</th>
              <th class="appr-col-project">Project</th>
              <th class="appr-col-approver">Approver</th>
              <th class="appr-col-meta">Submitted</th>
              <th class="appr-col-actions">Actions</th>
            </tr>
          </thead>
          <tbody>
            ${pending
              .map((q) => {
                const title = q.title || q.entityId;
                const project = projName(q.projectId);
                return `<tr data-id="${escapeHtml(q.id)}">
                  <td class="appr-col-entity">${entityTypeBadge(q.entityType)}</td>
                  <td class="appr-col-title" title="${escapeHtml(title)}"><strong>${escapeHtml(title)}</strong></td>
                  <td class="appr-col-project" title="${escapeHtml(project)}">${escapeHtml(project)}</td>
                  <td class="appr-col-approver">${approverChipsHtml(q.entityType)}</td>
                  <td class="appr-col-meta">${submittedMetaHtml(q)}</td>
                  <td class="appr-col-actions">${queueRowActionHtml(q)}</td>
                </tr>`;
              })
              .join("")}
          </tbody>
        </table>
      </div>
    `;
    bindActionButtons(bodyEl);
  }

  async function actOnQueue(queueId, decision, btnElement) {
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
    
    if (btnElement) {
      btnElement.disabled = true;
      const sibling = decision === "approve" 
        ? btnElement.nextElementSibling 
        : btnElement.previousElementSibling;
      if (sibling) sibling.disabled = true;
      btnElement.textContent = decision === "approve" ? "Approving..." : "Rejecting...";
    }
    
    try {
      await applyQueueDecision({ row, decision });
      const verifyLinks = [];
      if (row.entityType === "projectExpense") {
        verifyLinks.push({ label: "Finance → Expenses", link: "/accounting" });
      } else if (String(row.entityType || "").toLowerCase().includes("purchase")) {
        verifyLinks.push({ label: "Procurement → Orders", link: "/purchases?tab=orders" });
      } else {
        verifyLinks.push({ label: "Approvals inbox", link: "/approvals" });
      }
      await actionFeedback(decision === "approve" ? "approval_accepted" : "approval_rejected", {
        entityLabel: row.title || row.entityType,
        verifyLinks,
        message: row.title ? `${row.title} — ${decision}d` : undefined,
        link: verifyLinks[0]?.link,
        entityId: row.entityId,
        projectId: row.projectId,
      });
      if (btnElement) {
        btnElement.textContent = decision === "approve" ? "Approved" : "Rejected";
        btnElement.classList.remove("btn-primary", "btn-reject");
        btnElement.classList.add("btn-secondary");
      }
    } catch (err) {
      if (btnElement) {
        btnElement.disabled = false;
        const sibling = decision === "approve" 
          ? btnElement.nextElementSibling 
          : btnElement.previousElementSibling;
        if (sibling) sibling.disabled = false;
        btnElement.textContent = decision === "approve" ? "Approve" : "Reject";
      }
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
