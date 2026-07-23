/**
 * Private / local project — Client Contract, Billing tabs (§2.3)
 */
import { create, updatePath, removePath } from "./svc_data.js";
import { getCurrentUserId } from "./svc_auth.js";
import { guardAction, canPerformAction } from "./svc_governance.js";
import { updateClientInvoiceStatus } from "./svc_operations.js";
import { formatBDT } from "./util_format.js";
import { showToast } from "./cmp_toast.js";
import { statusChip } from "./cmp_ui.js";
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
import { auditProject, openCustFormDialog } from "./cmp_projectTab.js";
import { renderBoqStatGrid } from "./page_projects_r2.js";

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

function openAddPaymentMilestoneDialog(state, opts = {}) {
  if (!state.selectedProjectId) {
    showToast("Select a project first", "error");
    return;
  }
  const project = state.projects.find((p) => p.id === state.selectedProjectId);
  const changeOrders = state.changeOrders || [];
  const { revised } = computeRevisedContractValue(project, changeOrders);

  openCustFormDialog({
    title: "Add payment milestone",
    subtitle: "Schedule a billable milestone as a percent of the revised contract value.",
    submitLabel: "Add payment milestone",
    modalClass: "proj-pay-ms-modal",
    values: {
      description: "",
      percent: "",
      dueDate: "",
    },
    sections: [
      {
        title: "Milestone",
        fields: [
          { name: "description", label: "Description *", type: "text", required: true },
          {
            name: "percent",
            label: "Percent of contract *",
            type: "number",
            step: "0.01",
            required: true,
          },
          { name: "dueDate", label: "Due date", type: "date" },
        ],
      },
    ],
    onSave: async (data) => {
      try {
        guardAction("create_change_order");
        const percent = Number(data.percent) || 0;
        const amount = computeMilestoneAmount(revised, percent);
        const id = await create(`${PRIVATE_PATHS.paymentMilestones}/${state.selectedProjectId}`, {
          ...privateBase(),
          description: data.description,
          percent,
          dueDate: data.dueDate || "",
          amount,
        });
        await auditProject(state, {
          entityType: "paymentMilestone",
          entityId: id,
          action: "create",
          diffSummary: `Payment milestone: ${data.description}`,
        });
        showToast("Payment milestone added");
        opts.onRefresh?.();
      } catch (err) {
        showToast(err.message, "error");
        throw err;
      }
    },
  });
}

export function buildPrivateContractTab(state, opts = {}) {
  const root = document.createElement("div");
  root.className = "proj-contract-tab";
  const project = state.projects.find((p) => p.id === state.selectedProjectId);
  if (!project || !state.selectedProjectId) {
    root.innerHTML = `<p class="proj-empty">Select a project first</p>`;
    return root;
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

  const metricsSection = document.createElement("section");
  metricsSection.className = "proj-boq-metrics proj-boq-metrics--planning proj-contract-metrics";
  metricsSection.innerHTML = `<h4 class="proj-boq-section-title">Commercial overview</h4>`;
  metricsSection.appendChild(
    renderBoqStatGrid([
      { label: "Original contract", value: formatBDT(base) },
      { label: "Approved variations", value: formatBDT(variations) },
      { label: "Revised contract", value: formatBDT(revised) },
      { label: "Billed", value: formatBDT(kpis.billed) },
      { label: "Collected", value: formatBDT(kpis.collected) },
      {
        label: "Outstanding",
        value: formatBDT(kpis.outstanding),
        attention: kpis.outstanding > 0,
      },
    ])
  );
  const statGrid = metricsSection.querySelector(".proj-boq-stat-grid");
  if (statGrid) statGrid.classList.add("proj-contract-stat-grid");

  const clientBanner = document.createElement("p");
  clientBanner.className = "proj-contract-client-banner text-muted";
  clientBanner.textContent = `Client: ${project.clientName || "—"}`;

  const countLabel =
    milestones.length === 1
      ? "Showing 1 of 1 milestone"
      : `Showing ${milestones.length} of ${milestones.length} milestones`;

  const msTableWrap = document.createElement("div");
  msTableWrap.className = "reports-table-wrap proj-contract-table proj-contract-ms-shell";
  msTableWrap.innerHTML = `
    <div class="proj-contract-table-head-row">
      <h4 class="proj-boq-section-title proj-contract-table-head">Payment milestones</h4>
      <button type="button" class="btn btn-primary btn-sm proj-pay-ms-add-btn">Add payment milestone</button>
    </div>
    <table class="dash-table projects-table">
      <colgroup>
        <col class="proj-contract-ms-col-desc" />
        <col class="proj-contract-ms-col-num" />
        <col class="proj-contract-ms-col-num" />
        <col class="proj-contract-ms-col-equal" />
        <col class="proj-contract-ms-col-equal" />
        <col class="proj-contract-ms-col-actions" />
      </colgroup>
      <thead>
        <tr>
          <th>Description</th>
          <th class="text-right">%</th>
          <th class="text-right">Amount</th>
          <th>Due</th>
          <th>Status</th>
          <th class="rep-col-actions">Actions</th>
        </tr>
      </thead>
      <tbody>
        ${
          milestones.length
            ? milestones
                .map(
                  (m) => `
          <tr data-ms-id="${escapeHtml(m.id)}">
            <td><strong class="proj-contract-ms-desc">${escapeHtml(m.description || "—")}</strong></td>
            <td class="text-right">${Number(m.percent || 0)}%</td>
            <td class="text-right">${formatBDT(m.amount || 0)}</td>
            <td>${escapeHtml(m.dueDate || "—")}</td>
            <td>${milestoneStatusChip(m.status)}</td>
            <td class="rep-col-actions proj-row-actions-cell">
              ${
                m.status === "pending"
                  ? `<button type="button" class="btn btn-ghost btn-sm ms-bill-btn" data-id="${escapeHtml(m.id)}">Create bill</button>
              <button type="button" class="btn btn-ghost btn-sm ms-del-btn" data-id="${escapeHtml(m.id)}">Remove</button>`
                  : "—"
              }
            </td>
          </tr>`
                )
                .join("")
            : '<tr class="empty-row"><td colspan="6">No payment milestones — click Add payment milestone</td></tr>'
        }
      </tbody>
    </table>
    <div class="reports-widget-foot proj-contract-ms-foot">
      <span class="reports-widget-foot-meta">${escapeHtml(countLabel)}</span>
      <div class="proj-contract-ms-foot-actions">
        <button type="button" class="btn btn-ghost btn-sm proj-contract-sync-btn">Recalculate amounts</button>
        <button type="button" class="btn btn-ghost btn-sm proj-contract-billing-link">Open Billing tab →</button>
      </div>
    </div>
  `;

  root.append(metricsSection, clientBanner, msTableWrap);

  msTableWrap.querySelector(".proj-pay-ms-add-btn")?.addEventListener("click", () =>
    openAddPaymentMilestoneDialog(state, opts)
  );

  msTableWrap.querySelectorAll(".ms-bill-btn").forEach((btn) => {
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

  msTableWrap.querySelectorAll(".ms-del-btn").forEach((btn) => {
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

  msTableWrap.querySelector(".proj-contract-sync-btn")?.addEventListener("click", async () => {
    try {
      await syncMilestoneAmounts(state.selectedProjectId);
      showToast("Milestone amounts updated");
      opts.onRefresh?.();
    } catch (err) {
      showToast(err.message, "error");
    }
  });

  msTableWrap.querySelector(".proj-contract-billing-link")?.addEventListener("click", () => {
    opts.onNavigateTab?.("billing");
  });

  return root;
}

const BILL_TYPE_OPTIONS = [
  { value: "milestone", label: "Milestone bill" },
  { value: "progress", label: "Progress / RA bill" },
  { value: "final", label: "Final bill" },
];

function milestoneBillOptions(state) {
  const pendingMs = (state.paymentMilestones || []).filter((m) => m.status === "pending");
  return [
    { value: "", label: "Create bill from milestone (optional)" },
    ...pendingMs.map((m) => ({
      value: m.id,
      label: `${m.description} — ${formatBDT(m.amount || 0)}`,
    })),
  ];
}

function openCreateBillDialog(state, opts = {}) {
  if (!state.selectedProjectId) {
    showToast("Select a project first", "error");
    return;
  }
  const project = state.projects.find((p) => p.id === state.selectedProjectId);
  if (!project) return;
  const pendingMs = (state.paymentMilestones || []).filter((m) => m.status === "pending");
  const today = new Date().toISOString().slice(0, 10);

  openCustFormDialog({
    title: "Create draft bill",
    subtitle: "Create from a pending milestone or enter a manual client bill.",
    submitLabel: "Create draft bill",
    modalClass: "proj-billing-modal",
    values: {
      milestoneId: "",
      billType: "milestone",
      amount: "",
      billDate: today,
      description: "",
    },
    sections: [
      {
        title: "Bill source",
        fields: [
          {
            name: "milestoneId",
            label: "From milestone",
            type: "select",
            options: milestoneBillOptions(state),
          },
          { name: "billType", label: "Bill type", type: "select", options: BILL_TYPE_OPTIONS },
        ],
      },
      {
        title: "Bill details",
        fields: [
          { name: "amount", label: "Bill amount (BDT) *", type: "number", step: "0.01" },
          { name: "billDate", label: "Bill date", type: "date" },
          { name: "description", label: "Description / bill ref", type: "text", fullWidth: true },
        ],
      },
    ],
    onSave: async (data) => {
      try {
        guardAction("submit_billing");
        const milestoneId = data.milestoneId || "";
        if (milestoneId) {
          const ms = pendingMs.find((m) => m.id === milestoneId);
          if (ms) {
            await createInvoiceFromMilestone(state.selectedProjectId, ms);
            showToast("Bill created from milestone");
            opts.onRefresh?.();
            return;
          }
        }
        const { createClientInvoice } = await import("./svc_operations.js");
        const amount = Number(data.amount);
        if (!Number.isFinite(amount) || amount <= 0) {
          showToast("Enter a valid bill amount", "error");
          throw new Error("validation");
        }
        await createClientInvoice({
          client: { id: project.clientId || "", name: project.clientName || "Client" },
          project: { id: project.id, name: project.name },
          billType: data.billType || "milestone",
          amount,
          paidAmount: 0,
          billDate: data.billDate || today,
          description: data.description || "",
        });
        showToast("Draft bill created");
        opts.onRefresh?.();
      } catch (err) {
        if (err?.message !== "validation") showToast(err.message, "error");
        throw err;
      }
    },
  });
}

export function buildPrivateBillingTab(state, opts = {}) {
  const root = document.createElement("div");
  root.className = "proj-billing-tab";
  const project = state.projects.find((p) => p.id === state.selectedProjectId);
  if (!project || !state.selectedProjectId) {
    root.innerHTML = `<p class="proj-empty">Select a project first</p>`;
    return root;
  }

  const invoices = [...(state.clientInvoices || [])].sort(
    (a, b) => (b.createdAt || 0) - (a.createdAt || 0)
  );
  const kpis = computePrivateKpis(project, {
    paymentMilestones: state.paymentMilestones,
    clientInvoices: state.clientInvoices,
    changeOrders: state.changeOrders || [],
  });

  const metricsSection = document.createElement("section");
  metricsSection.className = "proj-boq-metrics proj-boq-metrics--planning proj-billing-metrics";
  metricsSection.innerHTML = `<h4 class="proj-boq-section-title">Billing overview</h4>`;
  metricsSection.appendChild(
    renderBoqStatGrid([
      { label: "Billed", value: formatBDT(kpis.billed) },
      { label: "Collected", value: formatBDT(kpis.collected) },
      {
        label: "Outstanding",
        value: formatBDT(kpis.outstanding),
        attention: kpis.outstanding > 0,
      },
      {
        label: "Uninvoiced milestones",
        value: kpis.uninvoicedMilestones,
        attention: kpis.overdueMilestoneCount > 0,
      },
    ])
  );
  const statGrid = metricsSection.querySelector(".proj-boq-stat-grid");
  if (statGrid) statGrid.classList.add("proj-billing-stat-grid");

  const countLabel =
    invoices.length === 1
      ? "Showing 1 of 1 bill"
      : `Showing ${invoices.length} of ${invoices.length} bills`;

  const tableWrap = document.createElement("div");
  tableWrap.className = "reports-table-wrap proj-billing-table proj-billing-invoices-shell";
  tableWrap.innerHTML = `
    <div class="proj-billing-table-head-row">
      <h4 class="proj-boq-section-title proj-billing-table-head">Client bills</h4>
      <button type="button" class="btn btn-primary btn-sm proj-billing-create-btn">Create draft bill</button>
    </div>
    <table class="dash-table projects-table">
      <colgroup>
        <col class="proj-billing-col-type" />
        <col class="proj-billing-col-amount" />
        <col class="proj-billing-col-amount" />
        <col class="proj-billing-col-date" />
        <col class="proj-billing-col-desc" />
        <col class="proj-billing-col-status" />
        <col class="proj-billing-col-actions" />
      </colgroup>
      <thead>
        <tr>
          <th>Type</th>
          <th class="proj-billing-col-amount-h">Amount</th>
          <th class="proj-billing-col-amount-h">Paid</th>
          <th>Date</th>
          <th>Description</th>
          <th class="rep-col-status">Status</th>
          <th class="rep-col-actions">Actions</th>
        </tr>
      </thead>
      <tbody>
        ${
          invoices.length
            ? invoices
                .map(
                  (row) => `
          <tr data-bill-id="${escapeHtml(row.id)}">
            <td>${escapeHtml(row.billType || "milestone")}</td>
            <td class="proj-billing-col-amount-cell">${formatBDT(row.amount)}</td>
            <td class="proj-billing-col-amount-cell">${formatBDT(row.paidAmount || 0)}</td>
            <td>${escapeHtml(row.billDate || "—")}</td>
            <td><span class="proj-billing-desc">${escapeHtml(row.description || "—")}</span></td>
            <td class="rep-col-status">${statusChip(row.status || "draft")}</td>
            <td class="rep-col-actions proj-row-actions-cell"><span class="proj-billing-actions">${billActions(row)}</span></td>
          </tr>`
                )
                .join("")
            : '<tr class="empty-row"><td colspan="7">No bills for this project — click Create draft bill</td></tr>'
        }
      </tbody>
    </table>
    <div class="reports-widget-foot">
      <span class="reports-widget-foot-meta">${escapeHtml(countLabel)}</span>
    </div>
  `;

  root.append(metricsSection, tableWrap);

  tableWrap.querySelector(".proj-billing-create-btn")?.addEventListener("click", () =>
    openCreateBillDialog(state, opts)
  );

  tableWrap.querySelectorAll(".bill-act").forEach((btn) => {
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

  return root;
}
