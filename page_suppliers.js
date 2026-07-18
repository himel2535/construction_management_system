import { listenList } from "./svc_data.js";
import { canPerformAction } from "./svc_governance.js";
import { formatBDT } from "./util_format.js";
import { showToast } from "./cmp_toast.js";
import { setActiveNav } from "./cmp_layout.js";
import { setPageChrome } from "./cmp_header.js";
import { statusChip } from "./cmp_ui.js";
import { renderTabToolbar, openEditDialog, validateUrl } from "./cmp_projectTab.js";
import { icon } from "./cmp_icons.js";
import {
  SUPPLIER_TYPES,
  PAYMENT_METHODS,
  supplierTypeLabel,
  aggregateSupplierStats,
  aggregatePageKpis,
  aggregateByProject,
  agingBuckets,
  computeBillBalance,
  computeBillStatus,
  todayISO,
  countSuppliersByType,
  buildRecentTransactions,
  paginateSlice,
  lastPaymentForSupplier,
  computeAdvanceBalance,
  buildStatementRows,
  ACTIVITY_ACTION_LABELS,
} from "./util_supplier.js";
import {
  mergeSupplierLists,
  migrateVendorsToSuppliers,
  createSupplier,
  updateSupplier,
  createSupplierBill,
  approveSupplierBill,
  recordSupplierPayment,
  openBillsForSupplier,
  allocatePaymentFifo,
  createSupplierProduct,
  updateSupplierProduct,
  deleteSupplierProduct,
  createSupplierDocument,
  createSupplierNote,
} from "./svc_supplier.js";
import {
  renderSupplierKpiRow,
  renderSupplierListItem,
  renderTypeTabs,
  renderPagination,
  renderSupplierDetailHeader,
  renderSupplierTabBar,
  sectionCard,
} from "./cmp_supplierHub.js";
import { renderProfileDefinitionList } from "./cmp_projectHub.js";

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatContactValue(value, type = "text") {
  const v = String(value || "").trim();
  if (!v) return '<span class="sup-not-provided">Not provided</span>';
  if (type === "phone") return `<a href="tel:${escapeHtml(v)}">${escapeHtml(v)}</a>`;
  if (type === "email") return `<a href="mailto:${escapeHtml(v)}">${escapeHtml(v)}</a>`;
  return escapeHtml(v);
}

function validateEmail(email) {
  if (!email) return { ok: true };
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
    ? { ok: true }
    : { ok: false, message: "Invalid email address" };
}

function getSupplierPermissions() {
  const viewer = !canPerformAction("create_supplier_bill") && !canPerformAction("pay_supplier");
  return {
    canEdit: !viewer,
    canBill: canPerformAction("create_supplier_bill") || canPerformAction("approve_supplier_bill"),
    canPay: canPerformAction("pay_supplier"),
    canApprove: canPerformAction("approve_supplier_bill"),
    isViewer: viewer,
  };
}

function downloadCsv(name, rows) {
  const csv = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `${name}.csv`;
  a.click();
}

export function mountSuppliers(container) {
  setActiveNav();
  setPageChrome({
    title: "Suppliers",
    subtitle: "Manage payees, bills, payments, and outstanding balances",
    showDateRange: false,
    quickActionLabel: "",
    onQuickAction: null,
  });

  const root = document.createElement("div");
  root.className = "suppliers-page dashboard-page";
  container.appendChild(root);

  const state = {
    suppliers: [],
    vendors: [],
    bills: [],
    payments: [],
    projects: [],
    auditLogs: [],
    products: [],
    documents: [],
    notes: [],
    selectedSupplierId: "",
    activeTab: "overview",
    editMode: false,
    showBillForm: false,
    showPaymentForm: false,
    showFullLedger: false,
    paymentMode: "allocated",
    focusBillsLedger: false,
    openHeaderMenu: null,
    filterQuery: "",
    filterType: "all",
    filterStatus: "all",
    filterCategory: "all",
    filterOutstanding: false,
    filterProject: "all",
    showAdvancedFilters: false,
    listPage: 1,
    listPageSize: 8,
  };

  let listHost = null;
  let detailHost = null;
  let kpiHost = null;
  let paginationHost = null;
  let migrated = false;
  let unsubProducts = () => {};
  let unsubDocuments = () => {};
  let unsubNotes = () => {};
  let onDocClickCloseMenus = null;
  let onEscCloseMenus = null;

  const getSelected = () => state.suppliers.find((s) => s.id === state.selectedSupplierId);

  function closeHeaderMenu() {
    if (!state.openHeaderMenu) return;
    state.openHeaderMenu = null;
  }

  function toggleHeaderMenu(menuId) {
    if (menuId == null) {
      if (!state.openHeaderMenu) return;
      state.openHeaderMenu = null;
      renderDetail();
      return;
    }
    state.openHeaderMenu = state.openHeaderMenu === menuId ? null : menuId;
    renderDetail();
  }

  const isUiLocked = () =>
    state.editMode || state.showBillForm || state.showPaymentForm || state.selectedSupplierId === "__new__";

  function renderDataUpdate(scope = "all") {
    if (scope === "kpi" || scope === "all") renderKpiStrip();
    if (scope === "list" || scope === "all") {
      if (!isUiLocked()) renderList();
    }
    if (scope === "detail" || scope === "all" || scope === "kpi") renderDetail();
  }

  function exportSupplierStatement(s) {
    const rows = buildStatementRows(s.id, state.bills, state.payments, state.projects);
    const csv = [
      ["Date", "Type", "Ref", "Project", "Debit", "Credit", "Balance"],
      ...rows.map((r) => [
        r.date,
        r.type,
        r.ref,
        r.project,
        r.debit,
        r.credit,
        r.balance,
      ]),
    ];
    downloadCsv(`supplier-statement-${(s.name || "supplier").replace(/\s+/g, "-")}`, csv);
    showToast("Statement exported");
  }

  const filteredSuppliers = () => {
    let list = [...state.suppliers];
    const typeFilter = state.filterCategory !== "all" ? state.filterCategory : state.filterType;
    if (typeFilter !== "all") list = list.filter((s) => s.type === typeFilter);
    if (state.filterStatus !== "all") list = list.filter((s) => (s.status || "active") === state.filterStatus);
    if (state.showAdvancedFilters && state.filterProject !== "all") {
      const ids = new Set(
        state.bills.filter((b) => b.projectId === state.filterProject).map((b) => b.supplierId)
      );
      list = list.filter((s) => ids.has(s.id));
    }
    if (state.filterOutstanding) {
      list = list.filter((s) => aggregateSupplierStats(s.id, state.bills).outstanding > 0);
    }
    const q = state.filterQuery.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (s) =>
          (s.name && s.name.toLowerCase().includes(q)) ||
          (s.code && s.code.toLowerCase().includes(q)) ||
          (s.phone && s.phone.includes(q))
      );
    }
    return list.sort((a, b) => (a.name || "").localeCompare(b.name || ""));
  };

  function openNewSupplier() {
    state.selectedSupplierId = "__new__";
    state.activeTab = "profile";
    state.editMode = true;
    render();
  }

  function exportSuppliersCsv() {
    const rows = [
      ["Name", "Code", "Type", "Status", "City", "Phone", "Outstanding", "Overdue"],
    ];
    for (const s of filteredSuppliers()) {
      const st = aggregateSupplierStats(s.id, state.bills);
      rows.push([
        s.name,
        s.code || "",
        supplierTypeLabel(s.type),
        s.status || "active",
        s.city || "",
        s.phone || "",
        st.outstanding,
        st.overdue,
      ]);
    }
    downloadCsv("suppliers", rows);
    showToast("Export started");
  }

  function renderKpiStrip() {
    if (!kpiHost) return;
    kpiHost.innerHTML = "";
    const k = aggregatePageKpis(state.suppliers, state.bills, state.payments);
    kpiHost.appendChild(
      renderSupplierKpiRow(k, {
        onExport: exportSuppliersCsv,
        onNew: openNewSupplier,
      })
    );
  }

  function renderList() {
    if (!listHost) return;
    const list = filteredSuppliers();
    const page = paginateSlice(list, state.listPage, state.listPageSize);
    if (page.page !== state.listPage) state.listPage = page.page;

    listHost.innerHTML = `
      <div class="sup-list-toolbar">
        <div class="sup-search-row">
          <span class="sup-search-wrap">
            ${icon("search", { size: 14, className: "icon sup-search-icon" })}
            <input type="search" class="toolbar-input sup-search-input" id="sup-search" placeholder="Search suppliers..." value="${escapeHtml(state.filterQuery)}" />
          </span>
          <button type="button" class="btn btn-ghost btn-icon sup-filter-btn" id="sup-filter-toggle" title="More filters">${icon("filter", { size: 16, className: "icon" })}</button>
        </div>
        <div class="sup-filter-row">
          <select class="toolbar-select" id="sup-status-filter">
            <option value="all">Status: All</option>
            <option value="active" ${state.filterStatus === "active" ? "selected" : ""}>Active</option>
            <option value="inactive" ${state.filterStatus === "inactive" ? "selected" : ""}>Inactive</option>
          </select>
          <select class="toolbar-select" id="sup-category-filter">
            <option value="all">Categories: All</option>
            ${SUPPLIER_TYPES.map((t) => `<option value="${t.id}" ${state.filterCategory === t.id ? "selected" : ""}>${t.label}</option>`).join("")}
          </select>
        </div>
        <div class="sup-advanced-filters${state.showAdvancedFilters ? " is-open" : ""}" id="sup-advanced-filters">
          <label class="sup-filter-toggle"><input type="checkbox" id="sup-outstanding-only" ${state.filterOutstanding ? "checked" : ""} /> Has outstanding</label>
          <select class="toolbar-select sup-project-filter" id="sup-project-filter">
            <option value="all">All projects</option>
            ${state.projects.map((p) => `<option value="${p.id}" ${state.filterProject === p.id ? "selected" : ""}>${escapeHtml(p.name)}</option>`).join("")}
          </select>
        </div>
      </div>
      <div id="sup-type-tabs-host"></div>
      <div class="sup-list-items" id="sup-list-items"></div>
    `;

    const typeHost = listHost.querySelector("#sup-type-tabs-host");
    typeHost.appendChild(
      renderTypeTabs(countSuppliersByType(state.suppliers), state.filterType, (type) => {
        state.filterType = type;
        state.filterCategory = type;
        state.listPage = 1;
        renderList();
      })
    );

    const itemsEl = listHost.querySelector("#sup-list-items");
    if (!page.items.length) {
      itemsEl.innerHTML = `<p class="proj-empty">No suppliers match filters</p>`;
    } else {
      for (const s of page.items) {
        const item = renderSupplierListItem(s, { selected: state.selectedSupplierId === s.id });
        item.onclick = () => {
          state.selectedSupplierId = s.id;
          state.activeTab = "overview";
          state.editMode = false;
          state.showBillForm = false;
          state.showPaymentForm = false;
          state.showFullLedger = false;
          state.openHeaderMenu = null;
          bindSupplierSubcollections();
          render();
        };
        itemsEl.appendChild(item);
      }
    }

    if (paginationHost) {
      paginationHost.innerHTML = "";
      paginationHost.appendChild(
        renderPagination({
          page: page.page,
          pageSize: page.pageSize,
          total: page.total,
          onPage: (p) => {
            state.listPage = p;
            renderList();
          },
        })
      );
    }

    const countEl = root.querySelector("#sup-sidebar-count");
    if (countEl) countEl.textContent = String(filteredSuppliers().length);

    listHost.querySelector("#sup-search").oninput = (e) => {
      state.filterQuery = e.target.value;
      state.listPage = 1;
      renderList();
    };
    listHost.querySelector("#sup-status-filter").onchange = (e) => {
      state.filterStatus = e.target.value;
      state.listPage = 1;
      renderList();
    };
    listHost.querySelector("#sup-category-filter").onchange = (e) => {
      state.filterCategory = e.target.value;
      state.filterType = e.target.value;
      state.listPage = 1;
      renderList();
    };
    listHost.querySelector("#sup-filter-toggle").onclick = () => {
      state.showAdvancedFilters = !state.showAdvancedFilters;
      renderList();
    };
    listHost.querySelector("#sup-outstanding-only")?.addEventListener("change", (e) => {
      state.filterOutstanding = e.target.checked;
      state.listPage = 1;
      renderList();
    });
    listHost.querySelector("#sup-project-filter")?.addEventListener("change", (e) => {
      state.filterProject = e.target.value;
      state.listPage = 1;
      renderList();
    });
  }

  function bindSupplierSubcollections() {
    unsubProducts();
    unsubDocuments();
    unsubNotes();
    state.products = [];
    state.documents = [];
    state.notes = [];
    const sid = state.selectedSupplierId;
    if (!sid || sid === "__new__") return;
    unsubProducts = listenList(`supplierProducts/${sid}`, (list) => {
      state.products = list;
      if (state.activeTab === "products") renderDetail();
    });
    unsubDocuments = listenList(`supplierDocuments/${sid}`, (list) => {
      state.documents = list;
      if (state.activeTab === "documents") renderDetail();
    });
    unsubNotes = listenList(`supplierNotes/${sid}`, (list) => {
      state.notes = list.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
      if (state.activeTab === "notes") renderDetail();
    });
  }

  function buildProfileForm(s) {
    const form = document.createElement("form");
    form.className = "form-grid proj-form sup-profile-form";
    const v = s || {
      name: "",
      code: "",
      type: "material",
      status: "active",
      phone: "",
      email: "",
      contactPerson: "",
      address: "",
      city: "",
      tin: "",
      binVat: "",
      bankName: "",
      accountNo: "",
      branch: "",
      paymentMethod: "bank",
      paymentTermsDays: 30,
      creditLimit: 0,
      defaultCostCategory: "material",
      remarks: "",
    };
    form.innerHTML = `
      <input name="name" placeholder="Supplier name *" required value="${escapeHtml(v.name)}" />
      <input name="code" placeholder="Code" value="${escapeHtml(v.code || "")}" />
      <select name="type">${SUPPLIER_TYPES.map((t) => `<option value="${t.id}" ${v.type === t.id ? "selected" : ""}>${t.label}</option>`).join("")}</select>
      <select name="status"><option value="active" ${v.status === "active" ? "selected" : ""}>Active</option><option value="inactive" ${v.status === "inactive" ? "selected" : ""}>Inactive</option></select>
      <input name="phone" placeholder="Phone" value="${escapeHtml(v.phone || "")}" />
      <input name="email" placeholder="Email" type="email" value="${escapeHtml(v.email || "")}" />
      <input name="contactPerson" placeholder="Contact person" value="${escapeHtml(v.contactPerson || "")}" />
      <input name="city" placeholder="City" value="${escapeHtml(v.city || "")}" />
      <input name="address" placeholder="Address" class="form-field--full" value="${escapeHtml(v.address || "")}" />
      <input name="tin" placeholder="TIN / Tax ID" value="${escapeHtml(v.tin || "")}" />
      <input name="binVat" placeholder="BIN / VAT" value="${escapeHtml(v.binVat || "")}" />
      <input name="bankName" placeholder="Bank name" value="${escapeHtml(v.bankName || "")}" />
      <input name="accountNo" placeholder="Account no" value="${escapeHtml(v.accountNo || "")}" />
      <input name="branch" placeholder="Branch" value="${escapeHtml(v.branch || "")}" />
      <select name="paymentMethod">${PAYMENT_METHODS.map((m) => `<option value="${m.id}" ${v.paymentMethod === m.id ? "selected" : ""}>${m.label}</option>`).join("")}</select>
      <input name="paymentTermsDays" type="number" placeholder="Payment terms (days)" value="${v.paymentTermsDays ?? 30}" />
      <input name="creditLimit" type="number" placeholder="Credit limit" value="${v.creditLimit || 0}" />
      <textarea name="remarks" placeholder="Remarks" rows="2" class="form-field--full">${escapeHtml(v.remarks || "")}</textarea>
      <div class="form-actions form-field--full">
        <button type="submit" class="btn btn-primary btn-sm">Save supplier</button>
        ${s ? '<button type="button" class="btn btn-dark btn-sm" id="sup-cancel-edit">Cancel</button>' : ""}
      </div>
    `;
    form.onsubmit = async (e) => {
      e.preventDefault();
      const fd = new FormData(form);
      const payload = Object.fromEntries(fd.entries());
      payload.paymentTermsDays = Number(payload.paymentTermsDays) || 30;
      payload.creditLimit = Number(payload.creditLimit) || 0;
      const emailCheck = validateEmail(payload.email);
      if (!emailCheck.ok) {
        showToast(emailCheck.message, "error");
        return;
      }
      try {
        if (s?.id) {
          await updateSupplier(s.id, payload);
          state.editMode = false;
          showToast("Supplier updated");
        } else {
          const id = await createSupplier(payload);
          state.selectedSupplierId = id;
          state.editMode = false;
          state.activeTab = "overview";
          bindSupplierSubcollections();
          showToast("Supplier created");
        }
        render();
      } catch (err) {
        showToast(err.message, "error");
      }
    };
    form.querySelector("#sup-cancel-edit")?.addEventListener("click", () => {
      state.editMode = false;
      renderDetail();
    });
    return form;
  }

  function buildBillFormPanel(s) {
    const panel = document.createElement("div");
    panel.className = "sup-bill-panel card card-pad";
    panel.innerHTML = `<h4 class="sup-section-title">Create bill</h4>`;
    const form = document.createElement("form");
    form.className = "form-grid proj-form-inline sup-bill-form";
    form.innerHTML = `
      <select name="projectId"><option value="">Project</option>${state.projects.map((p) => `<option value="${p.id}">${escapeHtml(p.name)}</option>`).join("")}</select>
      <input name="billNo" placeholder="Bill no" />
      <input name="billDate" type="date" value="${todayISO()}" />
      <input name="amount" type="number" step="0.01" placeholder="Amount *" required />
      <input name="narration" placeholder="Description" />
      <button type="submit" class="btn btn-primary btn-sm">Save draft</button>
      <button type="button" class="btn btn-ghost btn-sm" id="sup-bill-cancel">Cancel</button>
    `;
    form.onsubmit = async (e) => {
      e.preventDefault();
      const fd = new FormData(form);
      try {
        await createSupplierBill(
          {
            supplierId: s.id,
            supplierName: s.name,
            projectId: fd.get("projectId"),
            billNo: fd.get("billNo"),
            billDate: fd.get("billDate"),
            amount: fd.get("amount"),
            narration: fd.get("narration"),
            paymentTermsDays: s.paymentTermsDays,
            costCategory: s.defaultCostCategory || "material",
            sourceType: "manual",
          },
          { billCount: state.bills.length }
        );
        state.showBillForm = false;
        showToast("Bill saved as draft");
        renderDetail();
      } catch (err) {
        showToast(err.message, "error");
      }
    };
    form.querySelector("#sup-bill-cancel").onclick = () => {
      state.showBillForm = false;
      renderDetail();
    };
    panel.appendChild(form);
    return panel;
  }

  function renderTransactionsTable(s, limit) {
    const rows = buildRecentTransactions(s.id, state.bills, state.payments, state.projects, limit);
    const wrap = document.createElement("div");
    wrap.className = "table-wrap";
    wrap.innerHTML = `
      <table class="dash-table sup-txn-table">
        <thead><tr><th>Date</th><th>Type</th><th>Ref No.</th><th>Project</th><th class="text-right">Amount</th><th>Status</th></tr></thead>
        <tbody>
          ${rows.length
            ? rows
                .map(
                  (r) => `<tr>
              <td>${escapeHtml(r.date)}</td>
              <td>${escapeHtml(r.type)}</td>
              <td>${r.entityType === "bill" ? `<button type="button" class="sup-txn-ref" data-bill-id="${escapeHtml(r.refId)}">${escapeHtml(r.ref)}</button>` : `<span class="sup-txn-ref">${escapeHtml(r.ref)}</span>`}</td>
              <td>${escapeHtml(r.projectName)}</td>
              <td class="text-right">${formatBDT(r.amount)}</td>
              <td>${statusChip(r.status)}</td>
            </tr>`
                )
                .join("")
            : ""}
        </tbody>
      </table>
    `;
    wrap.querySelectorAll(".sup-txn-ref[data-bill-id]").forEach((el) => {
      el.onclick = (e) => {
        e.preventDefault();
        state.activeTab = "payments";
        state.focusBillsLedger = true;
        renderDetail();
      };
    });
    return wrap;
  }

  function buildOverviewTab(s) {
    const wrap = document.createElement("div");
    wrap.className = "sup-tab-panel sup-overview";
    const stats = aggregateSupplierStats(s.id, state.bills);
    const lastPay = lastPaymentForSupplier(s.id, state.payments);
    const creditLimit = Number(s.creditLimit || 0);
    const creditPct = creditLimit > 0 ? Math.min(100, Math.round((stats.outstanding / creditLimit) * 100)) : 0;

    const grid = document.createElement("div");
    grid.className = "sup-overview-grid";

    const advanceBal = computeAdvanceBalance(s.id, state.payments);
    const outstandingHint =
      stats.outstanding <= 0 ? '<p class="sup-pay-hint">No outstanding balance</p>' : "";

    const contact = sectionCard("Contact Information");
    contact.querySelector(".sup-section-card-body").innerHTML = `
      <dl class="sup-contact-dl">
        <dt>Phone</dt><dd>${formatContactValue(s.phone, "phone")}</dd>
        <dt>Email</dt><dd>${formatContactValue(s.email, "email")}</dd>
        <dt>Contact Person</dt><dd>${formatContactValue(s.contactPerson)}</dd>
        <dt>Address</dt><dd>${formatContactValue(s.address)}</dd>
        <dt>Tax ID / BIN</dt><dd>${formatContactValue(s.tin || s.binVat)}</dd>
      </dl>
    `;

    const payment = sectionCard("Payment Summary");
    payment.querySelector(".sup-section-card-body").innerHTML = `
      <div class="sup-payment-summary">
        ${outstandingHint}
        <div class="sup-pay-row"><span>Total Outstanding</span><strong class="sup-pay-outstanding">${formatBDT(stats.outstanding)}</strong></div>
        <div class="sup-pay-row"><span>Overdue Amount</span><strong class="sup-pay-overdue">${formatBDT(stats.overdue)}</strong></div>
        <div class="sup-pay-row"><span>Total Paid</span><strong class="sup-pay-paid">${formatBDT(stats.totalPaid)}</strong></div>
        <div class="sup-pay-row"><span>Last Payment</span><strong>${lastPay ? escapeHtml(lastPay.paymentDate) : '<span class="sup-not-provided">Not provided</span>'}</strong></div>
        ${advanceBal > 0 ? `<div class="sup-pay-row"><span>Advance balance</span><strong>${formatBDT(advanceBal)}</strong></div>` : ""}
        ${creditLimit > 0 ? `<div class="sup-credit-wrap"><span class="sup-credit-label">Credit limit ${formatBDT(creditLimit)}</span><div class="sup-credit-bar"><div class="sup-credit-fill" style="width:${creditPct}%"></div></div></div>` : ""}
        <button type="button" class="sup-text-link" id="sup-view-statement">View Statement →</button>
      </div>
    `;
    payment.querySelector("#sup-view-statement").onclick = () => exportSupplierStatement(s);

    grid.append(contact, payment);
    wrap.appendChild(grid);

    const txnHead = document.createElement("div");
    txnHead.className = "sup-txn-head";
    txnHead.innerHTML = `
      <h4 class="sup-section-title">Recent Transactions</h4>
      <button type="button" class="sup-text-link" id="sup-view-all-txn">${state.showFullLedger ? "Show less" : "View all"}</button>
    `;
    txnHead.querySelector("#sup-view-all-txn").onclick = () => {
      state.showFullLedger = !state.showFullLedger;
      renderDetail();
    };
    wrap.appendChild(txnHead);
    const txnTable = renderTransactionsTable(s, state.showFullLedger ? 50 : 8);
    wrap.appendChild(txnTable);
    if (!buildRecentTransactions(s.id, state.bills, state.payments, state.projects, 1).length) {
      const empty = document.createElement("p");
      empty.className = "sup-empty-cta";
      const perms = getSupplierPermissions();
      if (perms.canBill) {
        empty.innerHTML = `No transactions yet. <button type="button" class="sup-text-link" id="sup-first-bill">Create first bill</button>`;
        empty.querySelector("#sup-first-bill").onclick = () => {
          state.showBillForm = true;
          renderDetail();
        };
      } else empty.textContent = "No transactions yet.";
      wrap.appendChild(empty);
    }

    if (state.showBillForm) wrap.prepend(buildBillFormPanel(s));
    return wrap;
  }

  function buildProfileTab(s) {
    const wrap = document.createElement("div");
    wrap.className = "sup-tab-panel sup-profile-panel";
    if (state.selectedSupplierId === "__new__" || state.editMode) {
      wrap.appendChild(buildProfileForm(s));
      return wrap;
    }

    const perms = getSupplierPermissions();
    const head = document.createElement("div");
    head.className = "sup-profile-head";
    head.innerHTML = `<h4 class="sup-section-title">Profile</h4>`;
    if (perms.canEdit) {
      const editBtn = document.createElement("button");
      editBtn.type = "button";
      editBtn.className = "btn btn-primary btn-sm";
      editBtn.textContent = "Edit profile";
      editBtn.onclick = () => {
        state.editMode = true;
        renderDetail();
      };
      head.appendChild(editBtn);
    }
    wrap.appendChild(head);

    const bankStr = [s.bankName, s.accountNo, s.branch].filter(Boolean).join(" · ");
    const grid = document.createElement("div");
    grid.className = "sup-profile-grid";

    const identityCard = sectionCard("Identity & contact");
    identityCard.querySelector(".sup-section-card-body").appendChild(
      renderProfileDefinitionList([
        { label: "Type", value: supplierTypeLabel(s.type) },
        { label: "Status", valueHtml: statusChip(s.status || "active") },
        { label: "Code", valueHtml: s.code ? escapeHtml(s.code) : formatContactValue("") },
        { label: "Contact person", valueHtml: formatContactValue(s.contactPerson) },
        { label: "Phone", valueHtml: formatContactValue(s.phone, "phone") },
        { label: "Email", valueHtml: formatContactValue(s.email, "email") },
        { label: "City", valueHtml: formatContactValue(s.city) },
        { label: "Address", valueHtml: formatContactValue(s.address) },
      ])
    );

    const bankingCard = sectionCard("Banking & terms");
    bankingCard.querySelector(".sup-section-card-body").appendChild(
      renderProfileDefinitionList([
        { label: "Bank", valueHtml: bankStr ? escapeHtml(bankStr) : formatContactValue("") },
        { label: "Tax ID / BIN", valueHtml: formatContactValue(s.tin || s.binVat) },
        { label: "Payment terms", value: `${s.paymentTermsDays ?? 30} days` },
        {
          label: "Preferred payment",
          value: PAYMENT_METHODS.find((m) => m.id === s.paymentMethod)?.label || s.paymentMethod || "—",
        },
        { label: "Credit limit", value: formatBDT(s.creditLimit || 0) },
      ])
    );

    grid.append(identityCard, bankingCard);
    wrap.appendChild(grid);

    if (s.remarks) {
      const remarks = document.createElement("p");
      remarks.className = "sup-remarks";
      remarks.textContent = s.remarks;
      wrap.appendChild(remarks);
    }

    return wrap;
  }

  function buildProductsTab(s) {
    const wrap = document.createElement("div");
    wrap.className = "sup-tab-panel";
    wrap.appendChild(
      renderTabToolbar("Products & Services", `<button type="button" class="btn btn-primary btn-sm" id="sup-add-product">+ Add</button>`)
    );

    const form = document.createElement("form");
    form.className = "form-grid proj-form-inline sup-product-form";
    form.hidden = true;
    form.id = "sup-product-form";
    form.innerHTML = `
      <input name="name" placeholder="Name *" required />
      <input name="code" placeholder="SKU / Code" />
      <input name="unit" placeholder="Unit" value="pcs" />
      <input name="rate" type="number" step="0.01" placeholder="Rate" />
      <input name="category" placeholder="Category" />
      <select name="status"><option value="active">Active</option><option value="inactive">Inactive</option></select>
      <button type="submit" class="btn btn-primary btn-sm">Save</button>
    `;
    wrap.appendChild(form);

    const table = document.createElement("div");
    table.className = "table-wrap";
    table.innerHTML = `
      <table class="dash-table">
        <thead><tr><th>Name</th><th>Code</th><th>Unit</th><th class="text-right">Rate</th><th>Category</th><th>Status</th><th></th></tr></thead>
        <tbody>
          ${state.products.length
            ? state.products
                .map(
                  (p) => `<tr>
              <td>${escapeHtml(p.name)}</td>
              <td>${escapeHtml(p.code || "—")}</td>
              <td>${escapeHtml(p.unit || "—")}</td>
              <td class="text-right">${formatBDT(p.rate)}</td>
              <td>${escapeHtml(p.category || "—")}</td>
              <td>${statusChip(p.status || "active")}</td>
              <td>
                <button type="button" class="btn btn-ghost btn-sm sup-edit-product" data-id="${p.id}">Edit</button>
                <button type="button" class="btn btn-ghost btn-sm sup-del-product" data-id="${p.id}">Delete</button>
              </td>
            </tr>`
                )
                .join("")
            : '<tr class="empty-row"><td colspan="7"><span class="proj-empty">No products yet — add items this supplier provides.</span></td></tr>'}
        </tbody>
      </table>
    `;
    wrap.appendChild(table);

    wrap.querySelector("#sup-add-product").onclick = () => {
      form.hidden = !form.hidden;
    };
    form.onsubmit = async (e) => {
      e.preventDefault();
      const fd = new FormData(form);
      try {
        await createSupplierProduct(s.id, Object.fromEntries(fd.entries()));
        form.reset();
        form.hidden = true;
        showToast("Product added");
      } catch (err) {
        showToast(err.message, "error");
      }
    };
    wrap.querySelectorAll(".sup-edit-product").forEach((btn) => {
      const p = state.products.find((x) => x.id === btn.dataset.id);
      if (!p) return;
      btn.onclick = () => {
        openEditDialog(
          "Edit product",
          [
            { name: "name", label: "Name *", required: true },
            { name: "code", label: "SKU / Code" },
            { name: "unit", label: "Unit" },
            { name: "rate", label: "Rate", type: "number" },
            { name: "category", label: "Category" },
          ],
          p,
          async (vals) => {
            await updateSupplierProduct(s.id, p.id, vals);
            showToast("Product updated");
          }
        );
      };
    });
    wrap.querySelectorAll(".sup-del-product").forEach((btn) => {
      btn.onclick = async () => {
        const row = btn.closest("tr");
        if (row?.dataset.confirming === "1") {
          try {
            await deleteSupplierProduct(s.id, btn.dataset.id);
            showToast("Product removed");
          } catch (err) {
            showToast(err.message, "error");
          }
          return;
        }
        row.dataset.confirming = "1";
        btn.textContent = "Confirm?";
        setTimeout(() => {
          if (row?.dataset.confirming === "1") {
            row.dataset.confirming = "";
            btn.textContent = "Delete";
          }
        }, 4000);
      };
    });
    return wrap;
  }

  function buildBillsLedgerTable(s) {
    const perms = getSupplierPermissions();
    const today = todayISO();
    const mine = state.bills
      .filter((b) => b.supplierId === s.id)
      .sort((a, b) => (b.billDate || "").localeCompare(a.billDate || ""));
    const wrap = document.createElement("div");
    wrap.className = "sup-bills-ledger";
    wrap.id = "sup-bills-ledger";
    wrap.innerHTML = `<h4 class="sup-section-title">Bills ledger</h4>`;
    const table = document.createElement("div");
    table.className = "table-wrap";
    table.innerHTML = `
      <table class="dash-table">
        <thead><tr><th>Bill</th><th>Project</th><th>Due</th><th class="text-right">Amount</th><th class="text-right">Paid</th><th class="text-right">Balance</th><th>Status</th><th></th></tr></thead>
        <tbody>
          ${mine.length
            ? mine
                .map((b) => {
                  const bal = computeBillBalance(b);
                  const st = computeBillStatus(b, today);
                  const proj = state.projects.find((p) => p.id === b.projectId)?.name || "—";
                  return `<tr>
              <td>${escapeHtml(b.billNo || b.id)}</td>
              <td>${escapeHtml(proj)}</td>
              <td>${escapeHtml(b.dueDate || "—")}</td>
              <td class="text-right">${formatBDT(b.amount)}</td>
              <td class="text-right">${formatBDT(b.paidAmount || 0)}</td>
              <td class="text-right">${formatBDT(bal)}</td>
              <td>${statusChip(st)}</td>
              <td>${b.status === "draft" && perms.canApprove ? `<button type="button" class="btn btn-ghost btn-sm sup-approve-ledger" data-id="${b.id}">Approve</button>` : ""}</td>
            </tr>`;
                })
                .join("")
            : '<tr class="empty-row"><td colspan="8">No bills yet</td></tr>'}
        </tbody>
      </table>
    `;
    wrap.appendChild(table);
    wrap.querySelectorAll(".sup-approve-ledger").forEach((btn) => {
      btn.onclick = async () => {
        try {
          await approveSupplierBill(btn.dataset.id);
          showToast("Bill approved");
          renderDetail();
        } catch (err) {
          showToast(err.message, "error");
        }
      };
    });
    return wrap;
  }

  function buildPaymentsTab(s) {
    const wrap = document.createElement("div");
    wrap.className = "sup-tab-panel";
    const perms = getSupplierPermissions();
    const mine = state.payments.filter((p) => p.supplierId === s.id);
    const open = openBillsForSupplier(s.id, state.bills);
    const draftBills = state.bills.filter((b) => b.supplierId === s.id && b.status === "draft");

    wrap.appendChild(
      renderTabToolbar(
        "Payments",
        [
          perms.canPay ? `<button type="button" class="btn btn-primary btn-sm" id="sup-add-payment">+ Payment</button>` : "",
          perms.canApprove && draftBills.length
            ? `<span class="text-muted">${draftBills.length} draft bill(s)</span>`
            : "",
        ]
          .filter(Boolean)
          .join(" ")
      )
    );

    if (draftBills.length) {
      const drafts = document.createElement("div");
      drafts.className = "sup-draft-bills card card-pad";
      drafts.innerHTML = `<h4 class="sup-section-title">Draft bills — approve to post AP</h4>`;
      const ul = document.createElement("ul");
      ul.className = "sup-open-bills";
      for (const b of draftBills) {
        const li = document.createElement("li");
        li.innerHTML = `${escapeHtml(b.billNo || b.id)} — ${formatBDT(b.amount)} `;
        if (perms.canApprove) {
          const btn = document.createElement("button");
          btn.type = "button";
          btn.className = "btn btn-ghost btn-sm";
          btn.textContent = "Approve";
          btn.onclick = async () => {
            try {
              await approveSupplierBill(b.id);
              showToast("Bill approved");
              renderDetail();
            } catch (err) {
              showToast(err.message, "error");
            }
          };
          li.appendChild(btn);
        }
        ul.appendChild(li);
      }
      drafts.appendChild(ul);
      wrap.appendChild(drafts);
    }

    if (state.showPaymentForm && perms.canPay) {
      const defaultMode = open.length ? state.paymentMode : "advance";
      const form = document.createElement("form");
      form.className = "form-grid proj-form sup-payment-form card card-pad";
      form.innerHTML = `
        <div class="form-field form-field--full sup-pay-mode">
          <label><input type="radio" name="payMode" value="allocated" ${defaultMode === "allocated" ? "checked" : ""} ${open.length ? "" : "disabled"} /> Allocate to open bills (FIFO)</label>
          <label><input type="radio" name="payMode" value="advance" ${defaultMode === "advance" ? "checked" : ""} /> Advance / on-account payment</label>
        </div>
        ${!open.length ? '<p class="sup-pay-hint form-field--full">No open bills — payment will be recorded as advance.</p>' : ""}
        <input name="paymentDate" type="date" value="${todayISO()}" />
        <input name="amount" type="number" step="0.01" placeholder="Payment amount *" required />
        <select name="method">${PAYMENT_METHODS.map((m) => `<option value="${m.id}">${m.label}</option>`).join("")}</select>
        <input name="reference" placeholder="Reference / txn id" />
        <input name="chequeNo" placeholder="Cheque no" />
        <textarea name="narration" placeholder="Narration" rows="2" class="form-field--full"></textarea>
        <div class="form-field form-field--full sup-fifo-list" id="sup-fifo-block" ${defaultMode === "advance" ? 'style="display:none"' : ""}>
          ${open.length ? `<span class="form-field-label">Open bills (FIFO)</span><ul class="sup-open-bills">${open.map((b) => `<li>${escapeHtml(b.billNo)} — ${formatBDT(b.balance)}</li>`).join("")}</ul>` : ""}
        </div>
        <button type="submit" class="btn btn-primary btn-sm">Post payment</button>
        <button type="button" class="btn btn-ghost btn-sm" id="sup-pay-cancel">Cancel</button>
      `;
      form.querySelectorAll('input[name="payMode"]').forEach((r) => {
        r.onchange = () => {
          state.paymentMode = r.value;
          const block = form.querySelector("#sup-fifo-block");
          if (block) block.style.display = r.value === "allocated" ? "" : "none";
        };
      });
      form.onsubmit = async (e) => {
        e.preventDefault();
        const fd = new FormData(form);
        const amount = Number(fd.get("amount"));
        const mode = fd.get("payMode") || "advance";
        let allocations = [];
        let paymentType = "advance";
        if (mode === "allocated" && open.length) {
          const fifo = allocatePaymentFifo(amount, open);
          allocations = fifo.allocations;
          if (!allocations.length) {
            showToast("No open bills to allocate", "error");
            return;
          }
          if (fifo.unallocated > 0.01) {
            showToast(`Only ${formatBDT(amount - fifo.unallocated)} can be allocated`, "error");
            return;
          }
          paymentType = "allocated";
        }
        try {
          await recordSupplierPayment({
            supplierId: s.id,
            supplierName: s.name,
            amount,
            method: fd.get("method"),
            paymentDate: fd.get("paymentDate"),
            reference: fd.get("reference"),
            chequeNo: fd.get("chequeNo"),
            narration: fd.get("narration"),
            allocations,
            paymentType,
          });
          state.showPaymentForm = false;
          state.paymentMode = "allocated";
          showToast(paymentType === "advance" ? "Advance payment recorded" : "Payment recorded");
          renderDetail();
        } catch (err) {
          showToast(err.message, "error");
        }
      };
      form.querySelector("#sup-pay-cancel").onclick = () => {
        state.showPaymentForm = false;
        renderDetail();
      };
      wrap.appendChild(form);
    }

    wrap.appendChild(buildBillsLedgerTable(s));

    const payHistory = document.createElement("div");
    payHistory.className = "table-wrap";
    payHistory.innerHTML = `
      <table class="dash-table">
        <thead><tr><th>Date</th><th class="text-right">Amount</th><th>Method</th><th>Type</th><th>Reference</th></tr></thead>
        <tbody>
          ${mine.length
            ? mine
                .map(
                  (p) => `<tr>
            <td>${escapeHtml(p.paymentDate || "—")}</td>
            <td class="text-right">${formatBDT(p.amount)}</td>
            <td>${escapeHtml(p.method || "—")}</td>
            <td>${p.paymentType === "advance" ? "Advance" : `${(p.allocations || []).length} bill(s)`}</td>
            <td>${escapeHtml(p.reference || p.chequeNo || "—")}</td>
          </tr>`
                )
                .join("")
            : '<tr class="empty-row"><td colspan="5">No payments</td></tr>'}
        </tbody>
      </table>
    `;
    payHistory.innerHTML = `<h4 class="sup-section-title">Payment history</h4>` + payHistory.innerHTML;
    wrap.appendChild(payHistory);
    wrap.querySelector("#sup-add-payment")?.addEventListener("click", () => {
      state.showPaymentForm = true;
      state.paymentMode = openBillsForSupplier(s.id, state.bills).length ? "allocated" : "advance";
      renderDetail();
    });
    if (state.focusBillsLedger) {
      requestAnimationFrame(() => {
        wrap.querySelector("#sup-bills-ledger")?.scrollIntoView({ behavior: "smooth", block: "start" });
        state.focusBillsLedger = false;
      });
    }
    return wrap;
  }

  function buildProjectsTab(s) {
    const wrap = document.createElement("div");
    wrap.className = "sup-tab-panel";
    const rows = aggregateByProject(state.bills.filter((b) => b.supplierId === s.id), state.projects);
    const table = document.createElement("div");
    table.className = "table-wrap";
    table.innerHTML = `
      <table class="dash-table">
        <thead><tr><th>Project</th><th class="text-right">Billed</th><th class="text-right">Paid</th><th class="text-right">Outstanding</th></tr></thead>
        <tbody>
          ${rows.length
            ? rows
                .map(
                  (r) => `<tr class="sup-proj-row" data-pid="${escapeHtml(r.projectId)}">
              <td><button type="button" class="btn-link">${escapeHtml(r.projectName)}</button></td>
              <td class="text-right">${formatBDT(r.billed)}</td>
              <td class="text-right">${formatBDT(r.paid)}</td>
              <td class="text-right">${formatBDT(r.outstanding)}</td>
            </tr>`
                )
                .join("")
            : '<tr class="empty-row"><td colspan="4">No project bills yet</td></tr>'}
        </tbody>
      </table>
    `;
    wrap.appendChild(table);
    wrap.querySelectorAll(".sup-proj-row").forEach((row) => {
      row.querySelector(".btn-link").onclick = () => {
        window.location.hash = `#/projects`;
      };
    });
    return wrap;
  }

  function buildReportsTab(s) {
    const wrap = document.createElement("div");
    wrap.className = "sup-tab-panel";
    const mine = state.bills.filter((b) => b.supplierId === s.id);
    const buckets = agingBuckets(mine);
    wrap.innerHTML = `
      <div class="sup-reports-head">
        <h4 class="sup-section-title">Aging (outstanding)</h4>
        <button type="button" class="sup-text-link" id="sup-export-statement">Download statement CSV</button>
      </div>
      <div class="sup-aging-grid">
        ${Object.values(buckets)
          .map(
            (b) => `<div class="sup-aging-card"><span>${b.label}</span><strong>${formatBDT(b.amount)}</strong><small>${b.count} bill(s)</small></div>`
          )
          .join("")}
      </div>
    `;
    wrap.querySelector("#sup-export-statement").onclick = () => exportSupplierStatement(s);
    return wrap;
  }

  function buildDocumentsTab(s) {
    const wrap = document.createElement("div");
    wrap.className = "sup-tab-panel";
    const card = sectionCard("Documents", "Trade licenses, contracts, and files");
    const body = card.querySelector(".sup-section-card-body");
    const form = document.createElement("form");
    form.className = "form-grid proj-form";
    form.innerHTML = `
      <input name="title" placeholder="Document title *" required />
      <select name="docType">
        <option value="license">Trade license</option>
        <option value="contract">Contract</option>
        <option value="invoice">Invoice</option>
        <option value="other">Other</option>
      </select>
      <input name="revision" placeholder="Revision" value="Rev 1" />
      <input name="fileUrl" placeholder="File URL" />
      <button type="submit" class="btn btn-primary btn-sm">Add document</button>
    `;
    const list = document.createElement("div");
    list.className = "proj-doc-list";
    if (!state.documents.length) list.innerHTML = `<p class="proj-empty">No documents — add trade licenses, contracts, or file links.</p>`;
    else {
      list.innerHTML = state.documents
        .map(
          (d) => `
        <div class="proj-doc-row">
          <div class="proj-doc-main">
            <strong>${escapeHtml(d.title)}</strong>
            <span class="text-muted">${escapeHtml(d.docType)} · ${escapeHtml(d.revision || "—")}</span>
            ${d.fileUrl ? `<a href="${escapeHtml(d.fileUrl)}" target="_blank" rel="noopener">Open</a>` : ""}
          </div>
          ${statusChip(d.status || "draft")}
        </div>`
        )
        .join("");
    }
    body.append(form, list);
    form.onsubmit = async (e) => {
      e.preventDefault();
      const fileUrl = form.fileUrl.value.trim();
      const urlCheck = validateUrl(fileUrl);
      if (!urlCheck.ok) {
        showToast(urlCheck.message, "error");
        return;
      }
      try {
        await createSupplierDocument(s.id, {
          title: form.title.value.trim(),
          docType: form.docType.value,
          revision: form.revision.value.trim(),
          fileUrl,
        });
        form.reset();
        showToast("Document added");
      } catch (err) {
        showToast(err.message, "error");
      }
    };
    wrap.appendChild(card);
    return wrap;
  }

  function buildNotesTab(s) {
    const wrap = document.createElement("div");
    wrap.className = "sup-tab-panel";
    const form = document.createElement("form");
    form.className = "sup-note-form";
    form.innerHTML = `
      <textarea name="body" rows="3" placeholder="Add a note..." required></textarea>
      <button type="submit" class="btn btn-primary btn-sm">Add note</button>
    `;
    form.onsubmit = async (e) => {
      e.preventDefault();
      const body = form.body.value.trim();
      if (!body) return;
      try {
        await createSupplierNote(s.id, body);
        form.reset();
        showToast("Note added");
      } catch (err) {
        showToast(err.message, "error");
      }
    };
    wrap.appendChild(form);
    const list = document.createElement("div");
    list.className = "sup-notes-list";
    if (!state.notes.length) list.innerHTML = `<p class="proj-empty">No notes yet — add internal remarks about this supplier.</p>`;
    else {
      list.innerHTML = state.notes
        .map(
          (n) => `
        <article class="sup-note-item">
          <p>${escapeHtml(n.body)}</p>
          <footer><span>${escapeHtml(n.authorName || "User")}</span> · <time>${n.createdAt ? new Date(n.createdAt).toLocaleString() : ""}</time></footer>
        </article>`
        )
        .join("");
    }
    wrap.appendChild(list);
    return wrap;
  }

  function buildActivityTab(s) {
    const wrap = document.createElement("div");
    wrap.className = "sup-tab-panel";
    const sid = s.id;
    const logs = state.auditLogs
      .filter((l) => {
        const et = String(l.entityType || "");
        if (et === "supplier" && l.entityId === sid) return true;
        if (et === "supplierBill" && state.bills.some((b) => b.id === l.entityId && b.supplierId === sid)) return true;
        if (et === "supplierPayment" && state.payments.some((p) => p.id === l.entityId && p.supplierId === sid))
          return true;
        return false;
      })
      .sort((a, b) => (b.timestamp || b.createdAt || 0) - (a.timestamp || a.createdAt || 0))
      .slice(0, 40);

    const list = document.createElement("div");
    list.className = "sup-activity-list";
    if (!logs.length) list.innerHTML = `<p class="proj-empty">No activity yet</p>`;
    else {
      list.innerHTML = logs
        .map(
          (l) => `
        <div class="sup-activity-item">
          <strong>${escapeHtml(ACTIVITY_ACTION_LABELS[l.action] || l.action || "update")}</strong>
          <span>${escapeHtml(l.diffSummary || "")}</span>
          <time class="text-muted">${l.timestamp || l.createdAt ? new Date(l.timestamp || l.createdAt).toLocaleString() : ""}</time>
        </div>`
        )
        .join("");
    }
    wrap.appendChild(list);
    return wrap;
  }

  function renderDetail() {
    if (!detailHost) return;
    detailHost.innerHTML = "";

    if (state.selectedSupplierId === "__new__") {
      const panel = document.createElement("div");
      panel.className = "sup-detail-panel card card-pad";
      panel.appendChild(buildProfileForm(null));
      detailHost.appendChild(panel);
      return;
    }

    const s = getSelected();
    if (!s) {
      detailHost.innerHTML = `<p class="proj-empty card card-pad">Select a supplier from the list</p>`;
      return;
    }

    const stats = aggregateSupplierStats(s.id, state.bills);
    const perms = getSupplierPermissions();
    const headerEl = renderSupplierDetailHeader(
      s,
      stats,
      {
        onEdit: () => {
          closeHeaderMenu();
          state.editMode = true;
          state.activeTab = "profile";
          renderDetail();
        },
        onMoreAction: async (action) => {
          closeHeaderMenu();
          if (action === "payment") {
            state.activeTab = "payments";
            state.showPaymentForm = true;
            state.paymentMode = openBillsForSupplier(s.id, state.bills).length ? "allocated" : "advance";
            renderDetail();
          } else if (action === "inactive") {
            const next = s.status === "inactive" ? "active" : "inactive";
            const label = next === "inactive" ? "mark inactive" : "mark active";
            if (!window.confirm(`Are you sure you want to ${label} this supplier?`)) return;
            try {
              await updateSupplier(s.id, { status: next });
              showToast(`Supplier marked ${next}`);
            } catch (err) {
              showToast(err.message, "error");
            }
          }
        },
        onCreateBill: () => {
          if (!perms.canBill) return;
          closeHeaderMenu();
          state.showBillForm = true;
          state.activeTab = "overview";
          renderDetail();
        },
        onViewBills: () => {
          closeHeaderMenu();
          state.activeTab = "payments";
          state.focusBillsLedger = true;
          renderDetail();
        },
      },
      perms,
      {
        openMenu: state.openHeaderMenu,
        onMenuToggle: (menuId) => toggleHeaderMenu(menuId),
      }
    );
    detailHost.appendChild(headerEl);

    detailHost.appendChild(
      renderSupplierTabBar(state.activeTab, (tab) => {
        state.activeTab = tab;
        closeHeaderMenu();
        renderDetail();
      })
    );

    const panel = document.createElement("div");
    panel.className = "sup-detail-panel card card-pad";
    if (state.activeTab === "overview") panel.appendChild(buildOverviewTab(s));
    else if (state.activeTab === "profile") panel.appendChild(buildProfileTab(s));
    else if (state.activeTab === "products") panel.appendChild(buildProductsTab(s));
    else if (state.activeTab === "payments") panel.appendChild(buildPaymentsTab(s));
    else if (state.activeTab === "projects") panel.appendChild(buildProjectsTab(s));
    else if (state.activeTab === "reports") panel.appendChild(buildReportsTab(s));
    else if (state.activeTab === "documents") panel.appendChild(buildDocumentsTab(s));
    else if (state.activeTab === "notes") panel.appendChild(buildNotesTab(s));
    else panel.appendChild(buildActivityTab(s));
    detailHost.appendChild(panel);
  }

  function render() {
    renderDataUpdate("all");
  }

  function ensureLayout() {
    root.innerHTML = `
      <div class="sup-kpi-host"></div>
      <div class="suppliers-layout">
        <aside class="sup-sidebar card">
          <div class="card-pad sup-sidebar-head">
            <div class="sup-sidebar-title-row">
              <span class="sup-sidebar-title">Suppliers</span>
              <span class="sup-sidebar-count" id="sup-sidebar-count">0</span>
            </div>
            <button type="button" class="btn btn-sm btn-primary sup-sidebar-new" id="sup-new-btn">+ New Supplier</button>
          </div>
          <div id="sup-list-host"></div>
          <div id="sup-pagination-host"></div>
        </aside>
        <main class="sup-main" id="sup-detail-host"></main>
      </div>
    `;
    kpiHost = root.querySelector(".sup-kpi-host");
    listHost = root.querySelector("#sup-list-host");
    paginationHost = root.querySelector("#sup-pagination-host");
    detailHost = root.querySelector("#sup-detail-host");
    root.querySelector("#sup-new-btn")?.addEventListener("click", openNewSupplier);
  }

  ensureLayout();
  render();

  onDocClickCloseMenus = (e) => {
    if (!state.openHeaderMenu) return;
    if (e.target.closest(".sup-header-actions-root")) return;
    closeHeaderMenu();
    renderDetail();
  };
  onEscCloseMenus = (e) => {
    if (e.key !== "Escape" || !state.openHeaderMenu) return;
    closeHeaderMenu();
    renderDetail();
  };
  document.addEventListener("click", onDocClickCloseMenus);
  document.addEventListener("keydown", onEscCloseMenus);

  const unsubSuppliers = listenList("suppliers", async (list) => {
    state.suppliers = mergeSupplierLists(state.vendors, list);
    if (!migrated && state.vendors.length) {
      migrated = true;
      await migrateVendorsToSuppliers(state.vendors, list);
    }
    if (!state.selectedSupplierId && state.suppliers.length) {
      state.selectedSupplierId = state.suppliers[0].id;
      bindSupplierSubcollections();
    }
    renderDataUpdate(isUiLocked() ? "kpi" : "all");
  });
  const unsubVendors = listenList("vendors", async (list) => {
    state.vendors = list;
    state.suppliers = mergeSupplierLists(list, state.suppliers);
    if (!migrated && list.length) {
      migrated = true;
      await migrateVendorsToSuppliers(list, state.suppliers);
    }
    renderDataUpdate(isUiLocked() ? "kpi" : "all");
  });
  const unsubBills = listenList("supplierBills", (list) => {
    state.bills = list;
    renderDataUpdate("kpi");
  });
  const unsubPayments = listenList("supplierPayments", (list) => {
    state.payments = list;
    renderDataUpdate("kpi");
  });
  const unsubProjects = listenList("projects", (list) => {
    state.projects = list;
    if (!isUiLocked()) renderDataUpdate("detail");
  });
  const unsubAudit = listenList("auditLogs", (list) => {
    state.auditLogs = list;
    if (state.activeTab === "activity") renderDetail();
  });

  return {
    unmount: () => {
      if (onDocClickCloseMenus) document.removeEventListener("click", onDocClickCloseMenus);
      if (onEscCloseMenus) document.removeEventListener("keydown", onEscCloseMenus);
      unsubSuppliers();
      unsubVendors();
      unsubBills();
      unsubPayments();
      unsubProjects();
      unsubAudit();
      unsubProducts();
      unsubDocuments();
      unsubNotes();
    },
  };
}
