import { listenList } from "./svc_data.js";
import { formatBDT } from "./util_format.js";
import { showToast } from "./cmp_toast.js";
import { setActiveNav } from "./cmp_layout.js";
import { setPageChrome } from "./cmp_header.js";
import { openCustFormDialog, renderDataTable, escapeHtml } from "./cmp_projectTab.js";
import { renderPagination, statusChip } from "./cmp_moduleHub.js";
import { icon } from "./cmp_icons.js";
import { kpiIcon } from "./cmp_dashboardIcons.js";
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
  { name: "vendor", label: "Vendor" },
  {
    name: "status",
    label: "Status",
    type: "select",
    options: ASSET_STATUSES.map((s) => ({ value: s.id, label: s.label })),
  },
  { name: "purchaseDate", label: "Purchase date", type: "date" },
  { name: "purchaseValue", label: "Purchase value", type: "number", step: "0.01" },
  {
    name: "assignedProjectId",
    label: "Assigned project",
    type: "select",
    options: [],
  },
];

function assetSparklineSvg(values = [], tone = "green") {
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

function renderAssetTabBar(tabs, activeId, onSelect) {
  const wrap = document.createElement("div");
  wrap.className = "proj-tab-subnav ast-pill-tabs ast-pill-tabs--assets-main";
  for (const t of tabs) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = `proj-tab ast-tab-pill ast-tab-pill--${t.id}${activeId === t.id ? " is-active" : ""}`;
    btn.textContent = t.label;
    btn.onclick = () => onSelect(t.id);
    wrap.appendChild(btn);
  }
  return wrap;
}

function wrapAsProjectsTable(dataTableEl) {
  const table = dataTableEl.querySelector("table");
  if (table) {
    table.classList.add("projects-table", "assets-table");
  }
  dataTableEl.classList.add("projects-table-wrap");
  return dataTableEl;
}

function projectName(projects, id) {
  if (!id) return "—";
  return projects.find((p) => p.id === id)?.name || id;
}

function assetFieldOptions(projects) {
  return ASSET_FIELDS.map((f) => {
    if (f.name !== "assignedProjectId") return f;
    return {
      ...f,
      options: [{ value: "", label: "Unassigned" }, ...projects.map((p) => ({ value: p.id, label: p.name }))],
    };
  });
}

function assetFormSections(projects) {
  const fields = assetFieldOptions(projects);
  const pick = (...names) => fields.filter((f) => names.includes(f.name));
  return [
    { title: "Asset details", fields: pick("name", "category", "vendor", "status") },
    { title: "Purchase & assignment", fields: pick("purchaseDate", "purchaseValue", "assignedProjectId") },
  ];
}

export function mountAssets(container) {
  setActiveNav();
  setPageChrome({
    title: "Assets & Equipment",
    subtitle: "Machinery, vehicles, tools — register, assignment, and maintenance.",
    showDateRange: false,
    quickActionLabel: "",
    onQuickAction: null,
  });

  const root = document.createElement("div");
  root.className = "assets-page dashboard-page dashboard-mockup";
  container.appendChild(root);

  const state = {
    assets: [],
    assignments: [],
    maintenance: [],
    projects: [],
    activeTab: "register",
    statusFilter: "all",
    categoryFilter: "all",
    filterQuery: "",
    listPage: 1,
    listPageSize: 10,
  };

  let kpiHost = null;
  let tabHost = null;
  let contentHost = null;

  function getAsset(id) {
    return state.assets.find((a) => a.id === id);
  }

  function computeKpiMetrics() {
    const maintMap = latestMaintenanceByAsset(state.maintenance);
    let overdue = 0;
    for (const m of maintMap.values()) {
      if (isMaintenanceOverdue(m)) overdue += 1;
    }
    const underRepair = state.assets.filter((a) => a.status === "under_repair").length;
    const inUse = state.assets.filter((a) => a.status === "in_use").length;
    const total = state.assets.length;
    return { total, inUse, underRepair, overdue };
  }

  function openAssetDialog(asset = null) {
    const defaults = {
      category: "tools_equipment",
      status: "in_use",
      purchaseDate: todayISO(),
      purchaseValue: 0,
      assignedProjectId: "",
      name: "",
      vendor: "",
    };
    openCustFormDialog({
      title: asset ? "Edit asset" : "Add asset",
      subtitle: asset
        ? "Update asset profile, status, and site assignment."
        : "Register machinery, vehicles, or tools for tracking and maintenance.",
      sections: assetFormSections(state.projects),
      values: asset ? { ...defaults, ...asset } : defaults,
      submitLabel: asset ? "Save changes" : "Save asset",
      modalClass: "ast-asset-modal",
      onSave: async (vals) => {
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
        render();
      },
    });
  }

  function openTransferDialog() {
    const assetOptions = [
      { value: "", label: "Select asset" },
      ...state.assets.map((a) => ({
        value: a.id,
        label: `${a.assetCode || a.name} — ${a.name}`,
      })),
    ];
    const projectOptions = [
      { value: "", label: "Select destination" },
      ...state.projects.map((p) => ({ value: p.id, label: p.name })),
    ];
    openCustFormDialog({
      title: "Record transfer",
      subtitle: "Move an asset between sites",
      modalClass: "ast-asset-modal",
      submitLabel: "Record transfer",
      values: {
        assetId: "",
        fromProjectDisplay: "",
        toProjectId: "",
        date: todayISO(),
        note: "",
      },
      sections: [
        {
          title: "Transfer",
          fields: [
            { name: "assetId", label: "Asset *", type: "select", required: true, options: assetOptions },
            { name: "fromProjectDisplay", label: "From site" },
            { name: "toProjectId", label: "To site *", type: "select", required: true, options: projectOptions },
            { name: "date", label: "Date", type: "date" },
          ],
        },
        {
          title: "Notes",
          fields: [{ name: "note", label: "Note", fullWidth: true }],
        },
      ],
      onReady: ({ form }) => {
        const assetSel = form.querySelector('[name="assetId"]');
        const fromInput = form.querySelector('[name="fromProjectDisplay"]');
        if (fromInput) fromInput.readOnly = true;
        const syncFrom = () => {
          const asset = getAsset(assetSel?.value);
          if (fromInput) {
            fromInput.value = asset ? projectName(state.projects, asset.assignedProjectId) : "";
          }
        };
        assetSel?.addEventListener("change", syncFrom);
        syncFrom();
      },
      onSave: async (vals) => {
        const asset = getAsset(vals.assetId);
        const toProjectId = vals.toProjectId;
        if (!asset || !toProjectId) {
          showToast("Select asset and destination site", "error");
          throw new Error("validation");
        }
        try {
          await transferAsset(asset.id, {
            fromProjectId: asset.assignedProjectId || "",
            toProjectId,
            date: vals.date,
            note: vals.note,
          });
          showToast("Asset transferred");
          render();
        } catch (err) {
          showToast(err.message, "error");
          throw err;
        }
      },
    });
  }

  function openMaintenanceDialog() {
    const assetOptions = [
      { value: "", label: "Select asset" },
      ...state.assets.map((a) => ({
        value: a.id,
        label: `${a.assetCode || a.name} — ${a.name}`,
      })),
    ];
    openCustFormDialog({
      title: "Log maintenance",
      subtitle: "Record service history and next due date",
      modalClass: "ast-asset-modal",
      submitLabel: "Save maintenance",
      values: {
        assetId: "",
        lastServiceDate: todayISO(),
        nextServiceDue: "",
        maintenanceCost: "",
        description: "",
      },
      sections: [
        {
          title: "Service",
          fields: [
            { name: "assetId", label: "Asset *", type: "select", required: true, options: assetOptions },
            { name: "lastServiceDate", label: "Last service date", type: "date" },
            { name: "nextServiceDue", label: "Next service due", type: "date" },
            { name: "maintenanceCost", label: "Cost (BDT)", type: "number", step: "0.01" },
          ],
        },
        {
          title: "Work",
          fields: [{ name: "description", label: "Work performed", type: "textarea", fullWidth: true }],
        },
      ],
      onSave: async (vals) => {
        if (!vals.assetId) {
          showToast("Select an asset", "error");
          throw new Error("validation");
        }
        try {
          await logMaintenance(vals.assetId, {
            lastServiceDate: vals.lastServiceDate,
            nextServiceDue: vals.nextServiceDue,
            maintenanceCost: vals.maintenanceCost,
            description: vals.description,
          });
          showToast("Maintenance logged");
          render();
        } catch (err) {
          showToast(err.message, "error");
          throw err;
        }
      },
    });
  }

  function renderKpiStrip() {
    if (!kpiHost) return;
    const { total, inUse, underRepair, overdue } = computeKpiMetrics();

    const cards = [
      {
        label: "Total assets",
        value: String(total),
        iconKey: "projects",
        tone: "blue",
        footLeft: total ? "Registered equipment" : "No assets yet",
        spark: assetSparklineSvg([2, total || 1, total || 2, total || 3, 2, 2, 2], "blue"),
      },
      {
        label: "In use",
        value: String(inUse),
        iconKey: "collection",
        tone: "green",
        footLeft: inUse ? `${inUse} active on sites` : "None assigned",
        spark: assetSparklineSvg([1, 2, inUse || 1, inUse || 2, inUse, inUse, inUse], "green"),
      },
      {
        label: "Under repair",
        value: String(underRepair),
        iconKey: "expense",
        tone: "orange",
        footLeft: underRepair ? "Needs attention" : "None under repair",
        spark: assetSparklineSvg([underRepair || 1, underRepair, underRepair, 1, 1, 1, 1], "orange"),
      },
      {
        label: "Overdue service",
        value: String(overdue),
        iconKey: "receivable",
        tone: overdue ? "red" : "teal",
        footLeft: overdue ? "Maintenance past due" : "Up to date",
        spark: assetSparklineSvg([overdue || 1, overdue, overdue, 1, 1, 1, 1], overdue ? "red" : "teal"),
      },
    ];

    kpiHost.className = "dash-kpi-row ast-kpi-host";
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

  function renderRegisterTab() {
    const wrap = document.createElement("div");
    wrap.className = "ast-tab-panel";

    const list = filterAssets(state.assets, { status: state.statusFilter, query: state.filterQuery }).filter((a) => {
      if (state.categoryFilter === "all") return true;
      return a.category === state.categoryFilter;
    });
    const page = paginateSlice(list, state.listPage, state.listPageSize);
    if (page.page !== state.listPage) state.listPage = page.page;

    const section = document.createElement("section");
    section.className = "dash-widget dash-widget--projects card";
    section.innerHTML = `
      <div class="dash-widget-head dash-widget-head--split">
        <div>
          <h3 class="dash-widget-title">Asset register</h3>
          <p class="dash-widget-sub">Search and filter registered equipment</p>
        </div>
        <span class="cust-toolbar-count">Showing ${page.total} asset${page.total === 1 ? "" : "s"}</span>
      </div>
      <div class="dash-widget-body">
        <div class="toolbar-row projects-toolbar assets-toolbar" id="ast-list-toolbar">
          <div class="toolbar-filters">
            <select class="toolbar-select" id="ast-filter-status">
              ${STATUS_FILTERS.map((s) => `<option value="${escapeHtml(s.id)}" ${state.statusFilter === s.id ? "selected" : ""}>${escapeHtml(s.label === "All" ? "All statuses" : s.label)}</option>`).join("")}
            </select>
            <select class="toolbar-select" id="ast-filter-category">
              <option value="all" ${state.categoryFilter === "all" ? "selected" : ""}>All categories</option>
              ${ASSET_CATEGORIES.map((c) => `<option value="${escapeHtml(c.id)}" ${state.categoryFilter === c.id ? "selected" : ""}>${escapeHtml(c.label)}</option>`).join("")}
            </select>
          </div>
          <div class="toolbar-actions">
            <div class="cust-toolbar-search toolbar-search">
              <span class="search-icon" aria-hidden="true">${icon("search", { size: 18 })}</span>
              <input type="search" class="cust-toolbar-search-input" id="ast-list-search" placeholder="Search assets..." autocomplete="off" value="${escapeHtml(state.filterQuery)}" />
            </div>
            <div class="cust-toolbar-btn-group">
              <button type="button" class="btn btn-ghost btn-sm cust-toolbar-btn cust-toolbar-btn--clear" id="ast-clear-filters" title="Clear filters">${icon("rotateCcw", { size: 16 })} Clear</button>
              <button type="button" class="btn btn-primary btn-sm" id="ast-add-asset">+ Add asset</button>
            </div>
          </div>
        </div>
        <div class="ast-register-content-host"></div>
      </div>
    `;

    const contentHostEl = section.querySelector(".ast-register-content-host");

    if (!page.items.length) {
      const empty = document.createElement("p");
      empty.className = "proj-empty";
      empty.textContent = state.assets.length ? "No assets match your filters" : "No assets registered yet";
      contentHostEl.appendChild(empty);
    } else {
      const desktop = document.createElement("div");
      desktop.className = "table-wrap projects-table-wrap";
      desktop.innerHTML = `
        <table class="dash-table projects-table assets-table">
          <thead>
            <tr>
              <th>Code</th><th>Name</th><th>Category</th><th>Value</th><th>Project</th><th class="cust-col-center">Status</th><th class="cust-col-center">Action</th>
            </tr>
          </thead>
          <tbody>
            ${page.items
              .map(
                (r) => `<tr>
              <td>${escapeHtml(r.assetCode || "—")}</td>
              <td>${escapeHtml(r.name)}</td>
              <td>${escapeHtml(categoryLabel(r.category))}</td>
              <td>${formatBDT(r.purchaseValue)}</td>
              <td>${escapeHtml(projectName(state.projects, r.assignedProjectId))}</td>
              <td class="cust-col-center">${statusChip(assetStatusLabel(r.status))}</td>
              <td class="cust-col-center proj-row-actions-cell">
                <button type="button" class="btn btn-ghost btn-sm ast-edit-asset" data-id="${escapeHtml(r.id)}">Edit</button>
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

    const toolbar = section.querySelector("#ast-list-toolbar");
    toolbar.querySelector("#ast-list-search").oninput = (e) => {
      state.filterQuery = e.target.value;
      state.listPage = 1;
      renderContent();
    };
    toolbar.querySelector("#ast-filter-status").onchange = (e) => {
      state.statusFilter = e.target.value;
      state.listPage = 1;
      renderContent();
    };
    toolbar.querySelector("#ast-filter-category").onchange = (e) => {
      state.categoryFilter = e.target.value;
      state.listPage = 1;
      renderContent();
    };
    toolbar.querySelector("#ast-add-asset").onclick = () => openAssetDialog();
    toolbar.querySelector("#ast-clear-filters").onclick = () => {
      state.filterQuery = "";
      state.statusFilter = "all";
      state.categoryFilter = "all";
      state.listPage = 1;
      renderContent();
    };
    contentHostEl.querySelectorAll(".ast-edit-asset").forEach((btn) => {
      btn.onclick = (e) => {
        e.stopPropagation();
        const asset = getAsset(btn.dataset.id);
        if (asset) openAssetDialog(asset);
      };
    });

    return wrap;
  }

  function renderAssignmentTab() {
    const wrap = document.createElement("div");
    wrap.className = "ast-tab-panel";

    const log = [...state.assignments].sort((a, b) => String(b.date).localeCompare(String(a.date)));
    const logSection = document.createElement("section");
    logSection.className = "dash-widget dash-widget--projects card ast-report-block";
    logSection.innerHTML = `
      <div class="dash-widget-head dash-widget-head--split">
        <div>
          <h3 class="dash-widget-title">Transfer log</h3>
          <p class="dash-widget-sub">Asset moves between sites</p>
        </div>
        <button type="button" class="btn btn-primary btn-sm" id="ast-open-transfer">+ Record transfer</button>
      </div>
      <div class="dash-widget-body"></div>
    `;
    logSection.querySelector(".dash-widget-body").appendChild(
      wrapAsProjectsTable(
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
      )
    );
    logSection.querySelector("#ast-open-transfer").onclick = () => openTransferDialog();
    wrap.appendChild(logSection);

    return wrap;
  }

  function renderMaintenanceTab() {
    const wrap = document.createElement("div");
    wrap.className = "ast-tab-panel";

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

    const scheduleSection = document.createElement("section");
    scheduleSection.className = "dash-widget dash-widget--projects card ast-report-block";
    scheduleSection.innerHTML = `
      <div class="dash-widget-head dash-widget-head--split">
        <div>
          <h3 class="dash-widget-title">Maintenance schedule</h3>
          <p class="dash-widget-sub">Service history and next due dates</p>
        </div>
        <button type="button" class="btn btn-primary btn-sm" id="ast-open-maintenance">+ Log maintenance</button>
      </div>
      <div class="dash-widget-body">
        <div class="table-wrap projects-table-wrap">
          <table class="dash-table projects-table assets-table">
            <thead>
              <tr>
                <th>Asset</th><th>Last service</th><th>Next due</th><th>Last cost</th><th class="cust-col-center">Status</th>
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
                <td>${formatBDT(r.maintenanceCost)}</td>
                <td class="cust-col-center">${r.overdue ? '<span class="chip inv-low-badge">Overdue</span>' : statusChip("on_time")}</td>
              </tr>`
                      )
                      .join("")
                  : '<tr class="empty-row"><td colspan="5">No maintenance records yet</td></tr>'
              }
            </tbody>
          </table>
        </div>
      </div>
    `;
    scheduleSection.querySelector("#ast-open-maintenance").onclick = () => openMaintenanceDialog();
    wrap.appendChild(scheduleSection);

    return wrap;
  }

  function renderTabs() {
    if (!tabHost) return;
    tabHost.innerHTML = "";
    tabHost.appendChild(
      renderAssetTabBar(TABS, state.activeTab, (tab) => {
        state.activeTab = tab;
        state.listPage = 1;
        renderKpiStrip();
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
  }

  function render() {
    renderKpiStrip();
    renderTabs();
    renderContent();
  }

  function ensureLayout() {
    root.innerHTML = `
      <div id="ast-metrics" class="ast-kpi-host"></div>
      <div class="ast-tab-host"></div>
      <div class="ast-content-host"></div>
    `;
    kpiHost = root.querySelector("#ast-metrics");
    tabHost = root.querySelector(".ast-tab-host");
    contentHost = root.querySelector(".ast-content-host");
  }

  ensureLayout();
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
      renderKpiStrip();
      if (state.activeTab === "maintenance") renderContent();
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
