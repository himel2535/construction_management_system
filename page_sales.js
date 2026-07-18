import { listenList } from "./svc_data.js";
import { createClientInvoice, updateClientInvoiceStatus } from "./svc_operations.js";
import { formatBDT } from "./util_format.js";
import { showToast } from "./cmp_toast.js";
import { setActiveNav } from "./cmp_layout.js";
import { setPageChrome } from "./cmp_header.js";
import { statusChip } from "./cmp_ui.js";
import { guardAction, canPerformAction } from "./svc_governance.js";

const BILL_TYPES = [
  { value: "milestone", label: "Milestone bill" },
  { value: "progress", label: "Progress / RA bill" },
  { value: "final", label: "Final bill" },
];

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
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
      parts.push(`<button type="button" class="btn btn-ghost btn-sm bill-act" data-id="${row.id}" data-act="record-payment">Record full payment</button>`);
    }
  }
  return parts.join(" ") || "—";
}

export function mountBilling(container) {
  setActiveNav();
  setPageChrome({
    title: "Billing & Invoicing",
    subtitle: "Private billing: draft → submitted → approved → paid.",
    showDateRange: false,
    quickActionLabel: null,
    onQuickAction: null,
  });

  const root = document.createElement("div");
  root.className = "page-content";

  const form = document.createElement("form");
  form.className = "card card-pad form-grid";
  form.innerHTML = `
    <select name="clientId" required aria-label="Client">
      <option value="">Client / owner</option>
    </select>
    <select name="projectId" required aria-label="Project">
      <option value="">Project</option>
    </select>
    <select name="billType" aria-label="Bill type">
      ${BILL_TYPES.map((t) => `<option value="${t.value}">${t.label}</option>`).join("")}
    </select>
    <input name="amount" type="number" placeholder="Bill amount *" required />
    <input name="paidAmount" type="number" placeholder="Payment received" />
    <input name="billDate" type="date" />
    <input name="description" placeholder="Description / bill ref" />
    <button type="submit" class="btn btn-primary">Create bill (draft)</button>
  `;
  form.billDate.value = new Date().toISOString().slice(0, 10);

  const tableHost = document.createElement("div");
  tableHost.className = "card card-pad";
  tableHost.style.marginTop = "1rem";
  root.append(form, tableHost);
  container.appendChild(root);

  let clients = [];
  let projects = [];
  let invoices = [];

  const clientSel = form.clientId;
  const projectSel = form.projectId;

  function renderInvoices() {
    const sorted = [...invoices].sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    tableHost.innerHTML = `
      <h3 class="section-title">Client bills</h3>
      <div class="table-wrap">
        <table class="dash-table">
          <thead><tr>
            <th>Client</th><th>Project</th><th>Type</th>
            <th class="text-right">Amount</th><th class="text-right">Paid</th>
            <th>Date</th><th>Status</th><th>Actions</th>
          </tr></thead>
          <tbody>
            ${sorted.length ? sorted.map((row) => `
              <tr>
                <td>${escapeHtml(row.clientName || "—")}</td>
                <td>${escapeHtml(row.projectName || "—")}</td>
                <td>${escapeHtml(row.billType || "milestone")}</td>
                <td class="text-right">${formatBDT(row.amount)}</td>
                <td class="text-right">${formatBDT(row.paidAmount || 0)}</td>
                <td>${escapeHtml(row.billDate || "—")}</td>
                <td>${statusChip(row.status || "draft")}</td>
                <td class="proj-row-actions-cell">${billActions(row)}</td>
              </tr>
            `).join("") : '<tr class="empty-row"><td colspan="8">No bills yet</td></tr>'}
          </tbody>
        </table>
      </div>
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
            showToast("Payment recorded — bill paid");
            return;
          }
          if (btn.dataset.act === "submitted") {
            guardAction("submit_billing");
            await updateClientInvoiceStatus(row.id, "submitted");
            showToast("Bill submitted for approval");
            return;
          }
          if (btn.dataset.act === "approved") {
            guardAction("approve_billing");
            await updateClientInvoiceStatus(row.id, "approved");
            showToast("Bill approved");
          }
        } catch (err) {
          showToast(err.message, "error");
        }
      };
    });
  }

  const unsubClients = listenList("clients", (list) => {
    clients = list.filter((c) => (c.status || "active") === "active");
    clientSel.innerHTML = '<option value="">Client / owner</option>';
    clients.forEach((c) => {
      const o = document.createElement("option");
      o.value = c.id;
      o.textContent = `${c.name} · ${c.phone || ""}`.trim();
      clientSel.appendChild(o);
    });
  });

  const unsubProjects = listenList("projects", (list) => {
    projects = list;
    projectSel.innerHTML = '<option value="">Project</option>';
    list.forEach((p) => {
      const o = document.createElement("option");
      o.value = p.id;
      o.textContent = p.name;
      projectSel.appendChild(o);
    });
  });

  const unsubInvoices = listenList("clientInvoices", (list) => {
    invoices = list;
    renderInvoices();
  });

  form.onsubmit = async (e) => {
    e.preventDefault();
    const client = clients.find((c) => c.id === clientSel.value);
    const project = projects.find((p) => p.id === projectSel.value);
    if (!client || !project) {
      showToast("Select a valid client and project", "error");
      return;
    }
    const amount = Number(form.amount.value);
    if (!Number.isFinite(amount) || amount <= 0) {
      showToast("Enter a valid bill amount", "error");
      return;
    }
    try {
      await createClientInvoice({
        client,
        project,
        billType: form.billType.value,
        amount,
        paidAmount: Number(form.paidAmount.value) || 0,
        billDate: form.billDate.value,
        description: form.description.value.trim(),
      });
      form.amount.value = "";
      form.paidAmount.value = "";
      form.description.value = "";
      showToast("Bill created as draft");
    } catch (err) {
      showToast(err.message, "error");
    }
  };

  return {
    unmount: () => {
      unsubInvoices();
      unsubClients();
      unsubProjects();
    },
  };
}

export function mountSales(container) {
  return mountBilling(container);
}
