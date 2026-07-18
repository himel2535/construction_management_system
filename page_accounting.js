import { renderTable } from "./cmp_table.js";
import { listenList, listenProjectSub } from "./svc_data.js";
import { formatBDT, todayISO } from "./util_format.js";
import { showToast } from "./cmp_toast.js";
import { setActiveNav } from "./cmp_layout.js";
import { setPageChrome } from "./cmp_header.js";
import { postManualVoucherClient } from "./svc_firebaseOps.js";
import { statusChip } from "./cmp_ui.js";
import { canPerformAction } from "./svc_governance.js";
import { EXPENSE_CATEGORIES } from "./util_projectExpense.js";
import {
  createProjectExpense,
  submitProjectExpense,
  advanceExpenseApproval,
  rejectProjectExpense,
  reopenProjectExpense,
  expenseActionButtons,
} from "./svc_projectExpense.js";

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function mountAccounting(container) {
  setActiveNav("#/accounting");
  setPageChrome({
    title: "Accounting",
    subtitle: "Chart of accounts, vouchers, and project expense approval (§2.7).",
  });

  const root = document.createElement("div");
  root.className = "page-content accounting-page";

  const expenseCard = document.createElement("div");
  expenseCard.className = "card card-pad expense-section";
  expenseCard.innerHTML = `
    <h3 class="section-title">Project expenses</h3>
    <p class="text-muted expense-section-desc">Create expenses per project — private: single approval; government: PM → Accountant → Owner.</p>
    <div class="expense-kpi" id="expense-kpi"></div>
    <form class="form-grid expense-form" id="expense-form">
      <select name="projectId" required aria-label="Project"><option value="">Project *</option></select>
      <select name="category" required aria-label="Category">
        ${EXPENSE_CATEGORIES.map((c) => `<option value="${c}">${c}</option>`).join("")}
      </select>
      <input name="amount" type="number" step="0.01" min="0" placeholder="Amount (BDT) *" required />
      <input name="expenseDate" type="date" required />
      <select name="phaseId" aria-label="Phase"><option value="">Phase (optional)</option></select>
      <input name="description" placeholder="Description / narration" />
      <button type="submit" class="btn btn-primary btn-sm">Add expense (draft)</button>
    </form>
    <div class="table-wrap expense-table-wrap" id="expense-table"></div>
  `;

  const grid = document.createElement("div");
  grid.className = "grid-2";
  grid.style.marginTop = "1rem";
  const accHost = document.createElement("div");
  accHost.id = "accounts-table";
  const vchForm = document.createElement("form");
  vchForm.className = "card card-pad";
  vchForm.innerHTML = `
    <h3 style="margin:0 0 0.75rem">Manual voucher</h3>
    <input name="date" type="date" />
    <select name="debit" required style="margin-top:0.5rem;width:100%"></select>
    <select name="credit" required style="margin-top:0.5rem;width:100%"></select>
    <input name="amount" type="number" placeholder="Amount" required style="margin-top:0.5rem;width:100%" />
    <input name="narration" placeholder="Description" style="margin-top:0.5rem;width:100%" />
    <button type="submit" class="btn btn-primary" style="margin-top:0.75rem;width:100%">Save voucher</button>
  `;
  vchForm.date.value = todayISO();
  grid.append(accHost, vchForm);
  const vchHost = document.createElement("div");
  vchHost.style.marginTop = "1rem";
  root.append(expenseCard, grid, vchHost);
  container.appendChild(root);

  const expenseForm = expenseCard.querySelector("#expense-form");
  expenseForm.expenseDate.value = todayISO();

  let accounts = [];
  let vouchers = [];
  let projects = [];
  let phases = [];
  let expenses = [];
  let selectedProjectId = "";
  let unsubPhases = () => {};

  const projSel = expenseForm.projectId;
  const phaseSel = expenseForm.phaseId;

  const renderExpenseKpi = () => {
    const host = expenseCard.querySelector("#expense-kpi");
    const monthPrefix = todayISO().slice(0, 7);
    const pending = expenses.filter((e) => e.status === "submitted").length;
    const approvedMonth = expenses
      .filter((e) => e.status === "approved" && (e.expenseDate || "").startsWith(monthPrefix))
      .reduce((a, e) => a + (Number(e.amount) || 0), 0);
    host.innerHTML = `
      <div class="expense-kpi-card"><span class="cust-detail-label">Pending approval</span><strong>${pending}</strong></div>
      <div class="expense-kpi-card"><span class="cust-detail-label">Approved this month</span><strong>${formatBDT(approvedMonth)}</strong></div>
    `;
  };

  const renderExpenses = () => {
    renderExpenseKpi();
    const host = expenseCard.querySelector("#expense-table");
    const sorted = [...expenses].sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    if (!sorted.length) {
      host.innerHTML = `<p class="proj-empty">No expenses for selected project</p>`;
      return;
    }
    const projName = projects.find((p) => p.id === selectedProjectId)?.name || selectedProjectId;
    host.innerHTML = `
      <h4 class="r3-subhead">${escapeHtml(projName)} — expense register</h4>
      <table class="dash-table">
        <thead><tr>
          <th>Date</th><th>Category</th><th class="text-right">Amount</th>
          <th>Description</th><th>Status</th><th>Stage</th><th>Actions</th>
        </tr></thead>
        <tbody>
          ${sorted.map((e) => `
            <tr>
              <td>${escapeHtml(e.expenseDate || "—")}</td>
              <td>${escapeHtml(e.category || "—")}</td>
              <td class="text-right">${formatBDT(e.amount)}</td>
              <td>${escapeHtml(e.description || "—")}</td>
              <td>${statusChip(e.status || "draft")}</td>
              <td>${escapeHtml(e.approvalStage || "—")}</td>
              <td class="proj-row-actions-cell">${expenseActionButtons(e, selectedProjectId)}</td>
            </tr>`).join("")}
        </tbody>
      </table>
    `;
    wireExpenseActions(host);
  };

  function wireExpenseActions(host) {
    host.querySelectorAll(".exp-submit").forEach((btn) => {
      btn.onclick = async () => {
        try {
          await submitProjectExpense(btn.dataset.pid, btn.dataset.id);
          showToast("Expense submitted for approval");
        } catch (err) {
          showToast(err.message, "error");
        }
      };
    });
    host.querySelectorAll(".exp-approve").forEach((btn) => {
      btn.onclick = async () => {
        try {
          await advanceExpenseApproval(btn.dataset.pid, btn.dataset.id);
          showToast("Expense approved");
        } catch (err) {
          showToast(err.message, "error");
        }
      };
    });
    host.querySelectorAll(".exp-reject").forEach((btn) => {
      btn.onclick = async () => {
        try {
          await rejectProjectExpense(btn.dataset.pid, btn.dataset.id);
          showToast("Expense rejected");
        } catch (err) {
          showToast(err.message, "error");
        }
      };
    });
    host.querySelectorAll(".exp-reopen").forEach((btn) => {
      btn.onclick = async () => {
        try {
          await reopenProjectExpense(btn.dataset.pid, btn.dataset.id);
          showToast("Expense reopened as draft");
        } catch (err) {
          showToast(err.message, "error");
        }
      };
    });
  }

  const bindProjectExpenses = (projectId) => {
    selectedProjectId = projectId;
    unsubPhases();
    unsubPhases = () => {};
    expenses = [];
    if (!projectId) {
      renderExpenses();
      return () => {};
    }
    unsubPhases = listenProjectSub(projectId, "projectPhases", (list) => {
      phases = list;
      phaseSel.innerHTML =
        '<option value="">Phase (optional)</option>' +
        list.map((ph) => `<option value="${ph.id}">${escapeHtml(ph.name)}</option>`).join("");
    });
    return listenProjectSub(projectId, "projectExpenses", (list) => {
      expenses = list;
      renderExpenses();
    });
  };

  let unsubExpense = () => {};

  const renderProjectOptions = () => {
    projSel.innerHTML =
      '<option value="">Project *</option>' +
      projects.map((p) => `<option value="${p.id}">${escapeHtml(p.name)}</option>`).join("");
  };

  projSel.onchange = () => {
    unsubExpense();
    unsubExpense = bindProjectExpenses(projSel.value);
  };

  expenseForm.onsubmit = async (e) => {
    e.preventDefault();
    if (!canPerformAction("submit_expense") && !canPerformAction("post_expense")) {
      showToast("You cannot create expenses", "error");
      return;
    }
    const fd = new FormData(expenseForm);
    try {
      await createProjectExpense({
        projectId: fd.get("projectId"),
        category: fd.get("category"),
        amount: fd.get("amount"),
        phaseId: fd.get("phaseId"),
        description: fd.get("description"),
        expenseDate: fd.get("expenseDate"),
      });
      expenseForm.amount.value = "";
      expenseForm.description.value = "";
      showToast("Expense saved as draft");
    } catch (err) {
      showToast(err.message, "error");
    }
  };

  const renderAccounts = () => {
    accHost.innerHTML = "";
    accHost.appendChild(
      renderTable(
        "acc",
        [
          { key: "code", label: "Code" },
          { key: "name", label: "Name" },
          { key: "balance", label: "Balance", align: "right" },
        ],
        accounts,
        (a) => ({ code: a.code, name: a.name, balance: formatBDT(a.balance ?? 0) })
      )
    );
    const debitSel = vchForm.debit;
    const creditSel = vchForm.credit;
    debitSel.innerHTML = creditSel.innerHTML = '<option value="">Account</option>';
    accounts.forEach((a) => {
      for (const sel of [debitSel, creditSel]) {
        const o = document.createElement("option");
        o.value = a.id;
        o.textContent = `${a.code} — ${a.name}`;
        sel.appendChild(o);
      }
    });
  };

  const u1 = listenList("accounts", (list) => {
    accounts = list;
    renderAccounts();
  });
  const u2 = listenList("vouchers", (list) => {
    vouchers = list;
    vchHost.innerHTML = "";
    vchHost.appendChild(
      renderTable(
        "vch",
        [
          { key: "voucherNo", label: "Voucher" },
          { key: "date", label: "Date" },
          { key: "narration", label: "Description" },
          { key: "type", label: "Type" },
        ],
        [...list].reverse().slice(0, 30),
        (v) => ({
          voucherNo: v.voucherNo,
          date: v.date,
          narration: v.narration,
          type: v.type,
        })
      )
    );
  });
  const u3 = listenList("projects", (list) => {
    projects = list;
    renderProjectOptions();
  });

  vchForm.onsubmit = async (e) => {
    e.preventDefault();
    const amount = Number(vchForm.amount.value);
    if (amount <= 0) return;
    try {
      await postManualVoucherClient({
        amount,
        debit: vchForm.debit.value,
        credit: vchForm.credit.value,
        date: vchForm.date.value,
        narration: vchForm.narration.value,
      });
      vchForm.amount.value = "";
      vchForm.narration.value = "";
      showToast("Voucher saved");
    } catch (err) {
      showToast(err.message, "error");
    }
  };

  renderExpenses();

  return {
    unmount: () => {
      u1();
      u2();
      u3();
      unsubExpense();
      unsubPhases();
    },
  };
}
