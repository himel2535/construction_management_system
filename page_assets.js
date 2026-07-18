import { listenList } from "./svc_data.js";
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
  renderStatusFilterChips,
  statusChip,
  escapeHtml,
} from "./cmp_moduleHub.js";
import { createAsset, updateAsset, transferAsset, logMaintenance } from "./svc_assets.js";
import {
  ASSET_CATEGORIES,
  ASSET_STATUSES,
  STATUS_FILTERS,
  categoryLabel,
  assetStatusLabel,
  filterAssets,
  paginateSlice,
  latestMaintenanceByAsset,
  isMaintenanceOverdue,
  todayISO,
} from "./util_assets.js";

const TABS = [
  { id: "register", label: "Register" },
  { id: "assignment", label: "Assignment" },
  { id: "maintenance", label: "Maintenance" },
];

const ASSET_FIELDS = [
  { name: "name", label: "Asset name *", required: true },
  {
    name: "category",
    label: "Category",
    type: "select",
    options: ASSET_CATEGORIES.map((c) => ({ value: c.id, label: c.label })),
  },
  { name: "purchaseDate", label: "Purchase date", type: "date" },
  { name: "purchaseValue", label: "Purchase value", type: "number" },
  { name: "vendor", label: "Vendor" },
  {
    name: "status",
    label: "Status",
    type: "select",
    options: ASSET_STATUSES.map((s) => ({ value: s.id, label: s.label })),
  },
  {
    name: "assignedProjectId",
    label: "Assigned project",
    type: "select",
    options: [],
  },
];

function projectName(projects, id) {
  if (!id) return "—";
  return projects.find((p) => p.id === id)?.name || id;
}

export function mountAssets(container) {
  setActiveNav();
  setPageChrome({
    title: "Assets",
    subtitle: "Machinery, vehicles, tools — register, assignment, and maintenance.",
    showDateRange: false,
    quickActionLabel: "",
    onQuickAction: null,
  });

  const root = document.createElement("div");
  root.className = "assets-page dashboard-page";
  container.appendChild(root);

  const state = {
    assets: [],
    assignments: [],
    maintenance: [],
    projects: [],
    activeTab: "register",
    statusFilter: "all",
    filterQuery: "",
    listPage: 1,
    listPageSize: 10,
  };

  let kpiHost = null;
  let tabBarHost = null;
  let contentHost = null;
  let paginationHost = null;

  function getAsset(id) {
    return state.assets.find((a) => a.id === id);
  }

  function assetFieldOptions() {
    return ASSET_FIELDS.map((f) => {
      if (f.name !== "assignedProjectId") return f;
      return {
        ...f,
        options: [{ value: "", label: "Unassigned" }, ...state.projects.map((p) => ({ value: p.id, label: p.name }))],
      };
    });
  }

  function openAssetDialog(asset = null) {
    openEditDialog(
      asset ? "Edit asset" : "Add asset",
      assetFieldOptions(),
      asset || {
        category: "tools_equipment",
        status: "in_use",
        purchaseDate: todayISO(),
        purchaseValue: 0,
        assignedProjectId: "",
      },
      async (vals) => {
        const payload = {
          ...vals,
          purchaseValue: Number(vals.purchaseValue) || 0,
        };
        if (asset?.id) {
          await updateAsset(asset.id, payload);
          showToast("Asset updated");
        } else {
          await createAsset(payload);
          showToast("Asset created");
        }
      }
    );
  }

  function renderKpis() {
    if (!kpiHost) return;
    kpiHost.innerHTML = "";
    const maintMap = latestMaintenanceByAsset(state.maintenance);
    let overdue = 0;
    for (const m of maintMap.values()) {
      if (isMaintenanceOverdue(m)) overdue += 1;
    }
    const underRepair = state.assets.filter((a) => a.status === "under_repair").length;
    const inUse = state.assets.filter((a) => a.status === "in_use").length;

    kpiHost.appendChild(
      renderModuleStatCards([
        { label: "Total assets", value: state.assets.length, icon: "wrench", iconCls: "mod-stat-icon--blue" },
        {
          label: "In use",
          value: inUse,
          sub: `${inUse} active on sites`,
          icon: "checkCircle",
          iconCls: "mod-stat-icon--green",
          valueCls: "mod-stat-value--green",
        },
        {
          label: "Under repair",
          value: underRepair,
          icon: "alertTriangle",
          iconCls: "mod-stat-icon--amber",
          valueCls: underRepair ? "mod-stat-value--amber" : "",
        },
        {
          label: "Overdue service",
          value: overdue,
          sub: overdue ? "Maintenance past due" : "Up to date",
          icon: "clock",
          iconCls: overdue ? "mod-stat-icon--red" : "mod-stat-icon--green",
          valueCls: overdue ? "mod-stat-value--red" : "mod-stat-value--green",
        },
      ])
    );
  }

  function renderRegisterTab() {
    const wrap = document.createElement("div");
    wrap.className = "ast-tab-panel mod-tab-panel";

    const toolbar = renderModuleToolbar({
      title: "Asset register",
      searchPlaceholder: "Search assets...",
      searchValue: state.filterQuery,
      actionsHtml: '<button type="button" class="btn btn-primary btn-sm" id="ast-add-asset">+ Add asset</button>',
    });
    wrap.appendChild(toolbar);

    const chipsHost = document.createElement("div");
    chipsHost.className = "ast-status-chips";
    chipsHost.appendChild(
      renderStatusFilterChips(STATUS_FILTERS, state.statusFilter, (id) => {
        state.statusFilter = id;
        state.listPage = 1;
        renderContent();
      })
    );
    wrap.appendChild(chipsHost);

    const list = filterAssets(state.assets, { status: state.statusFilter, query: state.filterQuery });
    const page = paginateSlice(list, state.listPage, state.listPageSize);
    if (page.page !== state.listPage) state.listPage = page.page;

    wrap.appendChild(
      renderDataTable({
        columns: [
          { key: "assetCode", label: "Code" },
          { key: "name", label: "Name" },
          {
            key: "category",
            label: "Category",
            render: (r) => escapeHtml(categoryLabel(r.category)),
          },
          {
            key: "purchaseValue",
            label: "Value",
            render: (r) => formatBDT(r.purchaseValue),
          },
          {
            key: "assignedProjectId",
            label: "Project",
            render: (r) => escapeHtml(projectName(state.projects, r.assignedProjectId)),
          },
          {
            key: "status",
            label: "Status",
            render: (r) => statusChip(assetStatusLabel(r.status)),
          },
        ],
        rows: page.items,
        emptyMessage: "No assets match filters",
        rowActions: (r) =>
          `<button type="button" class="btn btn-ghost btn-sm ast-edit-asset" data-id="${escapeHtml(r.id)}">Edit</button>`,
      })
    );

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

    toolbar.querySelector(".mod-search-input").oninput = (e) => {
      state.filterQuery = e.target.value;
      state.listPage = 1;
      renderContent();
    };
    toolbar.querySelector("#ast-add-asset").onclick = () => openAssetDialog();
    wrap.querySelectorAll(".ast-edit-asset").forEach((btn) => {
      btn.onclick = () => {
        const asset = getAsset(btn.dataset.id);
        if (asset) openAssetDialog(asset);
      };
    });

    return wrap;
  }

  function renderAssignmentTab() {
    const wrap = document.createElement("div");
    wrap.className = "ast-tab-panel mod-tab-panel";

    const formCard = document.createElement("div");
    formCard.className = "card card-pad";
    formCard.innerHTML = `<h4 class="sup-section-title">Transfer / assign asset</h4>`;
    const form = document.createElement("form");
    form.className = "form-grid proj-form";
    form.innerHTML = `
      <select name="assetId" id="ast-transfer-asset" required>
        <option value="">Asset *</option>
        ${state.assets.map((a) => `<option value="${escapeHtml(a.id)}">${escapeHtml(a.assetCode || a.name)} — ${escapeHtml(a.name)}</option>`).join("")}
      </select>
      <input name="fromProject" id="ast-from-project" readonly placeholder="From site" />
      <select name="toProjectId" required>
        <option value="">To site *</option>
        ${state.projects.map((p) => `<option value="${escapeHtml(p.id)}">${escapeHtml(p.name)}</option>`).join("")}
      </select>
      <input name="date" type="date" value="${todayISO()}" />
      <input name="note" placeholder="Note" class="form-field--full" />
      <div class="form-actions form-field--full">
        <button type="submit" class="btn btn-primary btn-sm">Record transfer</button>
      </div>
    `;

    const assetSel = form.querySelector("#ast-transfer-asset");
    const fromInput = form.querySelector("#ast-from-project");
    const syncFrom = () => {
      const asset = getAsset(assetSel.value);
      fromInput.value = asset ? projectName(state.projects, asset.assignedProjectId) : "";
    };
    assetSel.onchange = syncFrom;
    syncFrom();

    form.onsubmit = async (e) => {
      e.preventDefault();
      const fd = new FormData(form);
      const asset = getAsset(fd.get("assetId"));
      const toProjectId = fd.get("toProjectId");
      if (!asset || !toProjectId) {
        showToast("Select asset and destination site", "error");
        return;
      }
      try {
        await transferAsset(asset.id, {
          fromProjectId: asset.assignedProjectId || "",
          toProjectId,
          date: fd.get("date"),
          note: fd.get("note"),
        });
        form.reset();
        form.querySelector('[name="date"]').value = todayISO();
        fromInput.value = "";
        showToast("Asset transferred");
      } catch (err) {
        showToast(err.message, "error");
      }
    };

    formCard.appendChild(form);
    wrap.appendChild(formCard);

    const log = [...state.assignments].sort((a, b) => String(b.date).localeCompare(String(a.date)));
    const logCard = document.createElement("div");
    logCard.className = "card card-pad";
    logCard.innerHTML = `<h4 class="sup-section-title">Transfer log</h4>`;
    logCard.appendChild(
      renderDataTable({
        columns: [
          { key: "date", label: "Date" },
          {
            key: "assetId",
            label: "Asset",
            render: (r) => {
              const a = getAsset(r.assetId);
              return escapeHtml(a ? `${a.assetCode || ""} ${a.name}`.trim() : r.assetId);
            },
          },
          {
            key: "fromProjectId",
            label: "From",
            render: (r) => escapeHtml(projectName(state.projects, r.fromProjectId) || "—"),
          },
          {
            key: "toProjectId",
            label: "To",
            render: (r) => escapeHtml(projectName(state.projects, r.toProjectId)),
          },
          { key: "assignedBy", label: "By" },
          { key: "note", label: "Note" },
        ],
        rows: log.slice(0, 50),
        emptyMessage: "No transfers recorded yet",
      })
    );
    wrap.appendChild(logCard);

    if (paginationHost) paginationHost.innerHTML = "";
    return wrap;
  }

  function renderMaintenanceTab() {
    const wrap = document.createElement("div");
    wrap.className = "ast-tab-panel mod-tab-panel";

    const formCard = document.createElement("div");
    formCard.className = "card card-pad";
    formCard.innerHTML = `<h4 class="sup-section-title">Log maintenance</h4>`;
    const form = document.createElement("form");
    form.className = "form-grid proj-form";
    form.innerHTML = `
      <select name="assetId" required>
        <option value="">Asset *</option>
        ${state.assets.map((a) => `<option value="${escapeHtml(a.id)}">${escapeHtml(a.assetCode || a.name)} — ${escapeHtml(a.name)}</option>`).join("")}
      </select>
      <input name="lastServiceDate" type="date" value="${todayISO()}" />
      <input name="nextServiceDue" type="date" placeholder="Next service due" />
      <input name="maintenanceCost" type="number" step="0.01" placeholder="Cost" />
      <textarea name="description" rows="2" placeholder="Work performed" class="form-field--full"></textarea>
      <div class="form-actions form-field--full">
        <button type="submit" class="btn btn-primary btn-sm">Save maintenance</button>
      </div>
    `;
    form.onsubmit = async (e) => {
      e.preventDefault();
      const fd = new FormData(form);
      const assetId = fd.get("assetId");
      if (!assetId) {
        showToast("Select an asset", "error");
        return;
      }
      try {
        await logMaintenance(assetId, {
          lastServiceDate: fd.get("lastServiceDate"),
          nextServiceDue: fd.get("nextServiceDue"),
          maintenanceCost: fd.get("maintenanceCost"),
          description: fd.get("description"),
        });
        form.reset();
        form.querySelector('[name="lastServiceDate"]').value = todayISO();
        showToast("Maintenance logged");
      } catch (err) {
        showToast(err.message, "error");
      }
    };
    formCard.appendChild(form);
    wrap.appendChild(formCard);

    const maintMap = latestMaintenanceByAsset(state.maintenance);
    const rows = state.assets
      .map((a) => {
        const m = maintMap.get(a.id);
        return {
          assetId: a.id,
          assetCode: a.assetCode,
          name: a.name,
          lastServiceDate: m?.lastServiceDate || "—",
          nextServiceDue: m?.nextServiceDue || "—",
          maintenanceCost: m?.maintenanceCost || 0,
          description: m?.description || "",
          overdue: m ? isMaintenanceOverdue(m) : false,
        };
      })
      .sort((a, b) => String(a.name).localeCompare(String(b.name)));

    const tableWrap = document.createElement("div");
    tableWrap.className = "card card-pad";
    tableWrap.innerHTML = `<h4 class="sup-section-title">Maintenance schedule</h4>`;
    const inner = document.createElement("div");
    inner.className = "table-wrap";
    inner.innerHTML = `
      <table class="dash-table">
        <thead>
          <tr>
            <th>Asset</th>
            <th>Last service</th>
            <th>Next due</th>
            <th class="text-right">Last cost</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          ${
            rows.length
              ? rows
                  .map(
                    (r) => `<tr class="${r.overdue ? "ast-row-overdue" : ""}">
                <td>${escapeHtml(r.assetCode || "")} ${escapeHtml(r.name)}</td>
                <td>${escapeHtml(r.lastServiceDate)}</td>
                <td>${escapeHtml(r.nextServiceDue)}</td>
                <td class="text-right">${formatBDT(r.maintenanceCost)}</td>
                <td>${r.overdue ? '<span class="chip inv-low-badge">Overdue</span>' : statusChip("on_time")}</td>
              </tr>`
                  )
                  .join("")
              : '<tr class="empty-row"><td colspan="5">No maintenance records yet</td></tr>'
          }
        </tbody>
      </table>
    `;
    tableWrap.appendChild(inner);
    wrap.appendChild(tableWrap);

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
        renderTabs();
        renderContent();
      })
    );
  }

  function renderContent() {
    if (!contentHost) return;
    contentHost.innerHTML = "";
    if (state.activeTab === "register") contentHost.appendChild(renderRegisterTab());
    else if (state.activeTab === "assignment") contentHost.appendChild(renderAssignmentTab());
    else contentHost.appendChild(renderMaintenanceTab());
    renderKpis();
  }

  function render() {
    renderKpis();
    renderTabs();
    renderContent();
  }

  root.innerHTML = `
    <div class="mod-kpi-host"></div>
    <div class="card ast-module-card">
      <div class="ast-tab-bar-host"></div>
      <div class="ast-tab-content card-pad"></div>
      <div class="ast-pagination-host"></div>
    </div>
  `;

  kpiHost = root.querySelector(".mod-kpi-host");
  tabBarHost = root.querySelector(".ast-tab-bar-host");
  contentHost = root.querySelector(".ast-tab-content");
  paginationHost = root.querySelector(".ast-pagination-host");

  render();

  const unsubs = [
    listenList("assets", (list) => {
      state.assets = list;
      render();
    }),
    listenList("assetAssignments", (list) => {
      state.assignments = list;
      if (state.activeTab === "assignment") renderContent();
    }),
    listenList("assetMaintenance", (list) => {
      state.maintenance = list;
      if (state.activeTab === "maintenance") renderContent();
      else renderKpis();
    }),
    listenList("projects", (list) => {
      state.projects = list.sort((a, b) => String(a.name).localeCompare(String(b.name)));
      renderContent();
    }),
  ];

  return {
    unmount: () => unsubs.forEach((fn) => fn()),
  };
}
