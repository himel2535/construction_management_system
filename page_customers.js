import { listenList } from "./svc_data.js";import { showToast } from "./cmp_toast.js";
import { setActiveNav } from "./cmp_layout.js";
import { setPageChrome } from "./cmp_header.js";
import { icon } from "./cmp_icons.js";
import { formatDate } from "./util_format.js";

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function clientKpiIconSvg(type) {
  const icons = {
    users: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>`,
    calendar: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4"/><path d="M8 2v4"/><path d="M3 10h18"/><path d="M12 14v4"/><path d="M10 16h4"/></svg>`,
    check: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="m16 11 2 2 4-4"/></svg>`,
    mail: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/></svg>`,
  };
  return icons[type] || icons.users;
}

function clientSparklineSvg(values = [], tone = "green") {
  const pts = values.length ? values : [3, 4, 4, 5, 5, 6, 6];
  const max = Math.max(...pts, 1);
  const w = 80;
  const h = 28;
  const coords = pts
    .map((v, i) => {
      const x = (i / (pts.length - 1 || 1)) * w;
      const y = h - (v / max) * (h - 4) - 2;
      return `${x},${y}`;
    })
    .join(" ");
  const stroke = tone === "red" ? "#ef4444" : tone === "blue" ? "#3b82f6" : "#10b981";
  return `<svg class="dash-sparkline dash-sparkline--${tone}" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none"><polyline points="${coords}" fill="none" stroke="${stroke}" stroke-width="2" stroke-linecap="round"/></svg>`;
}

function clientStatusPill(status) {
  const key = String(status || "active").toLowerCase() === "inactive" ? "delayed" : "on_track";
  const label = key === "delayed" ? "Inactive" : "Active";
  return `<span class="dash-health-pill dash-health-pill--${key}"><i class="dash-health-dot" aria-hidden="true"></i>${escapeHtml(label)}</span>`;
}

function initials(name) {
  const parts = String(name || "?").trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return (parts[0][0] || "?").toUpperCase();
}

/** Normalize phone for uniqueness checks (digits only). */
export function normalizePhone(phone) {
  return String(phone || "").replace(/\D/g, "");
}

export function isValidEmail(email) {
  if (!email) return true;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function countAddedThisMonth(items) {
  const prefix = new Date().toISOString().slice(0, 7);
  return items.filter((c) => {
    if (!c.createdAt) return false;
    const d = new Date(c.createdAt).toISOString().slice(0, 7);
    return d === prefix;
  }).length;
}

function renderMetrics(host, items) {
  const total = items.length;
  const active = items.filter((c) => (c.status || "active") === "active").length;
  const inactive = total - active;
  const withEmail = items.filter((c) => c.email && String(c.email).trim()).length;
  const withoutEmail = total - withEmail;
  const addedMonth = countAddedThisMonth(items);
  const activePct = total ? Math.round((active / total) * 100) : 0;

  const cards = [
    {
      label: "Total Clients",
      value: String(total),
      icon: "users",
      tone: "blue",
      footLeft: total ? `${active} active ? ${inactive} inactive` : "No clients yet",
      footRight: clientSparklineSvg([2, 3, 4, total || 1, total || 2, total || 3, total || 4], "blue"),
    },
    {
      label: "Added This Month",
      value: String(addedMonth),
      icon: "calendar",
      tone: "green",
      footLeft: addedMonth ? `${addedMonth} new this month` : "None added this month",
      footRight: clientSparklineSvg([0, 1, 1, addedMonth || 1, addedMonth || 2, addedMonth, addedMonth], "green"),
    },
    {
      label: "Active",
      value: String(active),
      icon: "check",
      tone: "purple",
      footLeft: total ? `${activePct}% of total` : "?",
      footRight: `<span class="dash-kpi-pct">${activePct}%</span>`,
    },
    {
      label: "With Email",
      value: String(withEmail),
      icon: "mail",
      tone: "orange",
      footLeft: withoutEmail ? `${withoutEmail} without email` : "All have email on file",
      footRight: clientSparklineSvg([withEmail || 1, withEmail || 2, withEmail, withEmail, withEmail, withEmail, withEmail], "green"),
    },
  ];

  host.className = "dash-kpi-row";
  host.innerHTML = cards
    .map(
      (c) => `<div class="dash-kpi-card card">
      <div class="dash-kpi-head">
        <div class="dash-kpi-icon dash-kpi-icon--${c.tone}">${clientKpiIconSvg(c.icon)}</div>
        <div class="dash-kpi-main">
          <span class="dash-kpi-label">${escapeHtml(c.label)}</span>
          <div class="dash-kpi-value">${escapeHtml(c.value)}</div>
        </div>
      </div>
      <div class="dash-kpi-foot">
        <span class="dash-kpi-foot-left">${escapeHtml(c.footLeft)}</span>
        <span class="dash-kpi-foot-right">${c.footRight}</span>
      </div>
    </div>`
    )
    .join("");
}

function applyFilters(items, filters) {
  const { query, status, name, phone, email } = filters;
  let out = items;

  if (status && status !== "all") {
    out = out.filter((c) => (c.status || "active") === status);
  }
  if (name.trim()) {
    const n = name.trim().toLowerCase();
    out = out.filter((c) => c.name && c.name.toLowerCase().includes(n));
  }
  if (phone.trim()) {
    const p = phone.trim().toLowerCase();
    out = out.filter((c) => c.phone && c.phone.toLowerCase().includes(p));
  }
  if (email.trim()) {
    const e = email.trim().toLowerCase();
    out = out.filter((c) => c.email && c.email.toLowerCase().includes(e));
  }
  const q = query.trim().toLowerCase();
  if (q) {
    out = out.filter(
      (c) =>
        (c.name && c.name.toLowerCase().includes(q)) ||
        (c.phone && c.phone.toLowerCase().includes(q)) ||
        (c.email && c.email.toLowerCase().includes(q)) ||
        (c.address && c.address.toLowerCase().includes(q)) ||
        (c.nid && c.nid.toLowerCase().includes(q))
    );
  }
  return out.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
}

function exportClientsCsv(items, projectMap) {
  const headers = [
    "#",
    "Name",
    "Phone",
    "Email",
    "Address",
    "NID",
    "Contract ref",
    "Project",
    "Status",
    "Joined",
  ];
  const rows = items.map((c, i) => [
    i + 1,
    c.name || "",
    c.phone || "",
    c.email || "",
    c.address || "",
    c.nid || "",
    c.contractRef || "",
    c.projectId ? projectMap.get(c.projectId) || c.projectId : "",
    c.status || "active",
    c.createdAt ? formatDate(c.createdAt) : "",
  ]);
  const escape = (v) => `"${String(v).replace(/"/g, '""')}"`;
  const csv = [headers, ...rows].map((r) => r.map(escape).join(",")).join("\r\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `clients-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

function renderDirectoryTable(tbody, items, onEdit, onView) {
  if (!items.length) {
    tbody.innerHTML = `<tr class="empty-row"><td colspan="7">No clients match your filters</td></tr>`;
    return;
  }
  tbody.innerHTML = items
    .map(
      (c, idx) => `
    <tr data-id="${c.id}" class="cust-row">
      <td class="col-num">${idx + 1}</td>
      <td>
        <div class="cell-user">
          <span class="user-avatar sm">${initials(c.name)}</span>
          <strong>${escapeHtml(c.name)}</strong>
        </div>
      </td>
      <td>${escapeHtml(c.phone)}</td>
      <td>${c.email ? escapeHtml(c.email) : '<span class="text-muted">?</span>'}</td>
      <td>${clientStatusPill(c.status || "active")}</td>
      <td class="col-date">${c.createdAt ? formatDate(c.createdAt) : '<span class="text-muted">?</span>'}</td>
      <td class="text-right">
        <div class="table-actions">
          <button type="button" class="icon-btn icon-btn--sm view-cust" data-id="${c.id}" title="View" aria-label="View client">${icon("eye", { size: 16 })}</button>
          <button type="button" class="icon-btn icon-btn--sm edit-cust" data-id="${c.id}" title="Edit" aria-label="Edit client">${icon("pencil", { size: 16 })}</button>
        </div>
      </td>
    </tr>
  `
    )
    .join("");

  tbody.querySelectorAll(".edit-cust").forEach((btn) => {
    btn.onclick = (e) => {
      e.stopPropagation();
      const row = items.find((x) => x.id === btn.dataset.id);
      if (row) onEdit(row);
    };
  });

  tbody.querySelectorAll(".view-cust").forEach((btn) => {
    btn.onclick = (e) => {
      e.stopPropagation();
      const row = items.find((x) => x.id === btn.dataset.id);
      if (row) onView(row);
    };
  });

  tbody.querySelectorAll(".cust-row").forEach((tr) => {
    tr.onclick = () => {
      const row = items.find((x) => x.id === tr.dataset.id);
      if (row) onEdit(row);
    };
  });
}

export function fillProjectSelect(sel, projects, selectedId = "") {
  sel.innerHTML = '<option value="">No project</option>';
  projects.forEach((p) => {
    const o = document.createElement("option");
    o.value = p.id;
    o.textContent = p.name;
    if (p.id === selectedId) o.selected = true;
    sel.appendChild(o);
  });
}

export function validateClientForm(form, allClients, editId) {
  const name = form.name.value.trim();
  const phone = form.phone.value.trim();
  const email = form.email.value.trim();
  const address = form.address.value.trim();
  const nid = form.nid.value.trim();

  if (!name) return { ok: false, message: "Name is required" };
  if (!phone) return { ok: false, message: "Phone is required" };
  if (phone.length < 6) return { ok: false, message: "Enter a valid phone number" };
  if (!isValidEmail(email)) return { ok: false, message: "Enter a valid email address" };

  const norm = normalizePhone(phone);
  const duplicate = allClients.find(
    (c) => c.id !== editId && normalizePhone(c.phone) === norm
  );
  if (duplicate) {
    return { ok: false, message: `Phone already used by ${duplicate.name}` };
  }

  return {
    ok: true,
    data: {
      name,
      phone,
      email,
      address,
      nid,
      contractRef: form.contractRef.value.trim(),
      projectId: form.projectId.value || "",
      status: form.status.value,
    },
  };
}

export function mountClients(container) {
  setActiveNav();

  const root = document.createElement("div");
  root.className = "customers-page dashboard-page dashboard-mockup";

  const metricsRow = document.createElement("div");
  metricsRow.id = "cust-metrics";
  root.appendChild(metricsRow);

  const directoryCard = document.createElement("section");
  directoryCard.className = "dash-widget dash-widget--clients card";

  const toolbar = document.createElement("div");
  toolbar.className = "toolbar-row customers-toolbar";
  toolbar.innerHTML = `
    <div class="toolbar-filters">
      <input type="text" class="toolbar-input" id="cust-filter-name" placeholder="Name" autocomplete="off" />
      <input type="text" class="toolbar-input" id="cust-filter-phone" placeholder="Phone" autocomplete="off" />
      <input type="text" class="toolbar-input" id="cust-filter-email" placeholder="Email" autocomplete="off" />
      <select class="toolbar-select" id="cust-filter-status" aria-label="Status filter">
        <option value="all">All statuses</option>
        <option value="active">Active</option>
        <option value="inactive">Inactive</option>
      </select>
    </div>
    <div class="toolbar-actions">
      <div class="header-search-wrap toolbar-search">
        <span class="search-icon" aria-hidden="true">${icon("search", { size: 18 })}</span>
        <input type="search" class="header-search" id="cust-search" placeholder="Search clients..." autocomplete="off" />
      </div>
      <button type="button" class="btn btn-ghost btn-sm" id="cust-clear-filters" title="Clear filters">${icon("rotateCcw", { size: 16 })} Clear</button>
      <button type="button" class="btn btn-ghost btn-sm" id="cust-export">${icon("download", { size: 16 })} Export</button>
      <button type="button" class="btn btn-ghost btn-sm" id="cust-import">${icon("upload", { size: 16 })} Import</button>
    </div>
  `;

  const detailPanel = document.createElement("div");
  detailPanel.className = "cust-detail-panel";
  detailPanel.id = "cust-detail-panel";
  detailPanel.hidden = true;

  const tableWrap = document.createElement("div");
  tableWrap.className = "table-wrap customers-table-wrap";
  tableWrap.innerHTML = `
    <table class="dash-table customers-table" id="customers-table">
      <thead>
        <tr>
          <th class="col-num">#</th>
          <th>Client</th>
          <th>Phone</th>
          <th>Email</th>
          <th>Status</th>
          <th>Joined</th>
          <th class="text-right">Actions</th>
        </tr>
      </thead>
      <tbody></tbody>
    </table>
  `;

  directoryCard.innerHTML = `
    <div class="dash-widget-head dash-widget-head--split">
      <div>
        <h3 class="dash-widget-title">Client Directory</h3>
        <p class="dash-widget-sub">Search, filter, and manage project owners</p>
      </div>
      <span class="cust-toolbar-count" id="cust-count"></span>
    </div>
    <div class="dash-widget-body"></div>
  `;
  const dirBody = directoryCard.querySelector(".dash-widget-body");
  dirBody.append(toolbar, detailPanel, tableWrap);
  root.appendChild(directoryCard);

  container.appendChild(root);

  let allClients = [];
  let allProjects = [];
  let allInvoices = [];
  const projectMap = new Map();
  const filters = { query: "", status: "all", name: "", phone: "", email: "" };

  const searchInput = toolbar.querySelector("#cust-search");
  const filterName = toolbar.querySelector("#cust-filter-name");
  const filterPhone = toolbar.querySelector("#cust-filter-phone");
  const filterEmail = toolbar.querySelector("#cust-filter-email");
  const filterStatus = toolbar.querySelector("#cust-filter-status");
  const clearBtn = toolbar.querySelector("#cust-clear-filters");
  const exportBtn = toolbar.querySelector("#cust-export");
  const importBtn = toolbar.querySelector("#cust-import");
  const countEl = directoryCard.querySelector("#cust-count");
  const tbody = tableWrap.querySelector("tbody");

  function goToClientForm(clientId = "") {
    location.hash = clientId ? `#/clients/new?edit=${encodeURIComponent(clientId)}` : "#/clients/new";
  }

  setPageChrome({
    title: "Clients / Owners",
    subtitle: "Manage project owners, employers, and contract contacts.",
    showDateRange: false,
    quickActionLabel: "+ Add New Client",
    onQuickAction: () => goToClientForm(),
  });

  function startEdit(client) {
    detailPanel.hidden = true;
    goToClientForm(client.id);
  }

  function renderDetailPanel(client) {
    const linkedBills = allInvoices.filter((b) => b.clientId === client.id);
    const projectLabel = client.projectId
      ? projectMap.get(client.projectId) || "?"
      : "?";

    detailPanel.hidden = false;
    detailPanel.innerHTML = `
      <div class="cust-detail-head">
        <div class="cust-detail-title">
          <span class="user-avatar sm">${initials(client.name)}</span>
          <div>
            <strong>${escapeHtml(client.name)}</strong>
            <span class="cust-detail-sub">${escapeHtml(client.phone)}${client.email ? ` ? ${escapeHtml(client.email)}` : ""}</span>
          </div>
        </div>
        <button type="button" class="icon-btn icon-btn--sm" id="cust-detail-close" aria-label="Close details">${icon("x", { size: 16 })}</button>
      </div>
      <div class="cust-detail-grid">
        <div><span class="cust-detail-label">Status</span>${clientStatusPill(client.status || "active")}</div>
        <div><span class="cust-detail-label">Joined</span>${client.createdAt ? formatDate(client.createdAt) : "?"}</div>
        <div><span class="cust-detail-label">NID</span>${escapeHtml(client.nid || "?")}</div>
        <div><span class="cust-detail-label">Contract ref</span>${escapeHtml(client.contractRef || "?")}</div>
        <div><span class="cust-detail-label">Project</span>${escapeHtml(projectLabel)}</div>
        <div><span class="cust-detail-label">Bills</span>${linkedBills.length} invoice${linkedBills.length === 1 ? "" : "s"}</div>
      </div>
      ${client.address ? `<p class="cust-detail-address"><span class="cust-detail-label">Address</span> ${escapeHtml(client.address)}</p>` : ""}
      <div class="cust-detail-actions">
        <button type="button" class="btn btn-ghost btn-sm" id="cust-detail-edit">${icon("pencil", { size: 16 })} Edit</button>
        ${linkedBills.length ? `<a href="#/billing" class="btn btn-ghost btn-sm">View billing</a>` : ""}
      </div>
    `;
    detailPanel.querySelector("#cust-detail-close").onclick = () => {
      detailPanel.hidden = true;
      tbody.querySelectorAll(".cust-row").forEach((tr) => tr.classList.remove("row-selected"));
    };
    detailPanel.querySelector("#cust-detail-edit").onclick = () => startEdit(client);
    tbody.querySelectorAll(".cust-row").forEach((tr) => {
      tr.classList.toggle("row-selected", tr.dataset.id === client.id);
    });
  }

  function viewClient(client) {
    renderDetailPanel(client);
    detailPanel.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  function getFiltered() {
    return applyFilters(allClients, filters);
  }

  function refreshTable() {
    const filtered = getFiltered();
    const total = allClients.length;
    countEl.textContent =
      filtered.length === total
        ? `Showing ${filtered.length} client${filtered.length === 1 ? "" : "s"}`
        : `Showing ${filtered.length} of ${total} clients`;
    renderDirectoryTable(tbody, filtered, startEdit, viewClient);
  }

  function syncFiltersFromInputs() {
    filters.query = searchInput.value;
    filters.name = filterName.value;
    filters.phone = filterPhone.value;
    filters.email = filterEmail.value;
    filters.status = filterStatus.value;
    refreshTable();
  }

  [searchInput, filterName, filterPhone, filterEmail].forEach((el) => {
    el.oninput = syncFiltersFromInputs;
  });
  filterStatus.onchange = syncFiltersFromInputs;

  clearBtn.onclick = () => {
    searchInput.value = "";
    filterName.value = "";
    filterPhone.value = "";
    filterEmail.value = "";
    filterStatus.value = "all";
    filters.query = "";
    filters.name = "";
    filters.phone = "";
    filters.email = "";
    filters.status = "all";
    detailPanel.hidden = true;
    refreshTable();
  };

  exportBtn.onclick = () => {
    const filtered = getFiltered();
    if (!filtered.length) {
      showToast("No clients to export", "error");
      return;
    }
    exportClientsCsv(filtered, projectMap);
    showToast(`Exported ${filtered.length} clients`);
  };

  importBtn.onclick = () => {
    showToast("Import is available in the full ERP ? demo mode uses seed data");
  };

  const unsubClients = listenList("clients", (items) => {
    allClients = items;
    renderMetrics(metricsRow, items);
    refreshTable();
  });

  const unsubProjects = listenList("projects", (items) => {
    allProjects = items;
    projectMap.clear();
    items.forEach((p) => projectMap.set(p.id, p.name));
  });

  const unsubInvoices = listenList("clientInvoices", (items) => {
    allInvoices = items;
  });

  return {
    unmount: () => {
      unsubClients();
      unsubProjects();
      unsubInvoices();
    },
  };
}

export function mountCustomers(container) {
  return mountClients(container);
}
