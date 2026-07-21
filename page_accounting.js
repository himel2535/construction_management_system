import { renderTable } from "./cmp_table.js";
import { listenList, listenProjectSub } from "./svc_data.js";
import { resolveRead } from "./svc_tenant.js";
import { formatBDT, todayISO } from "./util_format.js";
import { showToast } from "./cmp_toast.js";
import { setActiveNav } from "./cmp_layout.js";
import { setPageChrome } from "./cmp_header.js";
import { postManualVoucherClient } from "./svc_firebaseOps.js";
import { statusChip } from "./cmp_ui.js";
import { icon } from "./cmp_icons.js";
import { kpiIcon } from "./cmp_dashboardIcons.js";
import { formatCompactBDT } from "./util_dashboard.js";
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

function financeSparklineSvg(values = [], tone = "green") {
  const pts = values.length ? values : [3, 4, 4, 5, 5, 6, 6];
  const max = Math.max(...pts, 1);
  const w = 56;
  const h = 22;
  const coords = pts
    .map((v, i) => {
      const x = (i / (pts.length - 1 || 1)) * w;
      const y = h - (v / max) * (h - 4) - 2;
      return `${x},${y}`;
    })
    .join(" ");
  const strokes = {
    blue: "#2563eb",
    green: "#047857",
    orange: "#d97706",
    teal: "#0d9488",
    red: "#B91C1C",
    yellow: "#CA8A04",
  };
  const stroke = strokes[tone] || strokes.green;
  return `<svg class="dash-sparkline dash-sparkline--${tone}" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none"><polyline points="${coords}" fill="none" stroke="${stroke}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
}

function flattenProjectExpenses(root) {
  if (!root || typeof root !== "object") return [];
  const out = [];
  for (const [pid, bucket] of Object.entries(root)) {
    if (!bucket || typeof bucket !== "object") continue;
    const looksLikeExpense =
      "status" in bucket || "amount" in bucket || "expenseDate" in bucket || "category" in bucket;
    if (looksLikeExpense && !Object.values(bucket).some((v) => v && typeof v === "object" && "amount" in v)) {
      out.push({ id: pid, projectId: bucket.projectId || pid, ...bucket });
      continue;
    }
    for (const [id, row] of Object.entries(bucket)) {
      if (row && typeof row === "object" && !Array.isArray(row)) {
        out.push({ id, projectId: row.projectId || pid, ...row });
      }
    }
  }
  return out;
}

function exportExpensesCsv(items, projectNameFn) {
  const headers = ["Date", "Project", "Category", "Amount", "Description", "Status", "Stage"];
  const rows = items.map((e) => [
    e.expenseDate || "",
    projectNameFn(e.projectId) || e.projectId || "",
    e.category || "",
    e.amount ?? "",
    e.description || "",
    e.status || "",
    e.approvalStage || "",
  ]);
  const escape = (v) => `"${String(v).replace(/"/g, '""')}"`;
  const csv = [headers, ...rows].map((r) => r.map(escape).join(",")).join("\r\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `project-expenses-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export function mountAccounting(container) {
  setActiveNav();
  setPageChrome({
    title: "Finance",
    subtitle: "Chart of accounts, vouchers, and project expense approval.",
    showDateRange: false,
  });

  const root = document.createElement("div");
  root.className = "accounting-page dashboard-page dashboard-mockup";
  container.appendChild(root);

  let metricsRow = null;
  let expenseCountEl = null;
  let expenseTbody = null;
  let expenseForm = null;
  let expenseModalOverlay = null;
  let expenseModalWired = false;
  let accHost = null;
  let vchFormHost = null;
  let vchListHost = null;
  let toolbarWired = false;

  let accounts = [];
  let vouchers = [];
  let projects = [];
  let phases = [];
  let allExpenses = [];
  let scopedExpenses = null;
  let unsubPhases = () => {};
  let unsubScopedExpenses = () => {};

  const filters = { projectId: "", status: "all", query: "" };

  function projectName(projectId) {
    return projects.find((p) => p.id === projectId)?.name || projectId || "—";
  }

  function ensureLayout() {
    if (root.querySelector("#finance-expense-tbody")) {
      metricsRow = root.querySelector("#finance-metrics");
      expenseCountEl = root.querySelector("#finance-expense-count");
      expenseTbody = root.querySelector("#finance-expense-tbody");
      accHost = root.querySelector("#finance-accounts-host");
      vchFormHost = root.querySelector("#finance-voucher-form-host");
      vchListHost = root.querySelector("#finance-vouchers-host");
      return;
    }

    root.innerHTML = `
      <div id="finance-metrics"></div>
      <section class="dash-widget dash-widget--projects card" id="finance-expense-widget">
        <div class="dash-widget-head dash-widget-head--split">
          <div>
            <h3 class="dash-widget-title">Project expenses</h3>
            <p class="dash-widget-sub">Create, approve, and track costs by project</p>
          </div>
          <span class="cust-toolbar-count" id="finance-expense-count">Showing 0 expenses</span>
        </div>
        <div class="dash-widget-body">
          <div class="toolbar-row projects-toolbar finance-toolbar" id="finance-expense-toolbar">
            <div class="toolbar-filters">
              <select class="toolbar-select" id="fin-filter-project" aria-label="Project filter">
                <option value="">All projects</option>
              </select>
              <select class="toolbar-select" id="fin-filter-status" aria-label="Status filter">
                <option value="all">All statuses</option>
                <option value="draft">Draft</option>
                <option value="submitted">Submitted</option>
                <option value="approved">Approved</option>
                <option value="rejected">Rejected</option>
              </select>
            </div>
            <div class="toolbar-actions">
              <div class="cust-toolbar-search toolbar-search">
                <span class="search-icon" aria-hidden="true">${icon("search", { size: 18 })}</span>
                <input type="search" class="cust-toolbar-search-input" id="fin-search" placeholder="Search category, description, amount…" autocomplete="off" />
              </div>
              <div class="cust-toolbar-btn-group">
                <button type="button" class="btn btn-ghost btn-sm cust-toolbar-btn cust-toolbar-btn--clear" id="fin-clear-filters" title="Clear filters">${icon("rotateCcw", { size: 16 })} Clear</button>
                <button type="button" class="btn btn-ghost btn-sm cust-toolbar-btn cust-toolbar-btn--export" id="fin-export">${icon("download", { size: 16 })} Export</button>
                <button type="button" class="btn btn-primary btn-sm" id="fin-add-expense">+ Add expense</button>
              </div>
            </div>
          </div>
          <div class="table-wrap projects-table-wrap finance-expense-table-wrap">
            <table class="dash-table projects-table finance-expense-table" id="finance-expense-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Project</th>
                  <th>Category</th>
                  <th class="text-right">Amount</th>
                  <th>Description</th>
                  <th class="cust-col-center">Status</th>
                  <th class="cust-col-center">Stage</th>
                  <th class="cust-col-center">Actions</th>
                </tr>
              </thead>
              <tbody id="finance-expense-tbody"></tbody>
            </table>
          </div>
        </div>
      </section>
      <div class="finance-mid-row">
        <section class="dash-widget dash-widget--projects card">
          <div class="dash-widget-head">
            <h3 class="dash-widget-title">Chart of accounts</h3>
            <p class="dash-widget-sub">Ledger accounts and balances</p>
          </div>
          <div class="dash-widget-body" id="finance-accounts-host"></div>
        </section>
        <section class="dash-widget dash-widget--projects card">
          <div class="dash-widget-head">
            <h3 class="dash-widget-title">Manual voucher</h3>
            <p class="dash-widget-sub">Post a debit / credit entry</p>
          </div>
          <div class="dash-widget-body" id="finance-voucher-form-host"></div>
        </section>
      </div>
      <section class="dash-widget dash-widget--projects card">
        <div class="dash-widget-head">
          <h3 class="dash-widget-title">Recent vouchers</h3>
          <p class="dash-widget-sub">Latest manual and system vouchers</p>
        </div>
        <div class="dash-widget-body" id="finance-vouchers-host"></div>
      </section>
    `;

    metricsRow = root.querySelector("#finance-metrics");
    expenseCountEl = root.querySelector("#finance-expense-count");
    expenseTbody = root.querySelector("#finance-expense-tbody");
    accHost = root.querySelector("#finance-accounts-host");
    vchFormHost = root.querySelector("#finance-voucher-form-host");
    vchListHost = root.querySelector("#finance-vouchers-host");

    vchFormHost.innerHTML = `
      <form class="finance-voucher-form" id="voucher-form">
        <input name="date" type="date" />
        <select name="debit" required></select>
        <select name="credit" required></select>
        <input name="amount" type="number" placeholder="Amount" required />
        <input name="narration" placeholder="Description" />
        <button type="submit" class="btn btn-primary btn-sm">Save voucher</button>
      </form>
    `;
    const vchForm = vchFormHost.querySelector("#voucher-form");
    vchForm.date.value = todayISO();

    wireExpenseToolbar();
    wireVoucherForm(vchForm);
    syncAddExpenseButton();
  }

  function syncAddExpenseButton() {
    const btn = root.querySelector("#fin-add-expense");
    if (!btn) return;
    const can = canPerformAction("submit_expense") || canPerformAction("post_expense");
    btn.hidden = !can;
  }

  function onExpenseModalEscapeKey(e) {
    if (e.key === "Escape") closeExpenseModal();
  }

  function closeExpenseModal() {
    document.removeEventListener("keydown", onExpenseModalEscapeKey);
    document.body.classList.remove("cust-detail-open");
    expenseModalOverlay?.remove();
    expenseModalOverlay = null;
    expenseForm = null;
    expenseModalWired = false;
    unsubPhases();
    unsubPhases = () => {};
  }

  function ensureExpenseModal() {
    if (expenseModalOverlay) return;

    const overlay = document.createElement("div");
    overlay.className = "cust-detail-overlay";
    overlay.setAttribute("role", "presentation");
    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) closeExpenseModal();
    });

    const modal = document.createElement("div");
    modal.className = "cust-detail-modal card finance-expense-modal";
    modal.setAttribute("role", "dialog");
    modal.setAttribute("aria-modal", "true");
    modal.setAttribute("aria-labelledby", "finance-expense-modal-title");
    modal.setAttribute("tabindex", "-1");
    modal.innerHTML = `
      <div class="cust-detail-head">
        <div class="cust-detail-title">
          <strong id="finance-expense-modal-title">New project expense</strong>
          <span class="text-muted">Save as draft — submit for approval from the table</span>
        </div>
        <button type="button" class="icon-btn icon-btn--sm cust-detail-close" id="finance-expense-close" aria-label="Close">${icon("x", { size: 16 })}</button>
      </div>
      <form id="expense-form" class="cust-form cust-form--compact">
        <div class="cust-form-shell">
          <div class="cust-form-row">
            <div class="cust-form-section">
              <div class="cust-form-section-head">
                <h4 class="cust-form-section-title">Expense details</h4>
              </div>
              <div class="cust-form-section-body">
                <div class="cust-form-grid">
                  <label class="cust-form-field">
                    <span class="cust-form-label">Project *</span>
                    <select name="projectId" class="cust-form-input" required aria-label="Project">
                      <option value="">Select project</option>
                    </select>
                  </label>
                  <label class="cust-form-field">
                    <span class="cust-form-label">Category *</span>
                    <select name="category" class="cust-form-input" required aria-label="Category">
                      ${EXPENSE_CATEGORIES.map((c) => `<option value="${c}">${escapeHtml(c)}</option>`).join("")}
                    </select>
                  </label>
                  <label class="cust-form-field">
                    <span class="cust-form-label">Amount (BDT) *</span>
                    <input name="amount" type="number" step="0.01" min="0" class="cust-form-input" placeholder="0.00" required />
                  </label>
                  <label class="cust-form-field">
                    <span class="cust-form-label">Expense date *</span>
                    <input name="expenseDate" type="date" class="cust-form-input" required />
                  </label>
                  <label class="cust-form-field">
                    <span class="cust-form-label">Phase (optional)</span>
                    <select name="phaseId" class="cust-form-input" aria-label="Phase">
                      <option value="">Phase (optional)</option>
                    </select>
                  </label>
                  <label class="cust-form-field cust-form-field--full">
                    <span class="cust-form-label">Description / narration</span>
                    <textarea name="description" class="cust-form-input cust-form-textarea" placeholder="What was purchased or paid for?" rows="2"></textarea>
                  </label>
                </div>
              </div>
            </div>
          </div>
        </div>
        <div class="cust-form-footer">
          <div class="form-actions cust-form-actions">
            <button type="submit" class="btn btn-primary">Save as draft</button>
            <button type="button" class="btn btn-ghost" id="finance-expense-cancel">Cancel</button>
          </div>
        </div>
      </form>
    `;
    modal.addEventListener("click", (e) => e.stopPropagation());
    overlay.appendChild(modal);
    expenseModalOverlay = overlay;
    expenseForm = modal.querySelector("#expense-form");

    modal.querySelector("#finance-expense-close").onclick = () => closeExpenseModal();
    modal.querySelector("#finance-expense-cancel").onclick = () => closeExpenseModal();

    if (!expenseModalWired) {
      expenseModalWired = true;
      wireExpenseModalForm();
    }
  }

  function openExpenseModal() {
    if (!canPerformAction("submit_expense") && !canPerformAction("post_expense")) {
      showToast("You cannot create expenses", "error");
      return;
    }
    ensureExpenseModal();
    syncProjectFilterOptions();
    expenseForm.expenseDate.value = todayISO();
    expenseForm.amount.value = "";
    expenseForm.description.value = "";
    if (filters.projectId) {
      expenseForm.projectId.value = filters.projectId;
      bindPhasesForForm(filters.projectId);
    } else {
      expenseForm.projectId.value = "";
      bindPhasesForForm("");
    }
    document.body.classList.add("cust-detail-open");
    document.addEventListener("keydown", onExpenseModalEscapeKey);
    document.body.appendChild(expenseModalOverlay);
    expenseModalOverlay.querySelector(".finance-expense-modal")?.focus({ preventScroll: true });
  }

  function wireExpenseModalForm() {
    if (!expenseForm) return;
    expenseForm.projectId.onchange = () => bindPhasesForForm(expenseForm.projectId.value);
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
        showToast("Expense saved as draft");
        closeExpenseModal();
      } catch (err) {
        showToast(err.message, "error");
      }
    };
  }

  function wireExpenseToolbar() {
    if (toolbarWired) return;
    toolbarWired = true;
    const projFilter = root.querySelector("#fin-filter-project");
    const statusFilter = root.querySelector("#fin-filter-status");
    const searchInput = root.querySelector("#fin-search");
    const clearBtn = root.querySelector("#fin-clear-filters");
    const exportBtn = root.querySelector("#fin-export");
    const addBtn = root.querySelector("#fin-add-expense");

    addBtn?.addEventListener("click", () => openExpenseModal());

    projFilter.onchange = () => {
      filters.projectId = projFilter.value;
      bindScopedExpenses(filters.projectId);
      renderExpenses();
    };
    statusFilter.onchange = () => {
      filters.status = statusFilter.value;
      renderExpenses();
    };
    searchInput.oninput = () => {
      filters.query = searchInput.value.trim().toLowerCase();
      renderExpenses();
    };
    clearBtn.onclick = () => {
      filters.projectId = "";
      filters.status = "all";
      filters.query = "";
      projFilter.value = "";
      statusFilter.value = "all";
      searchInput.value = "";
      bindScopedExpenses("");
      renderExpenses();
    };
    exportBtn.onclick = () => {
      exportExpensesCsv(filteredExpenses(), projectName);
    };
  }

  function bindScopedExpenses(projectId) {
    unsubScopedExpenses();
    unsubScopedExpenses = () => {};
    scopedExpenses = null;
    if (!projectId) return;
    unsubScopedExpenses = listenProjectSub(projectId, "projectExpenses", (list) => {
      scopedExpenses = list.map((e) => ({ ...e, projectId: e.projectId || projectId }));
      renderExpenses();
    });
  }

  function syncProjectFilterOptions() {
    const projFilter = root.querySelector("#fin-filter-project");
    if (!projFilter) return;
    const cur = filters.projectId;
    projFilter.innerHTML =
      '<option value="">All projects</option>' +
      projects.map((p) => `<option value="${p.id}">${escapeHtml(p.name)}</option>`).join("");
    projFilter.value = cur;

    const formProj = expenseForm?.projectId;
    if (formProj) {
      const formCur = formProj.value;
      formProj.innerHTML =
        '<option value="">Select project</option>' +
        projects.map((p) => `<option value="${p.id}">${escapeHtml(p.name)}</option>`).join("");
      if (formCur && projects.some((p) => p.id === formCur)) formProj.value = formCur;
      else if (cur && projects.some((p) => p.id === cur)) formProj.value = cur;
    }
    syncAddExpenseButton();
  }

  function bindPhasesForForm(projectId) {
    if (!expenseForm?.phaseId) return;
    unsubPhases();
    unsubPhases = () => {};
    const phaseSel = expenseForm.phaseId;
    phaseSel.innerHTML = '<option value="">Phase (optional)</option>';
    if (!projectId) return;
    unsubPhases = listenProjectSub(projectId, "projectPhases", (list) => {
      phases = list;
      phaseSel.innerHTML =
        '<option value="">Phase (optional)</option>' +
        list.map((ph) => `<option value="${ph.id}">${escapeHtml(ph.name)}</option>`).join("");
    });
  }

  function wireVoucherForm(vchForm) {
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
  }

  function expenseSourceList() {
    if (filters.projectId && scopedExpenses) return scopedExpenses;
    return allExpenses;
  }

  function filteredExpenses() {
    let list = [...expenseSourceList()];
    if (filters.projectId && !scopedExpenses) {
      list = list.filter((e) => e.projectId === filters.projectId);
    }
    if (filters.status !== "all") {
      list = list.filter((e) => (e.status || "draft") === filters.status);
    }
    const q = filters.query;
    if (q) {
      list = list.filter((e) => {
        const hay = [
          e.category,
          e.description,
          String(e.amount ?? ""),
          projectName(e.projectId),
        ]
          .join(" ")
          .toLowerCase();
        return hay.includes(q);
      });
    }
    return list.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  }

  function renderFinanceMetrics() {
    if (!metricsRow) return;
    const monthPrefix = todayISO().slice(0, 7);
    const expenses = allExpenses;
    const pending = expenses.filter((e) => e.status === "submitted").length;
    const approvedMonth = expenses
      .filter((e) => e.status === "approved" && (e.expenseDate || "").startsWith(monthPrefix))
      .reduce((a, e) => a + (Number(e.amount) || 0), 0);
    const drafts = expenses.filter((e) => (e.status || "draft") === "draft").length;
    const acctCount = accounts.length;
    const recentVouchers = [...vouchers].reverse().slice(0, 30).length;

    const cards = [
      {
        label: "Pending approval",
        value: String(pending),
        iconKey: "expense",
        tone: "orange",
        footLeft: pending ? "Awaiting review" : "Queue clear",
        spark: financeSparklineSvg([1, 2, pending || 1, pending || 2, pending, pending, pending], "orange"),
      },
      {
        label: "Approved this month",
        value: formatCompactBDT(approvedMonth),
        iconKey: "expense",
        tone: "green",
        footLeft: formatBDT(approvedMonth),
        spark: financeSparklineSvg([2, 3, approvedMonth ? 4 : 2, 3, 4, 3, 4], "green"),
      },
      {
        label: "Draft expenses",
        value: String(drafts),
        iconKey: "collection",
        tone: "teal",
        footLeft: drafts ? "Not yet submitted" : "No drafts",
        spark: financeSparklineSvg([drafts || 1, drafts || 2, drafts, drafts, drafts, drafts, drafts], "teal"),
      },
      {
        label: "Chart of accounts",
        value: String(acctCount),
        iconKey: "receivable",
        tone: "blue",
        footLeft: acctCount ? "Active ledger accounts" : "No accounts",
        spark: financeSparklineSvg([2, acctCount || 1, acctCount || 2, acctCount || 3, 2, 2, 2], "blue"),
      },
      {
        label: "Recent vouchers",
        value: String(recentVouchers),
        iconKey: "projects",
        tone: "yellow",
        footLeft: "Last 30 entries",
        spark: financeSparklineSvg([1, 2, recentVouchers || 1, 2, 3, 2, 3], "yellow"),
      },
    ];

    metricsRow.className = "dash-kpi-row";
    metricsRow.innerHTML = cards
      .map(
        (c) => `<div class="dash-kpi-card card cust-kpi-card ${c.extraClass || ""}">
      <div class="cust-kpi-spark">${c.spark}</div>
      <div class="dash-kpi-head">
        <div class="dash-kpi-icon dash-kpi-icon--flat">${kpiIcon(c.iconKey).replace('class="dash-color-icon"', 'class="dash-color-icon cust-kpi-flat-icon"')}</div>
        <div class="dash-kpi-main">
          <span class="dash-kpi-label">${escapeHtml(c.label)}</span>
          <div class="dash-kpi-value">${escapeHtml(c.value)}</div>
        </div>
      </div>
      <div class="dash-kpi-foot">
        <div class="dash-kpi-foot-left">${escapeHtml(c.footLeft)}</div>
      </div>
    </div>`
      )
      .join("");
  }

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

  function renderExpenses() {
    if (!expenseTbody) return;
    const visible = filteredExpenses();
    if (expenseCountEl) {
      expenseCountEl.textContent = `Showing ${visible.length} expense${visible.length === 1 ? "" : "s"}`;
    }
    if (!visible.length) {
      expenseTbody.innerHTML = `<tr class="empty-row"><td colspan="8"><p class="proj-empty">No expenses match your filters</p></td></tr>`;
      return;
    }
    expenseTbody.innerHTML = visible
      .map((e) => {
        const pid = e.projectId || filters.projectId || "";
        return `<tr>
              <td>${escapeHtml(e.expenseDate || "—")}</td>
              <td>${escapeHtml(projectName(pid))}</td>
              <td>${escapeHtml(e.category || "—")}</td>
              <td class="text-right">${formatBDT(e.amount)}</td>
              <td>${escapeHtml(e.description || "—")}</td>
              <td class="cust-col-center">${statusChip(e.status || "draft")}</td>
              <td class="cust-col-center">${escapeHtml(e.approvalStage || "—")}</td>
              <td class="cust-col-center proj-row-actions-cell">${expenseActionButtons(e, pid)}</td>
            </tr>`;
      })
      .join("");
    wireExpenseActions(expenseTbody);
  }

  function styleTableWrap(wrap) {
    const table = wrap.querySelector("table");
    if (table) {
      table.classList.add("dash-table", "projects-table");
    }
    wrap.classList.add("projects-table-wrap");
  }

  function renderAccounts() {
    if (!accHost) return;
    accHost.innerHTML = "";
    const wrap = renderTable(
      "acc",
      [
        { key: "code", label: "Code" },
        { key: "name", label: "Name" },
        { key: "balance", label: "Balance", align: "right" },
      ],
      accounts,
      (a) => ({ code: a.code, name: a.name, balance: formatBDT(a.balance ?? 0) })
    );
    styleTableWrap(wrap);
    accHost.appendChild(wrap);

    const vchForm = vchFormHost?.querySelector("#voucher-form");
    if (!vchForm) return;
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
  }

  function renderVouchers() {
    if (!vchListHost) return;
    vchListHost.innerHTML = "";
    const wrap = renderTable(
      "vch",
      [
        { key: "voucherNo", label: "Voucher" },
        { key: "date", label: "Date" },
        { key: "narration", label: "Description" },
        { key: "type", label: "Type" },
      ],
      [...vouchers].reverse().slice(0, 30),
      (v) => ({
        voucherNo: v.voucherNo,
        date: v.date,
        narration: v.narration,
        type: v.type,
      })
    );
    styleTableWrap(wrap);
    vchListHost.appendChild(wrap);
  }

  function refreshAll() {
    renderFinanceMetrics();
    renderExpenses();
    renderAccounts();
    renderVouchers();
  }

  ensureLayout();

  const u1 = listenList("accounts", (list) => {
    accounts = list;
    renderFinanceMetrics();
    renderAccounts();
  });
  const u2 = listenList("vouchers", (list) => {
    vouchers = list;
    renderFinanceMetrics();
    renderVouchers();
  });
  const u3 = listenList("projects", (list) => {
    projects = list;
    syncProjectFilterOptions();
    renderExpenses();
  });
  const u4 = listenList("projectExpenses", () => {
    allExpenses = flattenProjectExpenses(resolveRead("projectExpenses") ?? {});
    renderFinanceMetrics();
    renderExpenses();
  });

  refreshAll();

  return {
    unmount: () => {
      closeExpenseModal();
      u1();
      u2();
      u3();
      u4();
      unsubScopedExpenses();
      unsubPhases();
    },
  };
}
