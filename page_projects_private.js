/**
 * Private / local project — Client Contract, Billing tabs (§2.3)
 */
import { create, updatePath, removePath } from "./svc_data.js";
import { getCurrentUserId } from "./svc_auth.js";
import { guardAction, canPerformAction } from "./svc_governance.js";
import { updateClientInvoiceStatus } from "./svc_operations.js";
import { formatBDT } from "./util_format.js";
import { showToast } from "./cmp_toast.js";
import { sectionCard, statusChip } from "./cmp_ui.js";
import {
  PRIVATE_PATHS,
  computeRevisedContractValue,
  computePrivateKpis,
  computeMilestoneAmount,
  paymentMilestoneStatusLabel,
} from "./util_privateProject.js";
import {
  createInvoiceFromMilestone,
  syncMilestoneAmounts,
} from "./svc_privateProject.js";
import { auditProject } from "./cmp_projectTab.js";

export const PRIVATE_TAB_IDS = ["contract", "billing", "home", "contracts"];

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function milestoneStatusChip(status) {
  const s = String(status || "pending").toLowerCase();
  const cls =
    s === "paid"
      ? "chip chip-success private-ms--paid"
      : s === "invoiced"
        ? "chip chip-info private-ms--invoiced"
        : "chip chip-muted private-ms--pending";
  return `<span class="${cls}">${escapeHtml(paymentMilestoneStatusLabel(s))}</span>`;
}

function billActions(row) {
  const status = row.status || "draft";
  const parts = [];
  if (status === "draft" && canPerformAction("submit_billing")) {
    parts.push(`<button type="button" class="btn btn-ghost btn-sm bill-act" data-id="${row.id}" data-act="submitted">Submit</button>`);
  }
  if (status === "submitted" && canPerformAction("approve_billing")) {
    parts.push(`<button type="button" class="btn btn-primary btn-sm bill-act" data-id="${row.id}" data-act="approved">Approve</button>`);
  }
  if ((status === "approved" || status === "partial") && canPerformAction("approve_billing")) {
    const due = Math.max(0, Number(row.amount || 0) - Number(row.paidAmount || 0));
    if (due > 0) {
      parts.push(`<button type="button" class="btn btn-ghost btn-sm bill-act" data-id="${row.id}" data-act="record-payment">Record payment</button>`);
    }
  }
  return parts.join(" ") || "—";
}

export function bindPrivateSubs(state, listenProjectSub, listenList, onUpdate) {
  const pid = state.selectedProjectId;
  const tabs = [...PRIVATE_TAB_IDS];
  if (!pid) {
    state.paymentMilestones = [];
    state.clientInvoices = [];
    return () => {};
  }
  const refresh = () => {
    if (tabs.includes(state.activeTab)) onUpdate();
  };
  const u1 = listenProjectSub(pid, PRIVATE_PATHS.paymentMilestones, (list) => {
    state.paymentMilestones = list;
    refresh();
  });
  const u2 = listenList("clientInvoices", (list) => {
    state.clientInvoices = list.filter((inv) => inv.projectId === pid);
    refresh();
  });
  return () => {
    u1();
    u2();
  };
}

function privateBase() {
  const now = Date.now();
  return {
    status: "pending",
    invoiceId: "",
    createdAt: now,
    updatedAt: now,
    createdBy: getCurrentUserId(),
  };
}

export function buildPrivateContractTab(state, opts = {}) {
  const project = state.projects.find((p) => p.id === state.selectedProjectId);
  const card = sectionCard(
    "Client Contract",
    "Contract value, payment milestones, and approved variations"
  );
  const body = card.querySelector(".section-card-body");
  if (!project || !state.selectedProjectId) {
    body.innerHTML = `<p class="proj-empty">Select a project first</p>`;
    return card;
  }

  const changeOrders = state.changeOrders || [];
  const { base, variations, revised } = computeRevisedContractValue(project, changeOrders);
  const kpis = computePrivateKpis(project, {
    paymentMilestones: state.paymentMilestones,
    clientInvoices: state.clientInvoices,
    changeOrders,
  });
  const milestones = [...(state.paymentMilestones || [])].sort(
    (a, b) => String(a.dueDate || "").localeCompare(String(b.dueDate || ""))
  );

  const summary = document.createElement("div");
  summary.className = "r2-budget-summary private-contract-summary";
  summary.innerHTML = `
    <div class="r2-stat"><span class="cust-detail-label">Original contract</span><strong>${formatBDT(base)}</strong></div>
    <div class="r2-stat"><span class="cust-detail-label">Approved variations</span><strong>${formatBDT(variations)}</strong></div>
    <div class="r2-stat"><span class="cust-detail-label">Revised contract</span><strong>${formatBDT(revised)}</strong></div>
    <div class="r2-stat"><span class="cust-detail-label">Billed</span><strong>${formatBDT(kpis.billed)}</strong></div>
    <div class="r2-stat"><span class="cust-detail-label">Collected</span><strong>${formatBDT(kpis.collected)}</strong></div>
    <div class="r2-stat"><span class="cust-detail-label">Outstanding</span><strong>${formatBDT(kpis.outstanding)}</strong></div>
  `;

  const clientLine = document.createElement("p");
  clientLine.className = "private-contract-client text-muted";
  clientLine.textContent = `Client: ${project.clientName || "—"}`;

  const msForm = document.createElement("form");
  msForm.className = "form-grid proj-form private-ms-form";
  msForm.innerHTML = `
    <input name="description" placeholder="Milestone description *" required />
    <input name="percent" type="number" step="0.01" min="0" max="100" placeholder="Percent of contract *" required />
    <input name="dueDate" type="date" placeholder="Due date" />
    <button type="submit" class="btn btn-primary btn-sm">Add payment milestone</button>
  `;
  msForm.onsubmit = async (e) => {
    e.preventDefault();
    try {
      guardAction("create_change_order");
      const fd = new FormData(msForm);
      const percent = Number(fd.get("percent")) || 0;
      const amount = computeMilestoneAmount(revised, percent);
      const id = await create(`${PRIVATE_PATHS.paymentMilestones}/${state.selectedProjectId}`, {
        ...privateBase(),
        description: fd.get("description"),
        percent,
        dueDate: fd.get("dueDate") || "",
        amount,
      });
      await auditProject(state, {
        entityType: "paymentMilestone",
        entityId: id,
        action: "create",
        diffSummary: `Payment milestone: ${fd.get("description")}`,
      });
      msForm.reset();
      showToast("Payment milestone added");
      opts.onRefresh?.();
    } catch (err) {
      showToast(err.message, "error");
    }
  };

  const msTable = document.createElement("div");
  msTable.className = "table-wrap private-ms-table";
  msTable.innerHTML = `
    <h4 class="r3-subhead">Payment milestones</h4>
    <table class="dash-table">
      <thead><tr>
        <th>Description</th><th class="text-right">%</th><th class="text-right">Amount</th>
        <th>Due</th><th>Status</th><th>Actions</th>
      </tr></thead>
      <tbody>
        ${milestones.length ? milestones.map((m) => `
          <tr data-ms-id="${m.id}">
            <td>${escapeHtml(m.description || "—")}</td>
            <td class="text-right">${Number(m.percent || 0)}%</td>
            <td class="text-right">${formatBDT(m.amount || 0)}</td>
            <td>${escapeHtml(m.dueDate || "—")}</td>
            <td>${milestoneStatusChip(m.status)}</td>
            <td class="proj-row-actions-cell">
              ${m.status === "pending" ? `<button type="button" class="btn btn-ghost btn-sm ms-bill-btn" data-id="${m.id}">Create bill</button>` : ""}
              ${m.status === "pending" ? `<button type="button" class="btn btn-ghost btn-sm ms-del-btn" data-id="${m.id}">Remove</button>` : "—"}
            </td>
          </tr>
        `).join("") : '<tr class="empty-row"><td colspan="6">No payment milestones — add above or set contract value on create</td></tr>'}
      </tbody>
    </table>
  `;

  msTable.querySelectorAll(".ms-bill-btn").forEach((btn) => {
    btn.onclick = async () => {
      const row = milestones.find((x) => x.id === btn.dataset.id);
      if (!row) return;
      try {
        guardAction("submit_billing");
        await createInvoiceFromMilestone(state.selectedProjectId, row);
        showToast("Draft bill created — open Billing tab");
        opts.onNavigateTab?.("billing");
        opts.onRefresh?.();
      } catch (err) {
        showToast(err.message, "error");
      }
    };
  });

  msTable.querySelectorAll(".ms-del-btn").forEach((btn) => {
    btn.onclick = async () => {
      const row = milestones.find((x) => x.id === btn.dataset.id);
      if (!row || row.status !== "pending") return;
      try {
        await removePath(`${PRIVATE_PATHS.paymentMilestones}/${state.selectedProjectId}/${row.id}`);
        showToast("Milestone removed");
        opts.onRefresh?.();
      } catch (err) {
        showToast(err.message, "error");
      }
    };
  });

  const syncBtn = document.createElement("button");
  syncBtn.type = "button";
  syncBtn.className = "btn btn-ghost btn-sm";
  syncBtn.textContent = "Recalculate amounts";
  syncBtn.onclick = async () => {
    try {
      await syncMilestoneAmounts(state.selectedProjectId);
      showToast("Milestone amounts updated");
      opts.onRefresh?.();
    } catch (err) {
      showToast(err.message, "error");
    }
  };

  const navBilling = document.createElement("button");
  navBilling.type = "button";
  navBilling.className = "btn btn-ghost btn-sm";
  navBilling.textContent = "Open Billing tab →";
  navBilling.onclick = () => opts.onNavigateTab?.("billing");

  const actions = document.createElement("div");
  actions.className = "private-contract-actions";
  actions.append(syncBtn, navBilling);

  body.innerHTML = "";
  body.append(summary, clientLine, msForm, msTable, actions);
  return card;
}

export function buildPrivateBillingTab(state, opts = {}) {
  const project = state.projects.find((p) => p.id === state.selectedProjectId);
  const card = sectionCard(
    "Billing",
    "Project-scoped client bills — draft → submitted → approved → paid"
  );
  const body = card.querySelector(".section-card-body");
  if (!project || !state.selectedProjectId) {
    body.innerHTML = `<p class="proj-empty">Select a project first</p>`;
    return card;
  }

  const invoices = [...(state.clientInvoices || [])].sort(
    (a, b) => (b.createdAt || 0) - (a.createdAt || 0)
  );
  const pendingMs = (state.paymentMilestones || []).filter((m) => m.status === "pending");
  const msOpts = pendingMs
    .map((m) => `<option value="${m.id}">${escapeHtml(m.description)} — ${formatBDT(m.amount || 0)}</option>`)
    .join("");

  const createForm = document.createElement("form");
  createForm.className = "form-grid proj-form private-billing-form";
  createForm.innerHTML = `
    <select name="milestoneId" aria-label="From milestone">
      <option value="">Create bill from milestone (optional)</option>
      ${msOpts}
    </select>
    <select name="billType" aria-label="Bill type">
      <option value="milestone">Milestone bill</option>
      <option value="progress">Progress / RA bill</option>
      <option value="final">Final bill</option>
    </select>
    <input name="amount" type="number" step="0.01" min="0" placeholder="Bill amount (BDT) *" required />
    <input name="billDate" type="date" />
    <input name="description" placeholder="Description / bill ref" />
    <button type="submit" class="btn btn-primary btn-sm">Create draft bill</button>
  `;
  createForm.billDate.value = new Date().toISOString().slice(0, 10);

  createForm.onsubmit = async (e) => {
    e.preventDefault();
    try {
      guardAction("submit_billing");
      const fd = new FormData(createForm);
      const milestoneId = fd.get("milestoneId");
      if (milestoneId) {
        const ms = pendingMs.find((m) => m.id === milestoneId);
        if (ms) {
          await createInvoiceFromMilestone(state.selectedProjectId, ms);
          createForm.reset();
          createForm.billDate.value = new Date().toISOString().slice(0, 10);
          showToast("Bill created from milestone");
          opts.onRefresh?.();
          return;
        }
      }
      const { createClientInvoice } = await import("./svc_operations.js");
      const amount = Number(fd.get("amount"));
      if (!Number.isFinite(amount) || amount <= 0) {
        showToast("Enter a valid bill amount", "error");
        return;
      }
      await createClientInvoice({
        client: { id: project.clientId || "", name: project.clientName || "Client" },
        project: { id: project.id, name: project.name },
        billType: fd.get("billType") || "milestone",
        amount,
        paidAmount: 0,
        billDate: fd.get("billDate") || new Date().toISOString().slice(0, 10),
        description: fd.get("description") || "",
      });
      createForm.reset();
      createForm.billDate.value = new Date().toISOString().slice(0, 10);
      showToast("Draft bill created");
      opts.onRefresh?.();
    } catch (err) {
      showToast(err.message, "error");
    }
  };

  const tableHost = document.createElement("div");
  tableHost.className = "table-wrap private-billing-table";
  tableHost.innerHTML = `
    <h4 class="r3-subhead">Client bills for this project</h4>
    <table class="dash-table">
      <thead><tr>
        <th>Type</th><th class="text-right">Amount</th><th class="text-right">Paid</th>
        <th>Date</th><th>Description</th><th>Status</th><th>Actions</th>
      </tr></thead>
      <tbody>
        ${invoices.length ? invoices.map((row) => `
          <tr>
            <td>${escapeHtml(row.billType || "milestone")}</td>
            <td class="text-right">${formatBDT(row.amount)}</td>
            <td class="text-right">${formatBDT(row.paidAmount || 0)}</td>
            <td>${escapeHtml(row.billDate || "—")}</td>
            <td>${escapeHtml(row.description || "—")}</td>
            <td>${statusChip(row.status || "draft")}</td>
            <td class="proj-row-actions-cell">${billActions(row)}</td>
          </tr>
        `).join("") : '<tr class="empty-row"><td colspan="7">No bills for this project yet</td></tr>'}
      </tbody>
    </table>
  `;

  tableHost.querySelectorAll(".bill-act").forEach((btn) => {
    btn.onclick = async () => {
      const row = invoices.find((x) => x.id === btn.dataset.id);
      if (!row) return;
      try {
        if (btn.dataset.act === "record-payment") {
          guardAction("approve_billing");
          const amount = Number(row.amount || 0);
          await updateClientInvoiceStatus(row.id, "paid", { paidAmount: amount });
          const linkedMs = (state.paymentMilestones || []).find((m) => m.invoiceId === row.id);
          if (linkedMs) {
            await updatePath(`${PRIVATE_PATHS.paymentMilestones}/${state.selectedProjectId}/${linkedMs.id}`, {
              ...linkedMs,
              status: "paid",
              updatedAt: Date.now(),
            });
          }
          showToast("Payment recorded");
          opts.onRefresh?.();
          return;
        }
        if (btn.dataset.act === "submitted") {
          guardAction("submit_billing");
          await updateClientInvoiceStatus(row.id, "submitted");
          showToast("Bill submitted");
          opts.onRefresh?.();
          return;
        }
        if (btn.dataset.act === "approved") {
          guardAction("approve_billing");
          await updateClientInvoiceStatus(row.id, "approved");
          showToast("Bill approved");
          opts.onRefresh?.();
        }
      } catch (err) {
        showToast(err.message, "error");
      }
    };
  });

  body.innerHTML = "";
  body.append(createForm, tableHost);
  return card;
}
