import { listenList, listenValue } from "./svc_data.js";
import { formatBDT } from "./util_format.js";
import { showToast } from "./cmp_toast.js";
import { setActiveNav } from "./cmp_layout.js";
import { setPageChrome } from "./cmp_header.js";
import { openEditDialog, renderDataTable } from "./cmp_projectTab.js";
import {
  renderModulePillTabBar,
  renderModuleToolbar,
  renderModuleStatCards,
  renderPagination,
  statusChip,
  escapeHtml,
} from "./cmp_moduleHub.js";
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
  root.className = "inventory-page dashboard-page";
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
  let tabBarHost = null;
  let contentHost = null;
  let paginationHost = null;

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
    openEditDialog(
      material ? "Edit material" : "Add material",
      MATERIAL_FIELDS,
      material || { category: "cement", unit: "bag", currentStock: 0, reorderLevel: 0 },
      async (vals) => {
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
      }
    );
  }

  function renderKpis() {
    if (!kpiHost) return;
    kpiHost.innerHTML = "";
    const low = listLowStock(state.materials);
    const pending = listPendingReturns(state.stockOut);
    kpiHost.appendChild(
      renderModuleStatCards([
        { label: "Materials", value: state.materials.length, icon: "package", iconCls: "mod-stat-icon--blue" },
        {
          label: "Low stock",
          value: low.length,
          sub: low.length ? "Below reorder level" : "All stocked",
          icon: "alertTriangle",
          iconCls: "mod-stat-icon--red",
          valueCls: low.length ? "mod-stat-value--red" : "",
        },
        {
          label: "Pending returns",
          value: pending.length,
          sub: pending.length ? "Awaiting return" : "None pending",
          icon: "clock",
          iconCls: "mod-stat-icon--amber",
          valueCls: pending.length ? "mod-stat-value--amber" : "",
        },
        {
          label: "Stock movements",
          value: state.stockIn.length + state.stockOut.length,
          sub: `${state.stockIn.length} in · ${state.stockOut.length} out`,
          icon: "activity",
          iconCls: "mod-stat-icon--blue",
        },
      ])
    );
  }

  function renderIssueHistoryPanel(materialId) {
    const panel = document.createElement("div");
    panel.className = "card card-pad inv-issue-panel";
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
    );

    panel.querySelector("#inv-close-history").onclick = () => {
      state.selectedMaterialId = "";
      renderContent();
    };
    return panel;
  }

  function renderMaterialsTab() {
    const wrap = document.createElement("div");
    wrap.className = "inv-tab-panel mod-tab-panel";

    const toolbar = renderModuleToolbar({
      title: "Material list",
      searchPlaceholder: "Search materials...",
      searchValue: state.filterQuery,
      actionsHtml: '<button type="button" class="btn btn-primary btn-sm" id="inv-add-material">+ Add material</button>',
    });
    wrap.appendChild(toolbar);

    const list = filteredMaterials();
    const page = paginateSlice(list, state.listPage, state.listPageSize);
    if (page.page !== state.listPage) state.listPage = page.page;

    const tableWrap = document.createElement("div");
    tableWrap.className = "table-wrap";
    tableWrap.innerHTML = `
      <table class="dash-table inv-material-table">
        <thead>
          <tr>
            <th>Name</th>
            <th>Category</th>
            <th>Unit</th>
            <th class="text-right">Stock</th>
            <th class="text-right">Reorder</th>
            <th>Status</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          ${
            page.items.length
              ? page.items
                  .map(
                    (m) => `<tr class="inv-material-row${state.selectedMaterialId === m.id ? " is-selected" : ""}" data-id="${escapeHtml(m.id)}">
                <td><strong>${escapeHtml(m.name)}</strong> ${lowStockBadge(m)}</td>
                <td>${escapeHtml(categoryLabel(m.category))}</td>
                <td>${escapeHtml(unitLabel(m.unit))}</td>
                <td class="text-right">${Number(m.currentStock) || 0}</td>
                <td class="text-right">${Number(m.reorderLevel) || 0}</td>
                <td>${statusChip(m.status || "active")}</td>
                <td class="proj-row-actions-cell">
                  <button type="button" class="btn btn-ghost btn-sm inv-edit-material" data-id="${escapeHtml(m.id)}">Edit</button>
                </td>
              </tr>`
                  )
                  .join("")
              : '<tr class="empty-row"><td colspan="7">No materials yet — add your first item.</td></tr>'
          }
        </tbody>
      </table>
    `;
    wrap.appendChild(tableWrap);

    if (paginationHost) {
      paginationHost.innerHTML = "";
      paginationHost.appendChild(
        renderPagination({
          page: page.page,
          pageSize: page.pageSize,
          total: page.total,
          onPage: (p) => {
            state.listPage = p;
            renderContent();
          },
        })
      );
    }

    if (state.selectedMaterialId) {
      wrap.appendChild(renderIssueHistoryPanel(state.selectedMaterialId));
    }

    toolbar.querySelector(".mod-search-input").oninput = (e) => {
      state.filterQuery = e.target.value;
      state.listPage = 1;
      renderContent();
    };
    toolbar.querySelector("#inv-add-material").onclick = () => openMaterialDialog();
    tableWrap.querySelectorAll(".inv-edit-material").forEach((btn) => {
      btn.onclick = (e) => {
        e.stopPropagation();
        const m = getMaterial(btn.dataset.id);
        if (m) openMaterialDialog(m);
      };
    });
    tableWrap.querySelectorAll(".inv-material-row").forEach((row) => {
      row.onclick = () => {
        state.selectedMaterialId = row.dataset.id;
        renderContent();
      };
    });

    return wrap;
  }

  function renderStockInTab() {
    const wrap = document.createElement("div");
    wrap.className = "inv-tab-panel mod-tab-panel";

    const formCard = document.createElement("div");
    formCard.className = "card card-pad";
    formCard.innerHTML = `<h4 class="sup-section-title">Record stock in</h4>`;
    const form = document.createElement("form");
    form.className = "form-grid proj-form";
    form.innerHTML = `
      <select name="materialId" required>
        <option value="">Material *</option>
        ${state.materials.map((m) => `<option value="${escapeHtml(m.id)}">${escapeHtml(m.name)}</option>`).join("")}
      </select>
      <input name="quantity" type="number" step="0.01" min="0" placeholder="Quantity *" required />
      <select name="supplierId">
        <option value="">Supplier</option>
        ${state.suppliers.map((s) => `<option value="${escapeHtml(s.id)}">${escapeHtml(s.name)}</option>`).join("")}
      </select>
      <input name="invoiceRef" placeholder="Invoice / GRN ref" />
      <input name="date" type="date" value="${todayISO()}" />
      <select name="projectId">
        <option value="">Project</option>
        ${state.projects.map((p) => `<option value="${escapeHtml(p.id)}">${escapeHtml(p.name)}</option>`).join("")}
      </select>
      <input name="note" placeholder="Note" class="form-field--full" />
      <div class="form-actions form-field--full">
        <button type="submit" class="btn btn-primary btn-sm">Save stock in</button>
      </div>
    `;
    form.onsubmit = async (e) => {
      e.preventDefault();
      const fd = new FormData(form);
      const material = getMaterial(fd.get("materialId"));
      if (!material) {
        showToast("Select a material", "error");
        return;
      }
      const supplier = state.suppliers.find((s) => s.id === fd.get("supplierId"));
      try {
        await recordStockIn({
          materialId: material.id,
          materialName: material.name,
          quantity: fd.get("quantity"),
          supplierId: supplier?.id || "",
          supplierName: supplier?.name || "",
          invoiceRef: fd.get("invoiceRef"),
          date: fd.get("date"),
          projectId: fd.get("projectId"),
          note: fd.get("note"),
        });
        form.reset();
        form.querySelector('[name="date"]').value = todayISO();
        showToast("Stock in recorded");
      } catch (err) {
        showToast(err.message, "error");
      }
    };
    formCard.appendChild(form);
    wrap.appendChild(formCard);

    const history = [...state.stockIn].sort((a, b) => String(b.date).localeCompare(String(a.date)));
    const historyCard = document.createElement("div");
    historyCard.className = "card card-pad";
    historyCard.innerHTML = `<h4 class="sup-section-title">Stock in history</h4>`;
    historyCard.appendChild(
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
    );
    wrap.appendChild(historyCard);
    return wrap;
  }

  function renderStockOutTab() {
    const wrap = document.createElement("div");
    wrap.className = "inv-tab-panel mod-tab-panel";

    const formCard = document.createElement("div");
    formCard.className = "card card-pad";
    formCard.innerHTML = `<h4 class="sup-section-title">Issue stock out</h4>`;
    const form = document.createElement("form");
    form.className = "form-grid proj-form";
    form.innerHTML = `
      <select name="materialId" required>
        <option value="">Material *</option>
        ${state.materials.map((m) => `<option value="${escapeHtml(m.id)}">${escapeHtml(m.name)} (${Number(m.currentStock) || 0} ${unitLabel(m.unit)})</option>`).join("")}
      </select>
      <input name="quantity" type="number" step="0.01" min="0" placeholder="Quantity *" required />
      <select name="workerId" required>
        <option value="">Worker *</option>
        ${state.workers.map((w) => `<option value="${escapeHtml(w.id)}">${escapeHtml(w.name)}${w.trade ? ` · ${escapeHtml(w.trade)}` : ""}</option>`).join("")}
      </select>
      <select name="projectId">
        <option value="">Project</option>
        ${state.projects.map((p) => `<option value="${escapeHtml(p.id)}">${escapeHtml(p.name)}</option>`).join("")}
      </select>
      <input name="issueDate" type="date" value="${todayISO()}" />
      <input name="purpose" placeholder="Purpose / work detail" class="form-field--full" />
      <label class="form-field form-field--full inv-return-toggle">
        <input type="checkbox" name="returnExpected" id="inv-return-expected" /> Return expected (tools / reusable items)
      </label>
      <div class="inv-return-fields form-field--full" id="inv-return-fields" hidden>
        <input name="returnDate" type="date" placeholder="Expected return date" />
        <select name="returnStatus">
          <option value="not_returned">Not returned</option>
        </select>
      </div>
      <div class="form-actions form-field--full">
        <button type="submit" class="btn btn-primary btn-sm">Issue stock</button>
      </div>
    `;

    const returnToggle = form.querySelector("#inv-return-expected");
    const returnFields = form.querySelector("#inv-return-fields");
    returnToggle.onchange = () => {
      returnFields.hidden = !returnToggle.checked;
    };

    form.onsubmit = async (e) => {
      e.preventDefault();
      const fd = new FormData(form);
      const material = getMaterial(fd.get("materialId"));
      const worker = state.workers.find((w) => w.id === fd.get("workerId"));
      if (!material || !worker) {
        showToast("Select material and worker", "error");
        return;
      }
      const returnExpected = fd.get("returnExpected") === "on";
      try {
        await recordStockOut({
          materialId: material.id,
          materialName: material.name,
          quantity: fd.get("quantity"),
          workerId: worker.id,
          workerName: worker.name,
          workerRole: worker.trade || worker.designation || "",
          projectId: fd.get("projectId"),
          issueDate: fd.get("issueDate"),
          purpose: fd.get("purpose"),
          returnExpected,
          returnDate: returnExpected ? fd.get("returnDate") : "",
          returnStatus: returnExpected ? "not_returned" : "returned",
        });
        form.reset();
        form.querySelector('[name="issueDate"]').value = todayISO();
        returnFields.hidden = true;
        showToast("Stock issued");
      } catch (err) {
        showToast(err.message, "error");
      }
    };

    formCard.appendChild(form);
    wrap.appendChild(formCard);

    const history = [...state.stockOut].sort((a, b) => String(b.issueDate).localeCompare(String(a.issueDate)));
    const historyCard = document.createElement("div");
    historyCard.className = "card card-pad";
    historyCard.innerHTML = `<h4 class="sup-section-title">Recent issues</h4>`;
    historyCard.appendChild(
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
    );
    wrap.appendChild(historyCard);
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
    wrap.className = "inv-tab-panel mod-tab-panel";
    const rows = rollupCentralLedger(state.stockIn, state.stockOut, state.materials);
    wrap.appendChild(
      renderModuleToolbar({
        title: "Central stock ledger",
        actionsHtml: `<span class="text-muted">Company-wide qty in / out / balance</span>`,
      })
    );
    const card = document.createElement("div");
    card.className = "card card-pad";
    card.appendChild(
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
    );
    wrap.appendChild(card);
    return wrap;
  }

  function renderIssueVouchersTab() {
    const wrap = document.createElement("div");
    wrap.className = "inv-tab-panel mod-tab-panel";
    const pending = listPendingCentralRequisitions(state.mrsByProject);
    const submittedCentral = Object.values(state.mrsByProject)
      .flat()
      .filter((mr) => mr.requestType === "central" && mr.status === "submitted");
    const canIssue = canPerformAction("issue_site_voucher");
    const canApprove = canPerformAction("approve_central_requisition") || canPerformAction("approve");

    wrap.appendChild(
      renderModuleToolbar({
        title: "Issue vouchers",
        actionsHtml: `<span class="text-muted">${submittedCentral.length} to approve · ${pending.length} to issue</span>`,
      })
    );

    if (submittedCentral.length) {
      const subCard = document.createElement("div");
      subCard.className = "card card-pad issue-voucher-card";
      subCard.innerHTML = `<h4 class="sup-section-title">Submitted central requisitions</h4>
        <table class="dash-table"><thead><tr><th>Project</th><th>Title</th><th>Qty</th><th></th></tr></thead><tbody>${submittedCentral
          .map((mr) => {
            const proj = state.projects.find((p) => p.id === mr.projectId);
            const btn = canApprove
              ? `<button type="button" class="btn btn-primary btn-sm inv-approve-mr" data-pid="${escapeHtml(mr.projectId)}" data-mid="${escapeHtml(mr.id)}">Approve</button>`
              : "";
            return `<tr><td>${escapeHtml(proj?.name || mr.projectId)}</td><td>${escapeHtml(mr.title)}</td><td>${mr.qty}</td><td>${btn}</td></tr>`;
          })
          .join("")}</tbody></table>`;
      wrap.appendChild(subCard);
      subCard.querySelectorAll(".inv-approve-mr").forEach((btn) => {
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

    const pendingCard = document.createElement("div");
    pendingCard.className = "card card-pad issue-voucher-card";
    pendingCard.innerHTML = `<h4 class="sup-section-title">Pending central requisitions</h4>`;
    if (!pending.length) {
      pendingCard.innerHTML += `<p class="proj-empty">No approved central requisitions pending issue.</p>`;
    } else {
      pendingCard.innerHTML += `<table class="dash-table"><thead><tr><th>Project</th><th>Title</th><th>Qty</th><th>Material</th><th></th></tr></thead><tbody>${pending
        .map((mr) => {
          const mat = state.materials.find((m) => m.id === mr.inventoryMaterialId);
          const proj = state.projects.find((p) => p.id === mr.projectId);
          const issueBtn = canIssue
            ? `<button type="button" class="btn btn-primary btn-sm inv-issue-btn" data-pid="${escapeHtml(mr.projectId)}" data-mid="${escapeHtml(mr.id)}">Issue voucher</button>`
            : "";
          return `<tr>
            <td>${escapeHtml(proj?.name || mr.projectId)}</td>
            <td>${escapeHtml(mr.title)}</td>
            <td>${mr.qty}</td>
            <td>${escapeHtml(mat?.name || mr.inventoryMaterialId || "—")}</td>
            <td>${issueBtn}</td>
          </tr>`;
        })
        .join("")}</tbody></table>`;
    }
    wrap.appendChild(pendingCard);

    pendingCard.querySelectorAll(".inv-issue-btn").forEach((btn) => {
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
    const histCard = document.createElement("div");
    histCard.className = "card card-pad";
    histCard.innerHTML = `<h4 class="sup-section-title">Issued vouchers</h4>`;
    histCard.appendChild(
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
    );
    wrap.appendChild(histCard);
    return wrap;
  }

  function renderLedgerTab() {
    const wrap = document.createElement("div");
    wrap.className = "inv-tab-panel mod-tab-panel";

    const filters = document.createElement("div");
    filters.className = "card card-pad inv-ledger-filters";
    filters.innerHTML = `
      <h4 class="sup-section-title">Stock ledger</h4>
      <div class="form-grid proj-form-inline">
        <select id="inv-ledger-material">
          <option value="all">All materials</option>
          ${state.materials.map((m) => `<option value="${escapeHtml(m.id)}" ${state.ledgerFilters.materialId === m.id ? "selected" : ""}>${escapeHtml(m.name)}</option>`).join("")}
        </select>
        <select id="inv-ledger-project">
          <option value="all">All projects</option>
          ${state.projects.map((p) => `<option value="${escapeHtml(p.id)}" ${state.ledgerFilters.projectId === p.id ? "selected" : ""}>${escapeHtml(p.name)}</option>`).join("")}
        </select>
        <select id="inv-ledger-worker">
          <option value="all">All workers</option>
          ${state.workers.map((w) => `<option value="${escapeHtml(w.id)}" ${state.ledgerFilters.workerId === w.id ? "selected" : ""}>${escapeHtml(w.name)}</option>`).join("")}
        </select>
        <input type="date" id="inv-ledger-from" value="${escapeHtml(state.ledgerFilters.dateFrom)}" />
        <input type="date" id="inv-ledger-to" value="${escapeHtml(state.ledgerFilters.dateTo)}" />
        <button type="button" class="btn btn-primary btn-sm" id="inv-ledger-apply">Apply</button>
      </div>
    `;
    wrap.appendChild(filters);

    const ledger = buildStockLedger(state.stockIn, state.stockOut, state.ledgerFilters);
    const ledgerCard = document.createElement("div");
    ledgerCard.className = "card card-pad";
    ledgerCard.appendChild(
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
    );
    wrap.appendChild(ledgerCard);

    const apply = () => {
      state.ledgerFilters = {
        materialId: filters.querySelector("#inv-ledger-material").value,
        projectId: filters.querySelector("#inv-ledger-project").value,
        workerId: filters.querySelector("#inv-ledger-worker").value,
        dateFrom: filters.querySelector("#inv-ledger-from").value,
        dateTo: filters.querySelector("#inv-ledger-to").value,
      };
      renderContent();
    };
    filters.querySelector("#inv-ledger-apply").onclick = apply;
    return wrap;
  }

  function renderPendingReturnsTab() {
    const wrap = document.createElement("div");
    wrap.className = "inv-tab-panel mod-tab-panel";

    const pending = listPendingReturns(state.stockOut);
    wrap.appendChild(
      renderModuleToolbar({
        title: "Pending returns",
        actionsHtml: `<span class="text-muted">${pending.length} item(s) awaiting return</span>`,
      })
    );

    const tableWrap = document.createElement("div");
    tableWrap.className = "table-wrap";
    tableWrap.innerHTML = `
      <table class="dash-table">
        <thead>
          <tr>
            <th>Material</th>
            <th>Worker</th>
            <th class="text-right">Qty</th>
            <th>Issued</th>
            <th>Days</th>
            <th>Project</th>
            <th></th>
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
                <td class="proj-row-actions-cell">
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
    `;
    wrap.appendChild(tableWrap);

    tableWrap.querySelectorAll(".inv-mark-returned").forEach((btn) => {
      btn.onclick = async () => {
        try {
          await updateStockOutReturn(btn.dataset.id, "returned");
          showToast("Marked as returned");
        } catch (err) {
          showToast(err.message, "error");
        }
      };
    });
    tableWrap.querySelectorAll(".inv-mark-damaged").forEach((btn) => {
      btn.onclick = async () => {
        try {
          await updateStockOutReturn(btn.dataset.id, "damaged");
          showToast("Marked as damaged");
        } catch (err) {
          showToast(err.message, "error");
        }
      };
    });

    if (paginationHost) paginationHost.innerHTML = "";
    return wrap;
  }

  function renderLowStockTab() {
    const wrap = document.createElement("div");
    wrap.className = "inv-tab-panel mod-tab-panel";
    const low = listLowStock(state.materials);

    wrap.appendChild(
      renderModuleToolbar({
        title: "Low stock alerts",
        actionsHtml: low.length
          ? `<span class="chip inv-low-badge" style="background:#fef2f2;color:#dc2626">${low.length} alert(s)</span>`
          : `<span class="text-muted">All materials above reorder level</span>`,
      })
    );

    wrap.appendChild(
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
              return `<span class="chip inv-low-badge" style="background:#fef2f2;color:#dc2626">${gap > 0 ? gap : 0} ${unitLabel(r.unit)}</span>`;
            },
          },
        ],
        rows: low,
        emptyMessage: "No low stock items — inventory levels are healthy",
        rowActions: (r) =>
          `<button type="button" class="btn btn-ghost btn-sm inv-restock" data-id="${escapeHtml(r.id)}">Stock in</button>`,
      })
    );

    wrap.querySelectorAll(".inv-restock").forEach((btn) => {
      btn.onclick = () => {
        state.activeTab = "stock_in";
        renderTabs();
        renderContent();
      };
    });

    if (paginationHost) paginationHost.innerHTML = "";
    return wrap;
  }

  function renderTabs() {
    if (!tabBarHost) return;
    tabBarHost.innerHTML = "";
    tabBarHost.appendChild(
      renderModulePillTabBar(TABS, state.activeTab, (tab) => {
        state.activeTab = tab;
        state.listPage = 1;
        if (tab !== "materials") state.selectedMaterialId = "";
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
    renderKpis();
  }

  function render() {
    renderKpis();
    renderTabs();
    renderContent();
  }

  root.innerHTML = `
    <div class="mod-kpi-host"></div>
    <div class="card inv-module-card">
      <div class="inv-tab-bar-host"></div>
      <div class="inv-tab-content card-pad"></div>
      <div class="inv-pagination-host"></div>
    </div>
  `;

  kpiHost = root.querySelector(".mod-kpi-host");
  tabBarHost = root.querySelector(".inv-tab-bar-host");
  contentHost = root.querySelector(".inv-tab-content");
  paginationHost = root.querySelector(".inv-pagination-host");

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
