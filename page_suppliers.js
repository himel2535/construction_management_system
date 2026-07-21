import { listenList } from "./svc_data.js";
import { canPerformAction } from "./svc_governance.js";
import { formatBDT } from "./util_format.js";
import { showToast } from "./cmp_toast.js";
import { setActiveNav } from "./cmp_layout.js";
import { setPageChrome } from "./cmp_header.js";
import { navigateTo } from "./util_route.js";
import { statusChip } from "./cmp_ui.js";
import { openEditDialog, openCustFormDialog, validateUrl } from "./cmp_projectTab.js";
import { confirmAction } from "./cmp_confirm.js";
import { supplierAgingIcon } from "./cmp_dashboardIcons.js";
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
  renderSupplierKpiStripHtml,
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
  root.className = "suppliers-page dashboard-page dashboard-mockup";
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

  let listPanel = null;
  let detailHost = null;
  let kpiHost = null;
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

  const isUiLocked = () => state.selectedSupplierId === "__new__";

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
    render();
    requestAnimationFrame(() => openSupplierProfileDialog(null));
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
    const k = aggregatePageKpis(state.suppliers, state.bills, state.payments);
    kpiHost.innerHTML = renderSupplierKpiStripHtml(k);
  }

  function renderList() {
    if (!listPanel) return;
    const list = filteredSuppliers();
    const page = paginateSlice(list, state.listPage, state.listPageSize);
    if (page.page !== state.listPage) state.listPage = page.page;
    const totalFiltered = filteredSuppliers().length;

    listPanel.innerHTML = `
      <div class="dash-widget-head dash-widget-head--split">
        <div>
          <h3 class="dash-widget-title">Suppliers</h3>
          <p class="dash-widget-sub">Search, filter, and open payee profiles</p>
        </div>
        <span class="cust-toolbar-count" id="sup-list-count">${totalFiltered}</span>
      </div>
      <div class="dash-widget-body sup-list-body">
        <div class="sup-list-toolbar-compact">
          <div class="cust-toolbar-search toolbar-search sup-list-search">
            <span class="search-icon" aria-hidden="true">${icon("search", { size: 16 })}</span>
            <input type="search" class="cust-toolbar-search-input" id="sup-search" placeholder="Search suppliers..." autocomplete="off" value="${escapeHtml(state.filterQuery)}" />
          </div>
          <div class="sup-list-select-row">
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
          <div class="sup-list-actions cust-toolbar-btn-group">
            <button type="button" class="btn btn-ghost btn-sm btn-icon sup-filter-btn" id="sup-filter-toggle" title="More filters">${icon("filter", { size: 16 })}</button>
            <button type="button" class="btn btn-ghost btn-sm cust-toolbar-btn cust-toolbar-btn--export" id="sup-export-btn">${icon("download", { size: 14 })} Export</button>
            <button type="button" class="btn btn-primary btn-sm" id="sup-new-btn">+ New Supplier</button>
          </div>
        </div>
        <div class="sup-advanced-filters${state.showAdvancedFilters ? " is-open" : ""}" id="sup-advanced-filters">
          <label class="sup-filter-toggle"><input type="checkbox" id="sup-outstanding-only" ${state.filterOutstanding ? "checked" : ""} /> Has outstanding</label>
          <select class="toolbar-select sup-project-filter" id="sup-project-filter">
            <option value="all">All projects</option>
            ${state.projects.map((p) => `<option value="${p.id}" ${state.filterProject === p.id ? "selected" : ""}>${escapeHtml(p.name)}</option>`).join("")}
          </select>
        </div>
        <div id="sup-type-tabs-host"></div>
        <div class="sup-list-items" id="sup-list-items"></div>
        <div id="sup-pagination-host"></div>
      </div>
    `;

    listPanel.querySelector("#sup-export-btn")?.addEventListener("click", exportSuppliersCsv);
    listPanel.querySelector("#sup-new-btn")?.addEventListener("click", openNewSupplier);

    const typeHost = listPanel.querySelector("#sup-type-tabs-host");
    typeHost.appendChild(
      renderTypeTabs(countSuppliersByType(state.suppliers), state.filterType, (type) => {
        state.filterType = type;
        state.filterCategory = type;
        state.listPage = 1;
        renderList();
      })
    );

    const itemsEl = listPanel.querySelector("#sup-list-items");
    if (!page.items.length) {
      itemsEl.innerHTML = `<p class="proj-empty">No suppliers match filters</p>`;
    } else {
      for (const s of page.items) {
        const item = renderSupplierListItem(s, { selected: state.selectedSupplierId === s.id });
        item.onclick = () => {
          state.selectedSupplierId = s.id;
          state.activeTab = "overview";
          state.showFullLedger = false;
          state.openHeaderMenu = null;
          bindSupplierSubcollections();
          render();
        };
        itemsEl.appendChild(item);
      }
    }

    const paginationHost = listPanel.querySelector("#sup-pagination-host");
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

    listPanel.querySelector("#sup-search").oninput = (e) => {
      state.filterQuery = e.target.value;
      state.listPage = 1;
      renderList();
    };
    listPanel.querySelector("#sup-status-filter").onchange = (e) => {
      state.filterStatus = e.target.value;
      state.listPage = 1;
      renderList();
    };
    listPanel.querySelector("#sup-category-filter").onchange = (e) => {
      state.filterCategory = e.target.value;
      state.filterType = e.target.value;
      state.listPage = 1;
      renderList();
    };
    listPanel.querySelector("#sup-filter-toggle").onclick = () => {
      state.showAdvancedFilters = !state.showAdvancedFilters;
      renderList();
    };
    listPanel.querySelector("#sup-outstanding-only")?.addEventListener("change", (e) => {
      state.filterOutstanding = e.target.checked;
      state.listPage = 1;
      renderList();
    });
    listPanel.querySelector("#sup-project-filter")?.addEventListener("change", (e) => {
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

  function defaultSupplierProfileValues() {
    return {
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
      remarks: "",
    };
  }

  function supplierProfileFormSections() {
    return [
      {
        title: "Identity & contact",
        fields: [
          { name: "name", label: "Supplier name *", required: true },
          { name: "code", label: "Code" },
          {
            name: "type",
            label: "Type",
            type: "select",
            options: SUPPLIER_TYPES.map((t) => ({ value: t.id, label: t.label })),
          },
          {
            name: "status",
            label: "Status",
            type: "select",
            options: [
              { value: "active", label: "Active" },
              { value: "inactive", label: "Inactive" },
            ],
          },
          { name: "phone", label: "Phone" },
          { name: "email", label: "Email", type: "email" },
          { name: "contactPerson", label: "Contact person" },
          { name: "city", label: "City" },
          { name: "address", label: "Address", fullWidth: true },
        ],
      },
      {
        title: "Banking & terms",
        fields: [
          { name: "tin", label: "TIN / Tax ID" },
          { name: "binVat", label: "BIN / VAT" },
          { name: "bankName", label: "Bank name" },
          { name: "accountNo", label: "Account no" },
          { name: "branch", label: "Branch" },
          {
            name: "paymentMethod",
            label: "Preferred payment",
            type: "select",
            options: PAYMENT_METHODS.map((m) => ({ value: m.id, label: m.label })),
          },
          { name: "paymentTermsDays", label: "Payment terms (days)", type: "number" },
          { name: "creditLimit", label: "Credit limit", type: "number", step: "0.01" },
          { name: "remarks", label: "Remarks", type: "textarea", fullWidth: true, rows: 3 },
        ],
      },
    ];
  }

  function normalizeSupplierProfilePayload(vals) {
    const payload = { ...vals };
    payload.paymentTermsDays = Number(payload.paymentTermsDays) || 30;
    payload.creditLimit = Number(payload.creditLimit) || 0;
    return payload;
  }

  async function saveSupplierFromProfileForm(s, payload) {
    if (s?.id) {
      await updateSupplier(s.id, payload);
      showToast("Supplier updated");
      return;
    }
    const id = await createSupplier(payload);
    state.selectedSupplierId = id;
    state.activeTab = "overview";
    bindSupplierSubcollections();
    showToast("Supplier created");
  }

  function openSupplierProfileDialog(s) {
    const defaults = defaultSupplierProfileValues();
    const values = s?.id ? { ...defaults, ...s } : defaults;
    openCustFormDialog({
      title: s?.id ? "Edit profile" : "New supplier",
      subtitle: s?.name || "",
      sections: supplierProfileFormSections(),
      values,
      submitLabel: "Save supplier",
      onSave: async (vals) => {
        const payload = normalizeSupplierProfilePayload(vals);
        const emailCheck = validateEmail(payload.email);
        if (!emailCheck.ok) {
          showToast(emailCheck.message, "error");
          throw new Error(emailCheck.message);
        }
        await saveSupplierFromProfileForm(s, payload);
        render();
      },
    });
  }

  function supplierTableWidget(title, subtitle, tableWrapEl, { actionsHtml = "", rootClass = "" } = {}) {
    const section = document.createElement("section");
    section.className = `dash-widget dash-widget--projects card sup-report-block${rootClass ? ` ${rootClass}` : ""}`;
    section.innerHTML = `
      <div class="dash-widget-head${actionsHtml ? " dash-widget-head--split" : ""}">
        <div>
          <h3 class="dash-widget-title">${escapeHtml(title)}</h3>
          ${subtitle ? `<p class="dash-widget-sub">${escapeHtml(subtitle)}</p>` : ""}
        </div>
        ${actionsHtml}
      </div>
      <div class="dash-widget-body"></div>
    `;
    section.querySelector(".dash-widget-body").appendChild(tableWrapEl);
    return section;
  }

  function openSupplierProductDialog(s) {
    openCustFormDialog({
      title: "Add product",
      subtitle: s.name,
      sections: [
        {
          title: "Product details",
          fields: [
            { name: "name", label: "Name *", required: true },
            { name: "code", label: "SKU / Code" },
            { name: "unit", label: "Unit" },
            { name: "rate", label: "Rate", type: "number", step: "0.01" },
            { name: "category", label: "Category" },
            {
              name: "status",
              label: "Status",
              type: "select",
              options: [
                { value: "active", label: "Active" },
                { value: "inactive", label: "Inactive" },
              ],
            },
          ],
        },
      ],
      values: { unit: "pcs", status: "active" },
      submitLabel: "Save",
      onSave: async (vals) => {
        await createSupplierProduct(s.id, vals);
        showToast("Product added");
        renderDetail();
      },
    });
  }

  function openSupplierDocumentDialog(s) {
    openCustFormDialog({
      title: "Add document",
      subtitle: s.name,
      sections: [
        {
          title: "Document",
          fields: [
            { name: "title", label: "Title *", required: true },
            {
              name: "docType",
              label: "Type",
              type: "select",
              options: [
                { value: "license", label: "Trade license" },
                { value: "contract", label: "Contract" },
                { value: "invoice", label: "Invoice" },
                { value: "other", label: "Other" },
              ],
            },
            { name: "revision", label: "Revision" },
            { name: "fileUrl", label: "File URL", fullWidth: true },
          ],
        },
      ],
      values: { docType: "license", revision: "Rev 1" },
      submitLabel: "Add document",
      onSave: async (vals) => {
        const fileUrl = String(vals.fileUrl || "").trim();
        const urlCheck = validateUrl(fileUrl);
        if (!urlCheck.ok) {
          showToast(urlCheck.message, "error");
          throw new Error(urlCheck.message);
        }
        await createSupplierDocument(s.id, {
          title: vals.title,
          docType: vals.docType,
          revision: vals.revision,
          fileUrl,
        });
        showToast("Document added");
        renderDetail();
      },
    });
  }

  function openSupplierNoteDialog(s) {
    openCustFormDialog({
      title: "Add note",
      subtitle: s.name,
      sections: [
        {
          title: "Note",
          fields: [{ name: "body", label: "Note *", type: "textarea", required: true, fullWidth: true, rows: 4 }],
        },
      ],
      values: {},
      submitLabel: "Add note",
      onSave: async (vals) => {
        const body = String(vals.body || "").trim();
        if (!body) {
          showToast("Note is required", "error");
          throw new Error("empty");
        }
        await createSupplierNote(s.id, body);
        showToast("Note added");
        renderDetail();
      },
    });
  }

  function openSupplierBillDialog(s) {
    openCustFormDialog({
      title: "Create bill",
      subtitle: s.name,
      sections: [
        {
          title: "Bill details",
          fields: [
            {
              name: "projectId",
              label: "Project",
              type: "select",
              options: [
                { value: "", label: "—" },
                ...state.projects.map((p) => ({ value: p.id, label: p.name })),
              ],
            },
            { name: "billNo", label: "Bill no" },
            { name: "billDate", label: "Bill date", type: "date", required: true },
            { name: "amount", label: "Amount *", type: "number", step: "0.01", required: true },
            { name: "narration", label: "Description", type: "textarea", fullWidth: true },
          ],
        },
      ],
      values: { billDate: todayISO() },
      submitLabel: "Save draft",
      onSave: async (vals) => {
        await createSupplierBill(
          {
            supplierId: s.id,
            supplierName: s.name,
            projectId: vals.projectId,
            billNo: vals.billNo,
            billDate: vals.billDate,
            amount: vals.amount,
            narration: vals.narration,
            paymentTermsDays: s.paymentTermsDays,
            costCategory: s.defaultCostCategory || "material",
            sourceType: "manual",
          },
          { billCount: state.bills.length }
        );
        showToast("Bill saved as draft");
        renderDetail();
      },
    });
  }

  function openSupplierPaymentDialog(s) {
    const open = openBillsForSupplier(s.id, state.bills);
    let payMode = open.length ? state.paymentMode || "allocated" : "advance";

    const overlay = document.createElement("div");
    overlay.className = "cust-detail-overlay";
    overlay.setAttribute("role", "presentation");
    const modal = document.createElement("div");
    modal.className = "cust-detail-modal cust-detail-modal--payment card";
    modal.setAttribute("role", "dialog");
    modal.setAttribute("aria-modal", "true");
    modal.innerHTML = `
      <div class="cust-detail-head">
        <div class="cust-detail-title">
          <strong>Record payment</strong>
          <span class="text-muted">${escapeHtml(s.name)}</span>
        </div>
        <button type="button" class="icon-btn icon-btn--sm cust-detail-close" data-close aria-label="Close">${icon("x", { size: 16 })}</button>
      </div>
    `;
    const form = document.createElement("form");
    form.className = "cust-form cust-form--compact";
    form.innerHTML = `
      <div class="cust-form-shell">
        <div class="cust-form-row">
          <div class="cust-form-section">
            <div class="cust-form-section-body">
              <fieldset class="sup-pay-mode">
                <legend class="sup-pay-mode-legend">Payment type</legend>
                <div class="sup-pay-mode-options">
                  <label class="sup-pay-mode-option">
                    <input type="radio" name="payMode" value="allocated" ${payMode === "allocated" ? "checked" : ""} ${open.length ? "" : "disabled"} />
                    <span class="sup-pay-mode-option-label">Allocate to open bills (FIFO)</span>
                  </label>
                  <label class="sup-pay-mode-option">
                    <input type="radio" name="payMode" value="advance" ${payMode === "advance" ? "checked" : ""} />
                    <span class="sup-pay-mode-option-label">Advance / on-account payment</span>
                  </label>
                </div>
              </fieldset>
              ${!open.length ? '<p class="sup-pay-hint sup-pay-hint--mode">No open bills — payment will be recorded as advance.</p>' : ""}
              <div class="cust-form-grid cust-form-grid--2">
                <label class="cust-form-field"><span class="cust-form-label">Payment date</span><input name="paymentDate" type="date" class="cust-form-input" value="${todayISO()}" required /></label>
                <label class="cust-form-field"><span class="cust-form-label">Amount *</span><input name="amount" type="number" step="0.01" class="cust-form-input" required /></label>
                <label class="cust-form-field"><span class="cust-form-label">Method</span><select name="method" class="cust-form-input">${PAYMENT_METHODS.map((m) => `<option value="${m.id}">${escapeHtml(m.label)}</option>`).join("")}</select></label>
                <label class="cust-form-field"><span class="cust-form-label">Reference</span><input name="reference" class="cust-form-input" placeholder="Txn id" /></label>
                <label class="cust-form-field"><span class="cust-form-label">Cheque no</span><input name="chequeNo" class="cust-form-input" /></label>
              </div>
              <label class="cust-form-field cust-form-field--full"><span class="cust-form-label">Narration</span><textarea name="narration" class="cust-form-input cust-form-textarea" rows="2"></textarea></label>
              <div class="sup-fifo-list cust-form-field cust-form-field--full" id="sup-fifo-block" ${payMode === "advance" ? 'hidden' : ""}>
                ${open.length ? `<span class="cust-form-label">Open bills (FIFO)</span><ul class="sup-open-bills">${open.map((b) => `<li>${escapeHtml(b.billNo)} — ${formatBDT(b.balance)}</li>`).join("")}</ul>` : ""}
              </div>
            </div>
          </div>
        </div>
      </div>
      <div class="cust-form-footer">
        <div class="form-actions cust-form-actions">
          <button type="submit" class="btn btn-primary">Post payment</button>
          <button type="button" class="btn btn-ghost" data-cancel>Cancel</button>
        </div>
      </div>
    `;
    modal.appendChild(form);
    overlay.appendChild(modal);
    document.body.appendChild(overlay);
    document.body.classList.add("cust-detail-open");

    const close = () => {
      overlay.remove();
      document.body.classList.remove("cust-detail-open");
    };
    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) close();
    });
    modal.querySelector("[data-close]")?.addEventListener("click", close);
    form.querySelector("[data-cancel]")?.addEventListener("click", close);

    form.querySelectorAll('input[name="payMode"]').forEach((r) => {
      r.onchange = () => {
        payMode = r.value;
        state.paymentMode = payMode;
        const block = form.querySelector("#sup-fifo-block");
        if (block) block.hidden = payMode === "advance";
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
        state.paymentMode = "allocated";
        showToast(paymentType === "advance" ? "Advance payment recorded" : "Payment recorded");
        close();
        renderDetail();
      } catch (err) {
        showToast(err.message, "error");
      }
    };
  }

  function renderTransactionsTable(s, limit, { viewAllLabel = "", onViewAll = null } = {}) {
    const rows = buildRecentTransactions(s.id, state.bills, state.payments, state.projects, limit);
    const section = document.createElement("section");
    section.className = "dash-widget dash-widget--projects card sup-txn-widget sup-report-block";
    const viewAllBtn = viewAllLabel
      ? `<button type="button" class="sup-text-link" id="sup-view-all-txn">${escapeHtml(viewAllLabel)}</button>`
      : "";
    section.innerHTML = `
      <div class="dash-widget-head dash-widget-head--split">
        <div>
          <h3 class="dash-widget-title">Recent transactions</h3>
          <p class="dash-widget-sub">Bills and payments</p>
        </div>
        ${viewAllBtn}
      </div>
      <div class="dash-widget-body">
        <div class="table-wrap projects-table-wrap">
          <table class="dash-table projects-table sup-txn-table">
            <thead><tr><th>Date</th><th>Type</th><th>Ref No.</th><th>Project</th><th class="text-right">Amount</th><th class="cust-col-center">Status</th></tr></thead>
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
                <td class="cust-col-center">${statusChip(r.status)}</td>
              </tr>`
                    )
                    .join("")
                : '<tr class="empty-row"><td colspan="6">No transactions yet</td></tr>'}
            </tbody>
          </table>
        </div>
      </div>
    `;
    section.querySelector("#sup-view-all-txn")?.addEventListener("click", () => onViewAll?.());
    section.querySelectorAll(".sup-txn-ref[data-bill-id]").forEach((el) => {
      el.onclick = (e) => {
        e.preventDefault();
        state.activeTab = "payments";
        state.focusBillsLedger = true;
        renderDetail();
      };
    });
    return section;
  }

  function buildOverviewTab(s) {
    const wrap = document.createElement("div");
    wrap.className = "sup-tab-content sup-overview";
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
    contact.classList.add("sup-overview-card", "sup-overview-card--contact");
    contact.querySelector(".sup-section-card-body").innerHTML = `
      <div class="sup-contact-rows">
        <div class="sup-pay-row"><span class="sup-field-label">Phone</span><span class="sup-field-value">${formatContactValue(s.phone, "phone")}</span></div>
        <div class="sup-pay-row"><span class="sup-field-label">Email</span><span class="sup-field-value">${formatContactValue(s.email, "email")}</span></div>
        <div class="sup-pay-row"><span class="sup-field-label">Contact Person</span><span class="sup-field-value">${formatContactValue(s.contactPerson)}</span></div>
        <div class="sup-pay-row"><span class="sup-field-label">Address</span><span class="sup-field-value">${formatContactValue(s.address)}</span></div>
        <div class="sup-pay-row"><span class="sup-field-label">Tax ID / BIN</span><span class="sup-field-value">${formatContactValue(s.tin || s.binVat)}</span></div>
      </div>
    `;

    const payment = sectionCard("Payment Summary");
    payment.classList.add("sup-overview-card", "sup-overview-card--payment");
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

    wrap.appendChild(
      renderTransactionsTable(s, state.showFullLedger ? 50 : 8, {
        viewAllLabel: state.showFullLedger ? "Show less" : "View all",
        onViewAll: () => {
          state.showFullLedger = !state.showFullLedger;
          renderDetail();
        },
      })
    );
    if (!buildRecentTransactions(s.id, state.bills, state.payments, state.projects, 1).length) {
      const empty = document.createElement("p");
      empty.className = "sup-empty-cta";
      const perms = getSupplierPermissions();
      if (perms.canBill) {
        empty.innerHTML = `No transactions yet. <button type="button" class="sup-text-link" id="sup-first-bill">Create first bill</button>`;
        empty.querySelector("#sup-first-bill").onclick = () => openSupplierBillDialog(s);
      } else empty.textContent = "No transactions yet.";
      wrap.appendChild(empty);
    }

    return wrap;
  }

  function buildProfileTab(s) {
    const wrap = document.createElement("div");
    wrap.className = "sup-tab-content sup-profile-panel";

    if (state.selectedSupplierId === "__new__") {
      const card = sectionCard("New supplier", "Complete the form to add this payee");
      card.querySelector(".sup-section-card-body").innerHTML = `
        <p class="proj-empty sup-new-supplier-hint">Use the form to enter identity, contact, and banking details.</p>
        <button type="button" class="btn btn-primary btn-sm" id="sup-new-supplier-open">Add supplier details</button>
      `;
      card.querySelector("#sup-new-supplier-open")?.addEventListener("click", () => openSupplierProfileDialog(null));
      wrap.appendChild(card);
      return wrap;
    }

    const perms = getSupplierPermissions();

    const bankStr = [s.bankName, s.accountNo, s.branch].filter(Boolean).join(" · ");
    const grid = document.createElement("div");
    grid.className = "sup-profile-grid";

    const identityCard = sectionCard("Identity & contact");
    identityCard.classList.add("sup-overview-card", "sup-overview-card--profile-identity");
    const identityHead = identityCard.querySelector(".dash-widget-head");
    if (identityHead && perms.canEdit) {
      identityHead.className = "dash-widget-head dash-widget-head--split";
      identityHead.innerHTML = `
        <div>
          <h3 class="dash-widget-title sup-section-card-title">Identity & contact</h3>
        </div>
        <button type="button" class="btn btn-primary btn-sm" id="sup-profile-edit">Edit profile</button>
      `;
      identityCard.querySelector("#sup-profile-edit")?.addEventListener("click", () => openSupplierProfileDialog(s));
    }
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
    bankingCard.classList.add("sup-overview-card", "sup-overview-card--profile-banking");
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
    wrap.className = "sup-tab-content";

    const section = document.createElement("section");
    section.className = "dash-widget dash-widget--projects card sup-report-block";
    section.innerHTML = `
      <div class="dash-widget-head dash-widget-head--split">
        <div>
          <h3 class="dash-widget-title">Products & Services</h3>
          <p class="dash-widget-sub">Catalog items this supplier provides</p>
        </div>
        <button type="button" class="btn btn-primary btn-sm" id="sup-add-product">+ Add</button>
      </div>
      <div class="dash-widget-body sup-products-body"></div>
    `;
    const body = section.querySelector(".sup-products-body");

    const table = document.createElement("div");
    table.className = "table-wrap projects-table-wrap";
    table.innerHTML = `
      <table class="dash-table projects-table">
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
    body.appendChild(table);
    wrap.appendChild(section);

    section.querySelector("#sup-add-product").onclick = () => openSupplierProductDialog(s);

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
    const table = document.createElement("div");
    table.className = "table-wrap projects-table-wrap";
    table.innerHTML = `
      <table class="dash-table projects-table">
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
    wrap.className = "sup-tab-content";
    const perms = getSupplierPermissions();
    const mine = state.payments.filter((p) => p.supplierId === s.id);
    const draftBills = state.bills.filter((b) => b.supplierId === s.id && b.status === "draft");

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

    const payTableWrap = document.createElement("div");
    payTableWrap.className = "table-wrap projects-table-wrap";
    payTableWrap.innerHTML = `
      <table class="dash-table projects-table">
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

    const payWidget = supplierTableWidget(
      "Payment history",
      "Recorded payments for this supplier",
      payTableWrap,
      {
        actionsHtml: perms.canPay
          ? `<button type="button" class="btn btn-primary btn-sm" id="sup-add-payment">+ Payment</button>`
          : "",
      }
    );
    wrap.appendChild(payWidget);

    const ledgerInner = buildBillsLedgerTable(s);
    wrap.appendChild(
      supplierTableWidget("Bills ledger", "All bills and balances", ledgerInner, { rootClass: "sup-bills-ledger-widget" })
    );

    payWidget.querySelector("#sup-add-payment")?.addEventListener("click", () => {
      state.paymentMode = openBillsForSupplier(s.id, state.bills).length ? "allocated" : "advance";
      openSupplierPaymentDialog(s);
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
    wrap.className = "sup-tab-content";
    const rows = aggregateByProject(state.bills.filter((b) => b.supplierId === s.id), state.projects);
    const table = document.createElement("div");
    table.className = "table-wrap projects-table-wrap";
    table.innerHTML = `
      <table class="dash-table projects-table">
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
        navigateTo("/projects");
      };
    });
    return wrap;
  }

  function buildReportsTab(s) {
    const wrap = document.createElement("div");
    wrap.className = "sup-tab-content";
    const mine = state.bills.filter((b) => b.supplierId === s.id);
    const buckets = agingBuckets(mine);
    const card = sectionCard("Aging (outstanding)", "Open bills by due-date bucket");
    const head = card.querySelector(".dash-widget-head");
    if (head) {
      head.className = "dash-widget-head dash-widget-head--split";
      head.innerHTML = `
        <div>
          <h3 class="dash-widget-title">Aging (outstanding)</h3>
          <p class="dash-widget-sub">Open bills by due-date bucket</p>
        </div>
        <button type="button" class="sup-text-link" id="sup-export-statement">Download statement CSV</button>
      `;
    }
    const body = card.querySelector(".sup-section-card-body");
    body.innerHTML = `<div class="sup-aging-grid">
        ${Object.entries(buckets)
          .map(
            ([key, b]) =>
              `<div class="sup-aging-card sup-aging-card--${key}">
                <div class="sup-aging-card-head">
                  <span class="sup-aging-card-label">${escapeHtml(b.label)}</span>
                  ${supplierAgingIcon(key)}
                </div>
                <strong>${formatBDT(b.amount)}</strong>
                <small>${b.count} bill(s)</small>
              </div>`
          )
          .join("")}
      </div>`;
    card.querySelector("#sup-export-statement")?.addEventListener("click", () => exportSupplierStatement(s));
    wrap.appendChild(card);
    return wrap;
  }

  function buildDocumentsTab(s) {
    const wrap = document.createElement("div");
    wrap.className = "sup-tab-content";
    const card = sectionCard("Documents", "Trade licenses, contracts, and files");
    const head = card.querySelector(".dash-widget-head");
    head.className = "dash-widget-head dash-widget-head--split";
    head.innerHTML = `
      <div>
        <h3 class="dash-widget-title sup-section-card-title">Documents</h3>
        <p class="dash-widget-sub sup-section-card-sub">Trade licenses, contracts, and files</p>
      </div>
      <button type="button" class="btn btn-primary btn-sm" id="sup-add-document">+ Add document</button>
    `;
    const body = card.querySelector(".sup-section-card-body");
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
    body.appendChild(list);
    card.querySelector("#sup-add-document").onclick = () => openSupplierDocumentDialog(s);
    wrap.appendChild(card);
    return wrap;
  }

  function buildNotesTab(s) {
    const wrap = document.createElement("div");
    wrap.className = "sup-tab-content";
    const card = sectionCard("Notes", "Internal remarks about this supplier");
    const head = card.querySelector(".dash-widget-head");
    head.className = "dash-widget-head dash-widget-head--split";
    head.innerHTML = `
      <div>
        <h3 class="dash-widget-title sup-section-card-title">Notes</h3>
        <p class="dash-widget-sub sup-section-card-sub">Internal remarks about this supplier</p>
      </div>
      <button type="button" class="btn btn-primary btn-sm" id="sup-add-note">+ Add note</button>
    `;
    const body = card.querySelector(".sup-section-card-body");
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
    body.appendChild(list);
    card.querySelector("#sup-add-note").onclick = () => openSupplierNoteDialog(s);
    wrap.appendChild(card);
    return wrap;
  }

  function activityActionClassKey(action) {
    const key = String(action || "update")
      .toLowerCase()
      .replace(/[^a-z0-9_]+/g, "");
    return key || "update";
  }

  function buildActivityTab(s) {
    const wrap = document.createElement("div");
    wrap.className = "sup-tab-content";
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

    const card = sectionCard("Activity", "Bills, payments, and profile changes");
    const body = card.querySelector(".sup-section-card-body");
    const list = document.createElement("div");
    list.className = "sup-activity-list";
    if (!logs.length) {
      list.innerHTML = `<p class="proj-empty">No activity yet</p>`;
    } else {
      list.innerHTML = logs
        .map((l) => {
          const actionKey = activityActionClassKey(l.action);
          const actionLabel = ACTIVITY_ACTION_LABELS[l.action] || l.action || "update";
          const summary = l.diffSummary || "";
          const when = l.timestamp || l.createdAt ? new Date(l.timestamp || l.createdAt).toLocaleString() : "";
          return `
        <article class="sup-activity-card sup-activity-card--${escapeHtml(actionKey)}">
          <header class="sup-activity-card-head">
            <span class="sup-activity-card-action">${escapeHtml(actionLabel)}</span>
            <time class="sup-activity-card-time">${escapeHtml(when)}</time>
          </header>
          ${summary ? `<p class="sup-activity-card-summary">${escapeHtml(summary)}</p>` : ""}
        </article>`;
        })
        .join("");
    }
    body.appendChild(list);
    wrap.appendChild(card);
    return wrap;
  }

  function renderDetail() {
    if (!detailHost) return;
    detailHost.innerHTML = "";

    if (state.selectedSupplierId === "__new__") {
      detailHost.appendChild(
        renderSupplierTabBar(state.activeTab, (tab) => {
          state.activeTab = tab;
          renderDetail();
        })
      );
      const panel = document.createElement("div");
      panel.className = "sup-detail-tab-shell";
      if (state.activeTab === "profile") panel.appendChild(buildProfileTab(null));
      else {
        const hint = document.createElement("p");
        hint.className = "proj-empty card card-pad";
        hint.textContent = "Save the new supplier from Profile to access other tabs.";
        panel.appendChild(hint);
      }
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
          state.activeTab = "profile";
          renderDetail();
          openSupplierProfileDialog(s);
        },
        onMoreAction: async (action) => {
          closeHeaderMenu();
          if (action === "payment") {
            state.activeTab = "payments";
            state.paymentMode = openBillsForSupplier(s.id, state.bills).length ? "allocated" : "advance";
            renderDetail();
            openSupplierPaymentDialog(s);
          } else if (action === "inactive") {
            const next = s.status === "inactive" ? "active" : "inactive";
            const label = next === "inactive" ? "mark inactive" : "mark active";
            const ok = await confirmAction({
              title: next === "inactive" ? "Mark supplier inactive?" : "Mark supplier active?",
              message: `Are you sure you want to ${label} this supplier?`,
              confirmLabel: next === "inactive" ? "Mark inactive" : "Mark active",
              cancelLabel: "Cancel",
              variant: next === "inactive" ? "danger" : "default",
            });
            if (!ok) return;
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
          openSupplierBillDialog(s);
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
    panel.className = "sup-detail-tab-shell";
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
      <div class="sup-layout sup-mockup-layout">
        <div id="sup-kpi-host" class="dash-kpi-row sup-kpi-host"></div>
        <div class="sup-split sup-mockup-split">
          <aside class="dash-widget dash-widget--projects card sup-list-panel" id="sup-list-panel"></aside>
          <main class="sup-detail-panel" id="sup-detail-host">
            <p class="proj-empty">Select a supplier or create a new one</p>
          </main>
        </div>
      </div>
    `;
    kpiHost = root.querySelector("#sup-kpi-host");
    listPanel = root.querySelector("#sup-list-panel");
    detailHost = root.querySelector("#sup-detail-host");
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
