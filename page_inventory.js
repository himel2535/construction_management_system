import { listenList, listenValue } from "./svc_data.js";
import { showToast } from "./cmp_toast.js";
import { setActiveNav } from "./cmp_layout.js";
import { setPageChrome } from "./cmp_header.js";
import { openCustFormDialog, renderDataTable, escapeHtml } from "./cmp_projectTab.js";
import { renderPagination, statusChip } from "./cmp_moduleHub.js";
import { icon } from "./cmp_icons.js";
import { kpiIcon } from "./cmp_dashboardIcons.js";
import {
  createMaterial,
  updateMaterial,
  recordStockIn,
  recordStockOut,
  updateStockOutReturn,
} from "./svc_inventory.js";
import {
  MATERIAL_CATEGORIES,
  MATERIAL_UNITS,
  categoryLabel,
  unitLabel,
  isLowStock,
  listLowStock,
  listPendingReturns,
  buildStockLedger,
  materialIssueHistory,
  paginateSlice,
  todayISO,
} from "./util_inventory.js";
import { rollupCentralLedger } from "./util_stockLedger.js";
import { approveMaterialRequest } from "./svc_materialRequest.js";
import { createIssueVoucherFromRequisition, listPendingCentralRequisitions } from "./svc_issueVoucher.js";
import { canPerformAction } from "./svc_governance.js";
import { getCurrentUserId } from "./svc_auth.js";

const TABS = [
  { id: "materials", label: "Materials" },
  { id: "stock_in", label: "Stock In" },
  { id: "stock_out", label: "Stock Out" },
  { id: "central_ledger", label: "Central Ledger" },
  { id: "issue_vouchers", label: "Issue Vouchers" },
  { id: "ledger", label: "Ledger" },
  { id: "pending_returns", label: "Pending Returns" },
  { id: "low_stock", label: "Low Stock" },
];

const MATERIAL_FIELDS = [
  { name: "name", label: "Material name *", required: true },
  {
    name: "category",
    label: "Category",
    type: "select",
    options: MATERIAL_CATEGORIES.map((c) => ({ value: c.id, label: c.label })),
  },
  {
    name: "unit",
    label: "Unit",
    type: "select",
    options: MATERIAL_UNITS.map((u) => ({ value: u.id, label: u.label })),
  },
  { name: "currentStock", label: "Current stock", type: "number" },
  { name: "reorderLevel", label: "Reorder level", type: "number" },
];

function materialFormSections() {
  const pick = (...names) => MATERIAL_FIELDS.filter((f) => names.includes(f.name));
  return [
    { title: "Material details", fields: pick("name", "category", "unit") },
    { title: "Stock levels", fields: pick("currentStock", "reorderLevel") },
  ];
}

function inventorySparklineSvg(values = [], tone = "green") {
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

function renderInventoryTabBar(tabs, activeId, onSelect) {
  const wrap = document.createElement("div");
  wrap.className = "proj-tab-subnav inv-pill-tabs inv-pill-tabs--inventory-main";
  for (const t of tabs) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = `proj-tab inv-tab-pill inv-tab-pill--${t.id}${activeId === t.id ? " is-active" : ""}`;
    btn.textContent = t.label;
    btn.onclick = () => onSelect(t.id);
    wrap.appendChild(btn);
  }
  return wrap;
}

function wrapAsProjectsTable(dataTableEl) {
  const table = dataTableEl.querySelector("table");
  if (table) {
    table.classList.add("projects-table", "inventory-table");
  }
  dataTableEl.classList.add("projects-table-wrap");
  return dataTableEl;
}

function lowStockBadge(material) {
  if (!isLowStock(material)) return "";
  return '<span class="chip inv-low-badge">Low Stock</span>';
}

function projectName(projects, id) {
  if (!id) return "—";
  return projects.find((p) => p.id === id)?.name || id;
}

export function mountInventory(container) {
  setActiveNav();
  setPageChrome({
    title: "Inventory",
    subtitle: "Materials, stock in/out, ledger, and pending returns.",
    showDateRange: false,
    quickActionLabel: "",
    onQuickAction: null,
  });

  const root = document.createElement("div");
  root.className = "inventory-page dashboard-page dashboard-mockup";
  container.appendChild(root);

  const state = {
    materials: [],
    stockIn: [],
    stockOut: [],
    suppliers: [],
    workers: [],
    projects: [],
    activeTab: "materials",
    filterQuery: "",
    listPage: 1,
    listPageSize: 10,
    selectedMaterialId: "",
    ledgerFilters: {
      materialId: "all",
      projectId: "all",
      workerId: "all",
      dateFrom: "",
      dateTo: "",
    },
    mrsByProject: {},
    vouchersByProject: {},
  };

  let kpiHost = null;
  let tabHost = null;
  let contentHost = null;

  function getMaterial(id) {
    return state.materials.find((m) => m.id === id);
  }

  function filteredMaterials() {
    let list = [...state.materials].sort((a, b) => String(a.name).localeCompare(String(b.name)));
    const q = state.filterQuery.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (m) =>
          String(m.name || "").toLowerCase().includes(q) ||
          String(categoryLabel(m.category)).toLowerCase().includes(q)
      );
    }
    return list;
  }

  function openMaterialDialog(material = null) {
    const defaults = { category: "cement", unit: "bag", currentStock: 0, reorderLevel: 0, name: "" };
    openCustFormDialog({
      title: material ? "Edit material" : "Add material",
      subtitle: material
        ? "Update name, unit, category, and reorder levels."
        : "Register a material for stock in, issues, and ledger tracking.",
      sections: materialFormSections(),
      values: material ? { ...defaults, ...material } : defaults,
      submitLabel: material ? "Save changes" : "Save material",
      modalClass: "inv-material-modal",
      onSave: async (vals) => {
        const payload = {
          ...vals,
          currentStock: Number(vals.currentStock) || 0,
          reorderLevel: Number(vals.reorderLevel) || 0,
        };
        if (material?.id) {
          await updateMaterial(material.id, payload);
          showToast("Material updated");
        } else {
          await createMaterial(payload);
          showToast("Material added");
        }
        render();
      },
    });
  }

  function openStockInDialog() {
    openCustFormDialog({
      title: "Record stock in",
      subtitle: "Receive materials against supplier or GRN",
      modalClass: "inv-stock-modal",
      submitLabel: "Save stock in",
      values: {
        materialId: "",
        quantity: "",
        supplierId: "",
        invoiceRef: "",
        date: todayISO(),
        projectId: "",
        note: "",
      },
      sections: [
        {
          title: "Receipt",
          fields: [
            {
              name: "materialId",
              label: "Material *",
              type: "select",
              required: true,
              options: [
                { value: "", label: "Select material" },
                ...state.materials.map((m) => ({ value: m.id, label: m.name })),
              ],
            },
            { name: "quantity", label: "Quantity *", type: "number", step: "0.01", min: 0, required: true },
            {
              name: "supplierId",
              label: "Supplier",
              type: "select",
              options: [
                { value: "", label: "Optional" },
                ...state.suppliers.map((s) => ({ value: s.id, label: s.name })),
              ],
            },
          ],
        },
        {
          title: "Details",
          fields: [
            { name: "invoiceRef", label: "Invoice / GRN ref" },
            { name: "date", label: "Date", type: "date" },
            {
              name: "projectId",
              label: "Project",
              type: "select",
              options: [
                { value: "", label: "Optional" },
                ...state.projects.map((p) => ({ value: p.id, label: p.name })),
              ],
            },
            { name: "note", label: "Note", fullWidth: true },
          ],
        },
      ],
      onSave: async (vals) => {
        const material = getMaterial(vals.materialId);
        if (!material) {
          showToast("Select a material", "error");
          throw new Error("validation");
        }
        const supplier = state.suppliers.find((s) => s.id === vals.supplierId);
        try {
          await recordStockIn({
            materialId: material.id,
            materialName: material.name,
            quantity: vals.quantity,
            supplierId: supplier?.id || "",
            supplierName: supplier?.name || "",
            invoiceRef: vals.invoiceRef,
            date: vals.date,
            projectId: vals.projectId,
            note: vals.note,
          });
          showToast("Stock in recorded");
        } catch (err) {
          showToast(err.message, "error");
          throw err;
        }
      },
    });
  }

  function openStockOutDialog() {
    openCustFormDialog({
      title: "Issue stock out",
      subtitle: "Issue to workers and track returns",
      modalClass: "inv-stock-modal",
      submitLabel: "Issue stock",
      values: {
        materialId: "",
        quantity: "",
        workerId: "",
        projectId: "",
        issueDate: todayISO(),
        purpose: "",
        returnExpected: "",
        returnDate: "",
      },
      sections: [
        {
          title: "Issue",
          fields: [
            {
              name: "materialId",
              label: "Material *",
              type: "select",
              required: true,
              options: [
                { value: "", label: "Select material" },
                ...state.materials.map((m) => ({
                  value: m.id,
                  label: `${m.name} (${Number(m.currentStock) || 0} ${unitLabel(m.unit)})`,
                })),
              ],
            },
            { name: "quantity", label: "Quantity *", type: "number", step: "0.01", min: 0, required: true },
            {
              name: "workerId",
              label: "Worker *",
              type: "select",
              required: true,
              options: [
                { value: "", label: "Select worker" },
                ...state.workers.map((w) => ({
                  value: w.id,
                  label: `${w.name}${w.trade ? ` · ${w.trade}` : ""}`,
                })),
              ],
            },
          ],
        },
        {
          title: "Context",
          fields: [
            {
              name: "projectId",
              label: "Project",
              type: "select",
              options: [
                { value: "", label: "Optional" },
                ...state.projects.map((p) => ({ value: p.id, label: p.name })),
              ],
            },
            { name: "issueDate", label: "Issue date", type: "date" },
            { name: "purpose", label: "Purpose / work detail", fullWidth: true },
          ],
        },
        {
          title: "Return tracking",
          fields: [
            {
              name: "returnExpected",
              label: "Return tracking",
              type: "checkbox",
              checkboxLabel: "Return expected (tools / reusable items)",
            },
            {
              name: "returnDate",
              label: "Expected return date",
              type: "date",
              wrapperClass: "inv-modal-return-date",
              hidden: true,
            },
          ],
        },
      ],
      onReady: ({ form }) => {
        const toggle = form.querySelector('[name="returnExpected"]');
        const wrap = form.querySelector(".inv-modal-return-date");
        const sync = () => {
          if (wrap) wrap.hidden = !toggle?.checked;
        };
        toggle?.addEventListener("change", sync);
        sync();
      },
      onSave: async (vals) => {
        const material = getMaterial(vals.materialId);
        const worker = state.workers.find((w) => w.id === vals.workerId);
        if (!material || !worker) {
          showToast("Select material and worker", "error");
          throw new Error("validation");
        }
        const returnExpected = vals.returnExpected === "on";
        try {
          await recordStockOut({
            materialId: material.id,
            materialName: material.name,
            quantity: vals.quantity,
            workerId: worker.id,
            workerName: worker.name,
            workerRole: worker.trade || worker.designation || "",
            projectId: vals.projectId,
            issueDate: vals.issueDate,
            purpose: vals.purpose,
            returnExpected,
            returnDate: returnExpected ? vals.returnDate : "",
            returnStatus: returnExpected ? "not_returned" : "returned",
          });
          showToast("Stock issued");
        } catch (err) {
          showToast(err.message, "error");
          throw err;
        }
      },
    });
  }

  function ledgerActiveFilterCount() {
    const f = state.ledgerFilters;
    let n = 0;
    if (f.materialId && f.materialId !== "all") n++;
    if (f.projectId && f.projectId !== "all") n++;
    if (f.workerId && f.workerId !== "all") n++;
    if (f.dateFrom) n++;
    if (f.dateTo) n++;
    return n;
  }

  function openLedgerFilterDialog() {
    const f = state.ledgerFilters;
    openCustFormDialog({
      title: "Stock ledger filters",
      subtitle: "Filter movements by material, project, worker, and date",
      modalClass: "inv-stock-modal",
      submitLabel: "Apply filters",
      values: {
        materialId: f.materialId || "all",
        projectId: f.projectId || "all",
        workerId: f.workerId || "all",
        dateFrom: f.dateFrom || "",
        dateTo: f.dateTo || "",
      },
      sections: [
        {
          title: "Filters",
          fields: [
            {
              name: "materialId",
              label: "Material",
              type: "select",
              options: [
                { value: "all", label: "All materials" },
                ...state.materials.map((m) => ({ value: m.id, label: m.name })),
              ],
            },
            {
              name: "projectId",
              label: "Project",
              type: "select",
              options: [
                { value: "all", label: "All projects" },
                ...state.projects.map((p) => ({ value: p.id, label: p.name })),
              ],
            },
            {
              name: "workerId",
              label: "Worker",
              type: "select",
              options: [
                { value: "all", label: "All workers" },
                ...state.workers.map((w) => ({ value: w.id, label: w.name })),
              ],
            },
            { name: "dateFrom", label: "From date", type: "date" },
            { name: "dateTo", label: "To date", type: "date" },
          ],
        },
      ],
      onSave: async (vals) => {
        state.ledgerFilters = {
          materialId: vals.materialId || "all",
          projectId: vals.projectId || "all",
          workerId: vals.workerId || "all",
          dateFrom: vals.dateFrom || "",
          dateTo: vals.dateTo || "",
        };
        renderContent();
      },
    });
  }

  function computeKpiMetrics() {
    const low = listLowStock(state.materials);
    const pending = listPendingReturns(state.stockOut);
    const movements = state.stockIn.length + state.stockOut.length;
    return { total: state.materials.length, low: low.length, pending: pending.length, movements };
  }

  function renderKpiStrip() {
    if (!kpiHost) return;
    const { total, low, pending, movements } = computeKpiMetrics();

    const cards = [
      {
        label: "Materials",
        value: String(total),
        iconKey: "projects",
        tone: "blue",
        footLeft: total ? "Items in catalog" : "No materials yet",
        spark: inventorySparklineSvg([2, total || 1, total || 2, total || 3, 2, 2, 2], "blue"),
      },
      {
        label: "Low stock",
        value: String(low),
        iconKey: "expense",
        tone: low ? "red" : "green",
        footLeft: low ? "Below reorder level" : "All stocked",
        spark: inventorySparklineSvg([low || 1, low, low, 1, 1, 1, 1], low ? "red" : "green"),
      },
      {
        label: "Pending returns",
        value: String(pending),
        iconKey: "collection",
        tone: "orange",
        footLeft: pending ? "Awaiting return" : "None pending",
        spark: inventorySparklineSvg([pending || 1, pending, pending, 1, 1, 1, 1], "orange"),
      },
      {
        label: "Stock movements",
        value: String(movements),
        iconKey: "receivable",
        tone: "teal",
        footLeft: `${state.stockIn.length} in · ${state.stockOut.length} out`,
        spark: inventorySparklineSvg([2, movements ? 4 : 2, 3, movements ? 5 : 2, 3, 2, 2], "teal"),
      },
    ];

    kpiHost.className = "dash-kpi-row inv-kpi-host";
    kpiHost.innerHTML = cards
      .map(
        (c) => `<div class="dash-kpi-card card cust-kpi-card">
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

  function renderKpis() {
    renderKpiStrip();
  }

  function renderIssueHistoryPanel(materialId) {
    const panel = document.createElement("div");
    panel.className = "inv-issue-panel-inner";
    const material = getMaterial(materialId);
    if (!material) return panel;

    const history = materialIssueHistory(materialId, state.stockOut);
    panel.innerHTML = `
      <div class="inv-issue-head">
        <h4 class="sup-section-title">Issue history — ${escapeHtml(material.name)}</h4>
        <button type="button" class="btn btn-ghost btn-sm" id="inv-close-history">Close</button>
      </div>
    `;

    panel.appendChild(
      wrapAsProjectsTable(
        renderDataTable({
        columns: [
          { key: "issueDate", label: "Date" },
          { key: "workerName", label: "Worker" },
          { key: "quantity", label: "Qty", render: (r) => `${r.quantity} ${unitLabel(material.unit)}` },
          {
            key: "projectId",
            label: "Project",
            render: (r) => escapeHtml(projectName(state.projects, r.projectId)),
          },
          { key: "purpose", label: "Purpose" },
          {
            key: "returnStatus",
            label: "Return",
            render: (r) => (r.returnExpected ? statusChip(r.returnStatus || "not_returned") : statusChip("returned")),
          },
        ],
        rows: history,
        emptyMessage: "No issues recorded for this material",
      })
      )
    );

    panel.querySelector("#inv-close-history").onclick = () => {
      state.selectedMaterialId = "";
      renderContent();
    };
    return panel;
  }

  function renderMaterialsTab() {
    const wrap = document.createElement("div");
    wrap.className = "inv-tab-panel";

    const list = filteredMaterials();
    const page = paginateSlice(list, state.listPage, state.listPageSize);
    if (page.page !== state.listPage) state.listPage = page.page;

    const section = document.createElement("section");
    section.className = "dash-widget dash-widget--projects card inv-report-block";
    section.innerHTML = `
      <div class="dash-widget-head dash-widget-head--split">
        <div>
          <h3 class="dash-widget-title">Material list</h3>
          <p class="dash-widget-sub">Catalog, stock levels, and reorder alerts</p>
        </div>
        <span class="cust-toolbar-count">Showing ${page.total} material${page.total === 1 ? "" : "s"}</span>
      </div>
      <div class="dash-widget-body">
        <div class="toolbar-row projects-toolbar inventory-toolbar" id="inv-list-toolbar">
          <div class="toolbar-actions" style="width:100%;justify-content:flex-end;">
            <div class="cust-toolbar-search toolbar-search">
              <span class="search-icon" aria-hidden="true">${icon("search", { size: 18 })}</span>
              <input type="search" class="cust-toolbar-search-input" id="inv-list-search" placeholder="Search materials..." autocomplete="off" value="${escapeHtml(state.filterQuery)}" />
            </div>
            <div class="cust-toolbar-btn-group">
              <button type="button" class="btn btn-ghost btn-sm cust-toolbar-btn cust-toolbar-btn--clear" id="inv-clear-search" title="Clear search">${icon("rotateCcw", { size: 16 })} Clear</button>
              <button type="button" class="btn btn-primary btn-sm" id="inv-add-material">+ Add material</button>
            </div>
          </div>
        </div>
        <div class="inv-materials-content-host"></div>
      </div>
    `;

    const contentHostEl = section.querySelector(".inv-materials-content-host");

    if (!page.items.length) {
      const empty = document.createElement("p");
      empty.className = "proj-empty";
      empty.textContent = state.materials.length ? "No materials match your search" : "No materials yet — add your first item.";
      contentHostEl.appendChild(empty);
    } else {
      const desktop = document.createElement("div");
      desktop.className = "table-wrap projects-table-wrap";
      desktop.innerHTML = `
        <table class="dash-table projects-table inventory-table">
          <thead>
            <tr>
              <th>Name</th><th>Category</th><th>Unit</th><th class="cust-col-center">Stock</th><th class="cust-col-center">Reorder</th><th class="cust-col-center">Status</th><th class="cust-col-center">Action</th>
            </tr>
          </thead>
          <tbody>
            ${page.items
              .map(
                (m) => `<tr class="inv-material-row${state.selectedMaterialId === m.id ? " is-selected" : ""}" data-id="${escapeHtml(m.id)}">
              <td><strong>${escapeHtml(m.name)}</strong> ${lowStockBadge(m)}</td>
              <td>${escapeHtml(categoryLabel(m.category))}</td>
              <td>${escapeHtml(unitLabel(m.unit))}</td>
              <td class="cust-col-center">${Number(m.currentStock) || 0}</td>
              <td class="cust-col-center">${Number(m.reorderLevel) || 0}</td>
              <td class="cust-col-center">${statusChip(m.status || "active")}</td>
              <td class="cust-col-center proj-row-actions-cell">
                <button type="button" class="btn btn-ghost btn-sm inv-edit-material" data-id="${escapeHtml(m.id)}">Edit</button>
              </td>
            </tr>`
              )
              .join("")}
          </tbody>
        </table>
      `;
      contentHostEl.appendChild(desktop);
      contentHostEl.appendChild(
        renderPagination({
          page: page.page,
          pageSize: page.pageSize,
          total: page.total,
          showInfo: false,
          onPage: (p) => {
            state.listPage = p;
            renderContent();
          },
        })
      );
    }

    wrap.appendChild(section);

    if (state.selectedMaterialId) {
      const histSection = document.createElement("section");
      histSection.className = "dash-widget dash-widget--projects card inv-report-block inv-issue-panel";
      const body = document.createElement("div");
      body.className = "dash-widget-body";
      body.appendChild(renderIssueHistoryPanel(state.selectedMaterialId));
      histSection.appendChild(body);
      wrap.appendChild(histSection);
    }

    const toolbar = section.querySelector("#inv-list-toolbar");
    toolbar.querySelector("#inv-list-search").oninput = (e) => {
      state.filterQuery = e.target.value;
      state.listPage = 1;
      renderContent();
    };
    toolbar.querySelector("#inv-clear-search").onclick = () => {
      state.filterQuery = "";
      state.listPage = 1;
      renderContent();
    };
    toolbar.querySelector("#inv-add-material").onclick = () => openMaterialDialog();

    section.querySelectorAll(".inv-edit-material").forEach((btn) => {
      btn.onclick = (e) => {
        e.stopPropagation();
        const m = getMaterial(btn.dataset.id);
        if (m) openMaterialDialog(m);
      };
    });
    section.querySelectorAll(".inv-material-row").forEach((row) => {
      row.onclick = (e) => {
        if (e.target.closest(".inv-edit-material")) return;
        state.selectedMaterialId = row.dataset.id;
        renderContent();
      };
    });

    return wrap;
  }

  function renderStockInTab() {
    const wrap = document.createElement("div");
    wrap.className = "inv-tab-panel";

    const history = [...state.stockIn].sort((a, b) => String(b.date).localeCompare(String(a.date)));
    const histSection = document.createElement("section");
    histSection.className = "dash-widget dash-widget--projects card inv-report-block";
    histSection.innerHTML = `
      <div class="dash-widget-head dash-widget-head--split">
        <div>
          <h3 class="dash-widget-title">Stock in history</h3>
          <p class="dash-widget-sub">Recorded receipts and GRN references</p>
        </div>
        <button type="button" class="btn btn-primary btn-sm" id="inv-open-stock-in">+ Record stock in</button>
      </div>
      <div class="dash-widget-body"></div>
    `;
    histSection.querySelector(".dash-widget-body").appendChild(
      wrapAsProjectsTable(
        renderDataTable({
          columns: [
            { key: "date", label: "Date" },
            { key: "materialName", label: "Material" },
            { key: "quantity", label: "Qty" },
            { key: "supplierName", label: "Supplier" },
            { key: "invoiceRef", label: "Ref" },
            {
              key: "grnId",
              label: "GRN",
              render: (r) => (r.grnId ? `<span class="central-grn-badge">${escapeHtml(r.grnId)}</span>` : "—"),
            },
            { key: "receivedBy", label: "Received by" },
            {
              key: "projectId",
              label: "Project",
              render: (r) => escapeHtml(projectName(state.projects, r.projectId)),
            },
            { key: "note", label: "Note" },
          ],
          rows: history.slice(0, 50),
          emptyMessage: "No stock in records yet",
        })
      )
    );
    histSection.querySelector("#inv-open-stock-in").onclick = () => openStockInDialog();
    wrap.appendChild(histSection);
    return wrap;
  }

  function renderStockOutTab() {
    const wrap = document.createElement("div");
    wrap.className = "inv-tab-panel";

    const history = [...state.stockOut].sort((a, b) => String(b.issueDate).localeCompare(String(a.issueDate)));
    const histSection = document.createElement("section");
    histSection.className = "dash-widget dash-widget--projects card inv-report-block";
    histSection.innerHTML = `
      <div class="dash-widget-head dash-widget-head--split">
        <div>
          <h3 class="dash-widget-title">Recent issues</h3>
          <p class="dash-widget-sub">Stock issued to workers and sites</p>
        </div>
        <button type="button" class="btn btn-primary btn-sm" id="inv-open-stock-out">+ Issue stock</button>
      </div>
      <div class="dash-widget-body"></div>
    `;
    histSection.querySelector(".dash-widget-body").appendChild(
      wrapAsProjectsTable(
        renderDataTable({
          columns: [
            { key: "issueDate", label: "Date" },
            { key: "materialName", label: "Material" },
            { key: "quantity", label: "Qty" },
            { key: "workerName", label: "Worker" },
            {
              key: "projectId",
              label: "Project",
              render: (r) => escapeHtml(projectName(state.projects, r.projectId)),
            },
            { key: "purpose", label: "Purpose" },
            {
              key: "returnStatus",
              label: "Return",
              render: (r) => (r.returnExpected ? statusChip(r.returnStatus || "not_returned") : statusChip("returned")),
            },
          ],
          rows: history.slice(0, 50),
          emptyMessage: "No stock out records yet",
        })
      )
    );
    histSection.querySelector("#inv-open-stock-out").onclick = () => openStockOutDialog();
    wrap.appendChild(histSection);
    return wrap;
  }

  function parseNestedByProject(root) {
    const out = {};
    if (!root || typeof root !== "object") return out;
    for (const [pid, bucket] of Object.entries(root)) {
      if (!bucket || typeof bucket !== "object") continue;
      out[pid] = Object.entries(bucket).map(([id, row]) => ({ id, ...row, projectId: pid }));
    }
    return out;
  }

  function renderCentralLedgerTab() {
    const wrap = document.createElement("div");
    wrap.className = "inv-tab-panel";
    const rows = rollupCentralLedger(state.stockIn, state.stockOut, state.materials);
    const section = document.createElement("section");
    section.className = "dash-widget dash-widget--projects card inv-report-block";
    section.innerHTML = `
      <div class="dash-widget-head dash-widget-head--split">
        <div>
          <h3 class="dash-widget-title">Central stock ledger</h3>
          <p class="dash-widget-sub">Company-wide qty in, out, and balance</p>
        </div>
      </div>
      <div class="dash-widget-body"></div>
    `;
    section.querySelector(".dash-widget-body").appendChild(
      wrapAsProjectsTable(
        renderDataTable({
          columns: [
            { key: "materialName", label: "Material" },
            { key: "qtyIn", label: "Qty in" },
            { key: "qtyOut", label: "Qty out" },
            {
              key: "runningBalance",
              label: "Balance",
              render: (r) => `<span class="stock-ledger-balance">${r.runningBalance}</span> ${escapeHtml(r.unit || "")}`,
            },
            { key: "lastUpdated", label: "Last updated" },
          ],
          rows,
          emptyMessage: "No central stock data",
        })
      )
    );
    wrap.appendChild(section);
    return wrap;
  }

  function renderIssueVouchersTab() {
    const wrap = document.createElement("div");
    wrap.className = "inv-tab-panel";
    const pending = listPendingCentralRequisitions(state.mrsByProject);
    const submittedCentral = Object.values(state.mrsByProject)
      .flat()
      .filter((mr) => mr.requestType === "central" && mr.status === "submitted");
    const canIssue = canPerformAction("issue_site_voucher");
    const canApprove = canPerformAction("approve_central_requisition") || canPerformAction("approve");

    if (submittedCentral.length) {
      const subSection = document.createElement("section");
      subSection.className = "dash-widget dash-widget--projects card inv-report-block issue-voucher-card";
      subSection.innerHTML = `
        <div class="dash-widget-head">
          <h3 class="dash-widget-title">Submitted central requisitions</h3>
          <p class="dash-widget-sub">${submittedCentral.length} awaiting approval</p>
        </div>
        <div class="dash-widget-body">
        <table class="dash-table projects-table"><thead><tr><th>Project</th><th>Title</th><th>Qty</th><th class="cust-col-center">Action</th></tr></thead><tbody>${submittedCentral
          .map((mr) => {
            const proj = state.projects.find((p) => p.id === mr.projectId);
            const btn = canApprove
              ? `<button type="button" class="btn btn-primary btn-sm inv-approve-mr" data-pid="${escapeHtml(mr.projectId)}" data-mid="${escapeHtml(mr.id)}">Approve</button>`
              : "—";
            return `<tr><td>${escapeHtml(proj?.name || mr.projectId)}</td><td>${escapeHtml(mr.title)}</td><td>${mr.qty}</td><td class="cust-col-center">${btn}</td></tr>`;
          })
          .join("")}</tbody></table>
        </div>`;
      wrap.appendChild(subSection);
      subSection.querySelectorAll(".inv-approve-mr").forEach((btn) => {
        btn.onclick = async () => {
          try {
            await approveMaterialRequest(btn.dataset.pid, btn.dataset.mid);
            showToast("Central requisition approved");
          } catch (err) {
            showToast(err.message, "error");
          }
        };
      });
    }

    const pendingSection = document.createElement("section");
    pendingSection.className = "dash-widget dash-widget--projects card inv-report-block issue-voucher-card";
    pendingSection.innerHTML = `
      <div class="dash-widget-head dash-widget-head--split">
        <div>
          <h3 class="dash-widget-title">Issue vouchers</h3>
          <p class="dash-widget-sub">${submittedCentral.length} to approve · ${pending.length} to issue</p>
        </div>
      </div>
      <div class="dash-widget-body">
        <h4 class="sup-section-title">Pending central requisitions</h4>
        <div class="inv-pending-mr-host"></div>
      </div>
    `;
    const pendingHost = pendingSection.querySelector(".inv-pending-mr-host");
    if (!pending.length) {
      pendingHost.innerHTML = `<p class="proj-empty">No approved central requisitions pending issue.</p>`;
    } else {
      pendingHost.innerHTML = `<table class="dash-table projects-table"><thead><tr><th>Project</th><th>Title</th><th>Qty</th><th>Material</th><th class="cust-col-center">Action</th></tr></thead><tbody>${pending
        .map((mr) => {
          const mat = state.materials.find((m) => m.id === mr.inventoryMaterialId);
          const proj = state.projects.find((p) => p.id === mr.projectId);
          const issueBtn = canIssue
            ? `<button type="button" class="btn btn-primary btn-sm inv-issue-btn" data-pid="${escapeHtml(mr.projectId)}" data-mid="${escapeHtml(mr.id)}">Issue voucher</button>`
            : "—";
          return `<tr>
            <td>${escapeHtml(proj?.name || mr.projectId)}</td>
            <td>${escapeHtml(mr.title)}</td>
            <td>${mr.qty}</td>
            <td>${escapeHtml(mat?.name || mr.inventoryMaterialId || "—")}</td>
            <td class="cust-col-center">${issueBtn}</td>
          </tr>`;
        })
        .join("")}</tbody></table>`;
    }
    wrap.appendChild(pendingSection);

    pendingSection.querySelectorAll(".inv-issue-btn").forEach((btn) => {
      btn.onclick = async () => {
        try {
          await createIssueVoucherFromRequisition(btn.dataset.pid, btn.dataset.mid, {
            issuedBy: getCurrentUserId(),
          });
          showToast("Issue voucher created — central stock reduced");
        } catch (err) {
          showToast(err.message, "error");
        }
      };
    });

    const allVouchers = Object.values(state.vouchersByProject).flat();
    const histSection = document.createElement("section");
    histSection.className = "dash-widget dash-widget--projects card inv-report-block";
    histSection.innerHTML = `
      <div class="dash-widget-head">
        <h3 class="dash-widget-title">Issued vouchers</h3>
      </div>
      <div class="dash-widget-body"></div>
    `;
    histSection.querySelector(".dash-widget-body").appendChild(
      wrapAsProjectsTable(
        renderDataTable({
          columns: [
            { key: "voucherNo", label: "Voucher" },
            { key: "issueDate", label: "Date" },
            { key: "materialName", label: "Material" },
            { key: "qtyIssued", label: "Qty" },
            {
              key: "projectId",
              label: "Project",
              render: (r) => escapeHtml(projectName(state.projects, r.projectId)),
            },
            { key: "receivedByName", label: "Received by" },
            { key: "status", label: "Status", render: (r) => statusChip(r.status) },
          ],
          rows: allVouchers.sort((a, b) => (b.issueDate || "").localeCompare(a.issueDate || "")).slice(0, 50),
          emptyMessage: "No issue vouchers yet",
        })
      )
    );
    wrap.appendChild(histSection);
    return wrap;
  }

  function renderLedgerTab() {
    const wrap = document.createElement("div");
    wrap.className = "inv-tab-panel";

    const activeFilters = ledgerActiveFilterCount();
    const ledger = buildStockLedger(state.stockIn, state.stockOut, state.ledgerFilters);
    const ledgerSection = document.createElement("section");
    ledgerSection.className = "dash-widget dash-widget--projects card inv-report-block";
    ledgerSection.innerHTML = `
      <div class="dash-widget-head dash-widget-head--split">
        <div>
          <h3 class="dash-widget-title">Ledger entries</h3>
          <p class="dash-widget-sub">Stock in and out movements with running balance</p>
        </div>
        <div class="cust-toolbar-btn-group">
          ${activeFilters ? `<span class="chip inv-low-badge">${activeFilters} filter${activeFilters === 1 ? "" : "s"} active</span>` : ""}
          <button type="button" class="btn btn-ghost btn-sm cust-toolbar-btn" id="inv-open-ledger-filters">Filters</button>
        </div>
      </div>
      <div class="dash-widget-body"></div>
    `;
    ledgerSection.querySelector(".dash-widget-body").appendChild(
      wrapAsProjectsTable(
        renderDataTable({
          columns: [
            { key: "date", label: "Date" },
            {
              key: "type",
              label: "Type",
              render: (r) => statusChip(r.type === "in" ? "approved" : "submitted"),
            },
            { key: "materialName", label: "Material" },
            {
              key: "qty",
              label: "Qty",
              render: (r) => `${r.type === "in" ? "+" : "−"}${r.qty}`,
            },
            { key: "person", label: "Supplier / Worker" },
            {
              key: "projectId",
              label: "Project",
              render: (r) => escapeHtml(projectName(state.projects, r.projectId)),
            },
            { key: "note", label: "Note" },
            { key: "balance", label: "Balance", render: (r) => String(r.balance) },
          ],
          rows: ledger,
          emptyMessage: "No ledger entries for selected filters",
        })
      )
    );
    ledgerSection.querySelector("#inv-open-ledger-filters").onclick = () => openLedgerFilterDialog();
    wrap.appendChild(ledgerSection);
    return wrap;
  }

  function renderPendingReturnsTab() {
    const wrap = document.createElement("div");
    wrap.className = "inv-tab-panel";

    const pending = listPendingReturns(state.stockOut);
    const section = document.createElement("section");
    section.className = "dash-widget dash-widget--projects card inv-report-block";
    section.innerHTML = `
      <div class="dash-widget-head dash-widget-head--split">
        <div>
          <h3 class="dash-widget-title">Pending returns</h3>
          <p class="dash-widget-sub">Tools and reusable items awaiting return</p>
        </div>
        <span class="cust-toolbar-count">${pending.length} item${pending.length === 1 ? "" : "s"} awaiting return</span>
      </div>
      <div class="dash-widget-body">
        <div class="table-wrap projects-table-wrap">
          <table class="dash-table projects-table inventory-table">
            <thead>
              <tr>
                <th>Material</th><th>Worker</th><th class="text-right">Qty</th><th>Issued</th><th>Days</th><th>Project</th><th class="cust-col-center">Action</th>
              </tr>
            </thead>
            <tbody>
              ${
                pending.length
                  ? pending
                      .map(
                        (r) => `<tr class="${r.daysPending > 30 ? "inv-row-warn" : ""}">
                <td>${escapeHtml(r.materialName)}</td>
                <td>${escapeHtml(r.workerName || "—")}</td>
                <td class="text-right">${Number(r.quantity) || 0}</td>
                <td>${escapeHtml(r.issueDate || "—")}</td>
                <td>${r.daysPending}</td>
                <td>${escapeHtml(projectName(state.projects, r.projectId))}</td>
                <td class="cust-col-center proj-row-actions-cell">
                  <button type="button" class="btn btn-ghost btn-sm inv-mark-returned" data-id="${escapeHtml(r.id)}">Returned</button>
                  <button type="button" class="btn btn-ghost btn-sm inv-mark-damaged" data-id="${escapeHtml(r.id)}">Damaged</button>
                </td>
              </tr>`
                      )
                      .join("")
                  : '<tr class="empty-row"><td colspan="7">No pending returns</td></tr>'
              }
            </tbody>
          </table>
        </div>
      </div>
    `;
    wrap.appendChild(section);

    section.querySelectorAll(".inv-mark-returned").forEach((btn) => {
      btn.onclick = async () => {
        try {
          await updateStockOutReturn(btn.dataset.id, "returned");
          showToast("Marked as returned");
        } catch (err) {
          showToast(err.message, "error");
        }
      };
    });
    section.querySelectorAll(".inv-mark-damaged").forEach((btn) => {
      btn.onclick = async () => {
        try {
          await updateStockOutReturn(btn.dataset.id, "damaged");
          showToast("Marked as damaged");
        } catch (err) {
          showToast(err.message, "error");
        }
      };
    });

    return wrap;
  }

  function renderLowStockTab() {
    const wrap = document.createElement("div");
    wrap.className = "inv-tab-panel";
    const low = listLowStock(state.materials);

    const section = document.createElement("section");
    section.className = "dash-widget dash-widget--projects card inv-report-block";
    section.innerHTML = `
      <div class="dash-widget-head dash-widget-head--split">
        <div>
          <h3 class="dash-widget-title">Low stock alerts</h3>
          <p class="dash-widget-sub">Materials at or below reorder level</p>
        </div>
        ${
          low.length
            ? `<span class="chip inv-low-badge">${low.length} alert${low.length === 1 ? "" : "s"}</span>`
            : `<span class="cust-toolbar-count">All materials above reorder level</span>`
        }
      </div>
      <div class="dash-widget-body inv-low-stock-table-host"></div>
    `;

    const tableEl = wrapAsProjectsTable(
      renderDataTable({
        columns: [
          { key: "name", label: "Material" },
          {
            key: "category",
            label: "Category",
            render: (r) => escapeHtml(categoryLabel(r.category)),
          },
          {
            key: "currentStock",
            label: "Current",
            render: (r) => `${Number(r.currentStock) || 0} ${unitLabel(r.unit)}`,
          },
          {
            key: "reorderLevel",
            label: "Reorder at",
            render: (r) => `${Number(r.reorderLevel) || 0} ${unitLabel(r.unit)}`,
          },
          {
            key: "shortfall",
            label: "Shortfall",
            render: (r) => {
              const gap = (Number(r.reorderLevel) || 0) - (Number(r.currentStock) || 0);
              return `<span class="chip inv-low-badge">${gap > 0 ? gap : 0} ${unitLabel(r.unit)}</span>`;
            },
          },
        ],
        rows: low,
        emptyMessage: "No low stock items — inventory levels are healthy",
        rowActions: (r) =>
          `<button type="button" class="btn btn-ghost btn-sm inv-restock" data-id="${escapeHtml(r.id)}">Stock in</button>`,
      })
    );
    section.querySelector(".inv-low-stock-table-host").appendChild(tableEl);
    wrap.appendChild(section);

    section.querySelectorAll(".inv-restock").forEach((btn) => {
      btn.onclick = () => openStockInDialog();
    });

    return wrap;
  }

  function renderTabs() {
    if (!tabHost) return;
    tabHost.innerHTML = "";
    tabHost.appendChild(
      renderInventoryTabBar(TABS, state.activeTab, (tab) => {
        state.activeTab = tab;
        state.listPage = 1;
        if (tab !== "materials") state.selectedMaterialId = "";
        renderKpiStrip();
        renderTabs();
        renderContent();
      })
    );
  }

  function renderContent() {
    if (!contentHost) return;
    contentHost.innerHTML = "";
    if (state.activeTab === "materials") contentHost.appendChild(renderMaterialsTab());
    else if (state.activeTab === "stock_in") contentHost.appendChild(renderStockInTab());
    else if (state.activeTab === "stock_out") contentHost.appendChild(renderStockOutTab());
    else if (state.activeTab === "central_ledger") contentHost.appendChild(renderCentralLedgerTab());
    else if (state.activeTab === "issue_vouchers") contentHost.appendChild(renderIssueVouchersTab());
    else if (state.activeTab === "ledger") contentHost.appendChild(renderLedgerTab());
    else if (state.activeTab === "pending_returns") contentHost.appendChild(renderPendingReturnsTab());
    else contentHost.appendChild(renderLowStockTab());
  }

  function render() {
    renderKpiStrip();
    renderTabs();
    renderContent();
  }

  function ensureLayout() {
    root.innerHTML = `
      <div id="inv-metrics" class="inv-kpi-host"></div>
      <div class="inv-tab-host"></div>
      <div class="inv-content-host"></div>
    `;
    kpiHost = root.querySelector("#inv-metrics");
    tabHost = root.querySelector(".inv-tab-host");
    contentHost = root.querySelector(".inv-content-host");
  }

  ensureLayout();
  render();

  const unsubs = [
    listenList("inventoryMaterials", (list) => {
      state.materials = list;
      render();
    }),
    listenList("inventoryStockIn", (list) => {
      state.stockIn = list;
      if (state.activeTab === "stock_in" || state.activeTab === "ledger") renderContent();
      else renderKpis();
    }),
    listenList("inventoryStockOut", (list) => {
      state.stockOut = list;
      if (["stock_out", "ledger", "pending_returns"].includes(state.activeTab) || state.selectedMaterialId) renderContent();
      else renderKpis();
    }),
    listenList("suppliers", (list) => {
      state.suppliers = list.sort((a, b) => String(a.name).localeCompare(String(b.name)));
      if (state.activeTab === "stock_in") renderContent();
    }),
    listenList("workers", (list) => {
      state.workers = list.sort((a, b) => String(a.name).localeCompare(String(b.name)));
      if (state.activeTab === "stock_out" || state.activeTab === "ledger") renderContent();
    }),
    listenList("projects", (list) => {
      state.projects = list;
      renderContent();
    }),
    listenValue("materialRequests", (root) => {
      state.mrsByProject = parseNestedByProject(root);
      if (state.activeTab === "issue_vouchers") renderContent();
    }),
    listenValue("issueVouchers", (root) => {
      state.vouchersByProject = parseNestedByProject(root);
      if (state.activeTab === "issue_vouchers") renderContent();
    }),
  ];

  return {
    unmount: () => unsubs.forEach((fn) => fn()),
  };
}
