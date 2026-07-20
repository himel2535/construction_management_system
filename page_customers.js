import { listenList } from "./svc_data.js";
import { showToast } from "./cmp_toast.js";
import { setActiveNav } from "./cmp_layout.js";
import { setPageChrome } from "./cmp_header.js";
import { icon } from "./cmp_icons.js";
import { clientKpiIcon } from "./cmp_dashboardIcons.js";
import { formatDate, formatBDT } from "./util_format.js";
import { formatCompactBDT } from "./util_dashboard.js";
import { navigateTo } from "./util_route.js";

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function clientSparklineSvg(values = [], tone = "green") {
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

function clientStatusPill(status) {
  const key = String(status || "active").toLowerCase() === "inactive" ? "delayed" : "on_track";
  const label = key === "delayed" ? "Inactive" : "Active";
  return `<span class="dash-health-pill dash-health-pill--${key}"><i class="dash-health-dot" aria-hidden="true"></i>${escapeHtml(label)}</span>`;
}

function clientTypePill(type) {
  const t = String(type || "private").toLowerCase();
  if (t === "government") {
    return `<span class="cust-type-pill cust-type-pill--government">Government</span>`;
  }
  return `<span class="cust-type-pill cust-type-pill--private">Private</span>`;
}

export function isPortalAccessEnabled(client) {
  return client?.portalAccessEnabled !== false;
}

function initials(name) {
  const parts = String(name || "?").trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return (parts[0][0] || "?").toUpperCase();
}

export function invoiceBalance(inv) {
  if (!inv || inv.status === "cancelled" || inv.status === "paid") return 0;
  return Math.max(0, Number(inv.amount || 0) - Number(inv.paidAmount || 0));
}

export function isInvoiceOverdue(inv) {
  const bal = invoiceBalance(inv);
  if (bal <= 0) return false;
  const today = new Date().toISOString().slice(0, 10);
  return inv.dueDate && String(inv.dueDate) < today;
}

export function buildClientAggregates(projects, invoices, clients = []) {
  const byClient = new Map();
  /** @type {Map<string, Set<string>>} */
  const projectIdsByClient = new Map();

  for (const p of projects) {
    if (!p.clientId) continue;
    const cur = byClient.get(p.clientId) || { projectCount: 0, outstanding: 0, hasOverdue: false };
    cur.projectCount += 1;
    byClient.set(p.clientId, cur);
    if (!projectIdsByClient.has(p.clientId)) projectIdsByClient.set(p.clientId, new Set());
    projectIdsByClient.get(p.clientId).add(p.id);
  }

  const projectById = new Map(projects.map((p) => [p.id, p]));
  for (const c of clients) {
    if (!c?.id || !c.projectId) continue;
    const proj = projectById.get(c.projectId);
    if (!proj) continue;
    const seen = projectIdsByClient.get(c.id) || new Set();
    if (seen.has(c.projectId)) continue;
    seen.add(c.projectId);
    projectIdsByClient.set(c.id, seen);
    const cur = byClient.get(c.id) || { projectCount: 0, outstanding: 0, hasOverdue: false };
    cur.projectCount += 1;
    byClient.set(c.id, cur);
  }

  const overdueClients = new Set();
  let totalOutstanding = 0;
  let overdueOutstanding = 0;
  for (const inv of invoices) {
    const bal = invoiceBalance(inv);
    if (bal <= 0) continue;
    totalOutstanding += bal;
    const cid = inv.clientId;
    if (!cid) continue;
    const cur = byClient.get(cid) || { projectCount: 0, outstanding: 0, hasOverdue: false };
    cur.outstanding += bal;
    if (isInvoiceOverdue(inv)) {
      overdueClients.add(cid);
      overdueOutstanding += bal;
    }
    byClient.set(cid, cur);
  }
  for (const cid of overdueClients) {
    const cur = byClient.get(cid);
    if (cur) cur.hasOverdue = true;
  }
  return {
    byClient,
    totalOutstanding,
    overdueOutstanding,
    overdueClientCount: overdueClients.size,
  };
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

function renderKpiIconContent(c) {
  return clientKpiIcon(c.icon);
}

function avatarColorClass(name) {
  const hues = ["a", "b", "c", "d", "e"];
  let h = 0;
  const s = String(name || "");
  for (let i = 0; i < s.length; i++) h = (h + s.charCodeAt(i) * (i + 1)) % hues.length;
  return `user-avatar--${hues[h]}`;
}

function buildPossibleDuplicateIds(clients) {
  const dup = new Set();
  const phoneMap = new Map();
  const emailMap = new Map();
  for (const c of clients) {
    const phone = normalizePhone(c.phone);
    if (phone) {
      const other = phoneMap.get(phone);
      if (other) {
        dup.add(c.id);
        dup.add(other);
      } else phoneMap.set(phone, c.id);
    }
    const email = String(c.email || "")
      .trim()
      .toLowerCase();
    if (email) {
      const otherE = emailMap.get(email);
      if (otherE) {
        dup.add(c.id);
        dup.add(otherE);
      } else emailMap.set(email, c.id);
    }
  }
  return dup;
}

function renderMetrics(host, items, summary) {
  const total = items.length;
  const active = items.filter((c) => (c.status || "active") === "active").length;
  const inactive = total - active;
  const withEmail = items.filter((c) => c.email && String(c.email).trim()).length;
  const addedMonth = countAddedThisMonth(items);
  const { totalOutstanding = 0, overdueOutstanding = 0, overdueClientCount = 0 } = summary || {};
  const activePct = total ? Math.round((active / total) * 100) : 0;
  const emailPct = total ? Math.round((withEmail / total) * 100) : 0;

  const cards = [
    {
      label: "Total Clients",
      value: String(total),
      icon: "total",
      tone: "yellow",
      extraClass: "cust-kpi-card--yellow",
      footLeft: total ? `${active} active · ${inactive} inactive` : "No clients yet",
      spark: clientSparklineSvg([2, 3, 4, total || 1, total || 2, total || 3, total || 4], "yellow"),
    },
    {
      label: "Active Clients",
      value: String(active),
      icon: "active",
      tone: "green",
      footLeft: total ? `${activePct}% of total` : "No active clients",
      footRight: clientSparklineSvg([1, 2, active || 1, active || 2, active, active, active], "green"),
      spark: clientSparklineSvg([1, 2, active || 1, active || 2, active, active, active], "green"),
    },
    {
      label: "Added This Month",
      value: String(addedMonth),
      icon: "added",
      tone: "orange",
      footLeft: addedMonth ? `${addedMonth} new this month` : "None added this month",
      spark: clientSparklineSvg([0, 1, 1, addedMonth || 1, addedMonth || 2, addedMonth, addedMonth], "orange"),
    },
    {
      label: "With Email on File",
      value: String(withEmail),
      icon: "email",
      tone: "yellow",
      extraClass: "cust-kpi-card--yellow",
      footLeft: total ? `${emailPct}% have email` : "No clients yet",
      spark: clientSparklineSvg([withEmail || 1, withEmail || 2, withEmail, withEmail, withEmail, withEmail, withEmail], "yellow"),
    },
    {
      label: "Outstanding Receivable",
      value: formatCompactBDT(totalOutstanding),
      icon: "outstanding",
      tone: "red",
      extraClass: "dash-kpi-card--attention",
      footLeft:
        overdueClientCount > 0
          ? `<span class="is-danger">${escapeHtml(formatCompactBDT(overdueOutstanding))} · ${overdueClientCount} client${overdueClientCount === 1 ? "" : "s"} overdue</span>`
          : "No overdue clients",
      spark: clientSparklineSvg(
        [totalOutstanding ? 4 : 2, 3, totalOutstanding ? 5 : 2, 4, totalOutstanding ? 6 : 2, 3, 2],
        "red"
      ),
    },
  ];

  host.className = "dash-kpi-row";
  host.innerHTML = cards
    .map(
      (c) => `<div class="dash-kpi-card card cust-kpi-card ${c.extraClass || ""}">
      <div class="cust-kpi-spark">${c.spark}</div>
      <div class="dash-kpi-head">
        <div class="dash-kpi-icon dash-kpi-icon--flat">${renderKpiIconContent(c)}</div>
        <div class="dash-kpi-main">
          <span class="dash-kpi-label">${escapeHtml(c.label)}</span>
          <div class="dash-kpi-value">${escapeHtml(c.value)}</div>
        </div>
      </div>
      <div class="dash-kpi-foot">
        <div class="dash-kpi-foot-left">${c.footLeft.includes("<") ? c.footLeft : escapeHtml(c.footLeft)}</div>
        ${c.footRight ? `<div class="dash-kpi-foot-right">${c.footRight}</div>` : ""}
      </div>
    </div>`
    )
    .join("");
}

function applyFilters(items, filters) {
  const { query, status, clientType, name, phone, email } = filters;
  let out = items;

  if (status && status !== "all") {
    out = out.filter((c) => (c.status || "active") === status);
  }
  if (clientType && clientType !== "all") {
    out = out.filter((c) => (c.clientType || "private") === clientType);
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
        (c.nid && c.nid.toLowerCase().includes(q)) ||
        (c.contactPersonName && c.contactPersonName.toLowerCase().includes(q))
    );
  }
  return out.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
}

function exportClientsCsv(items, projectMap, aggregates) {
  const headers = [
    "#",
    "Name",
    "Type",
    "Phone",
    "Email",
    "Linked projects",
    "Outstanding",
    "Address",
    "NID",
    "Contract ref",
    "Project",
    "Status",
    "Portal access",
    "Joined",
  ];
  const rows = items.map((c, i) => {
    const agg = aggregates.byClient.get(c.id) || { projectCount: 0, outstanding: 0 };
    return [
      i + 1,
      c.name || "",
      c.clientType || "private",
      c.phone || "",
      c.email || "",
      agg.projectCount,
      agg.outstanding,
      c.address || "",
      c.nid || "",
      c.contractRef || "",
      c.projectId ? projectMap.get(c.projectId) || c.projectId : "",
      c.status || "active",
      isPortalAccessEnabled(c) ? "yes" : "no",
      c.createdAt ? formatDate(c.createdAt) : "",
    ];
  });
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

function renderDirectoryTable(tbody, items, aggregates, duplicateIds, onEdit, onView) {
  if (!items.length) {
    tbody.innerHTML = `<tr class="empty-row"><td colspan="10">No clients match your filters</td></tr>`;
    return;
  }
  tbody.innerHTML = items
    .map((c, idx) => {
      const agg = aggregates.byClient.get(c.id) || { projectCount: 0, outstanding: 0 };
      const dupBadge = duplicateIds.has(c.id)
        ? `<span class="cust-dup-badge">possible duplicate</span>`
        : "";
      const projectsCell =
        agg.projectCount > 0
          ? `<button type="button" class="cust-proj-pill-btn cust-proj-link" data-id="${escapeHtml(c.id)}"><span class="cust-proj-pill">${agg.projectCount} project${agg.projectCount === 1 ? "" : "s"}</span></button>`
          : `<span class="text-muted">—</span>`;
      const outCell =
        agg.outstanding > 0
          ? `<span class="cust-outstanding${agg.hasOverdue ? " cust-outstanding--overdue" : ""}" title="From Billing invoices">${formatBDT(agg.outstanding)}</span>`
          : `<span class="text-muted" title="From Billing invoices">—</span>`;
      return `
    <tr data-id="${c.id}" class="cust-row">
      <td class="col-num">${idx + 1}</td>
      <td>
        <div class="cell-user cust-client-cell">
          <span class="user-avatar sm ${avatarColorClass(c.name)}">${initials(c.name)}</span>
          <div class="cell-user-text cust-client-name-row">
            <strong>${escapeHtml(c.name)}</strong>
            ${dupBadge}
          </div>
        </div>
      </td>
      <td class="cust-col-center">${clientTypePill(c.clientType)}</td>
      <td>${escapeHtml(c.phone)}</td>
      <td>${c.email ? escapeHtml(c.email) : '<span class="text-muted">—</span>'}</td>
      <td class="cust-col-center">${projectsCell}</td>
      <td class="col-money cust-col-center">${outCell}</td>
      <td class="cust-col-center">${clientStatusPill(c.status || "active")}</td>
      <td class="col-date cust-col-center">${c.createdAt ? formatDate(c.createdAt) : '<span class="text-muted">—</span>'}</td>
      <td class="cust-col-center">
        <div class="table-actions table-actions--cust">
          <button type="button" class="icon-btn icon-btn--sm view-cust" data-id="${c.id}" title="View" aria-label="View client">${icon("eye", { size: 16 })}</button>
          <button type="button" class="icon-btn icon-btn--sm edit-cust" data-id="${c.id}" title="Edit" aria-label="Edit client">${icon("pencil", { size: 16 })}</button>
        </div>
      </td>
    </tr>
  `;
    })
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

  tbody.querySelectorAll(".cust-proj-link").forEach((btn) => {
    btn.onclick = (e) => {
      e.stopPropagation();
      navigateTo(`/projects?clientId=${encodeURIComponent(btn.dataset.id)}`);
    };
  });

  tbody.querySelectorAll(".cust-row").forEach((tr) => {
    tr.onclick = () => {
      const row = items.find((x) => x.id === tr.dataset.id);
      if (row) onView(row);
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

export function validateClientForm(form, allClients, editId, documents = []) {
  const name = form.name.value.trim();
  const phone = form.phone.value.trim();
  const email = form.email.value.trim();
  const address = form.address.value.trim();
  const nid = form.nid.value.trim();
  const clientType = form.clientType?.value || "private";
  const contactPersonName = form.contactPersonName?.value.trim() || "";
  const contactPersonDesignation = form.contactPersonDesignation?.value.trim() || "";
  const portalAccessEnabled = form.portalAccessEnabled ? form.portalAccessEnabled.checked : true;

  if (!name) return { ok: false, message: "Name is required" };
  if (!phone) return { ok: false, message: "Phone is required" };
  if (phone.length < 6) return { ok: false, message: "Enter a valid phone number" };
  if (!isValidEmail(email)) return { ok: false, message: "Enter a valid email address" };
  if (!clientType) return { ok: false, message: "Client type is required" };
  if (clientType === "government" && !contactPersonName) {
    return { ok: false, message: "Contact person name is required for government clients" };
  }

  const norm = normalizePhone(phone);
  const duplicate = allClients.find((c) => c.id !== editId && normalizePhone(c.phone) === norm);
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
      clientType,
      contactPersonName,
      contactPersonDesignation,
      portalAccessEnabled,
      documents: Array.isArray(documents) ? documents : [],
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
      <select class="toolbar-select" id="cust-filter-type" aria-label="Client type filter">
        <option value="all">All types (Government/Private)</option>
        <option value="government">Government</option>
        <option value="private">Private</option>
      </select>
      <select class="toolbar-select" id="cust-filter-status" aria-label="Status filter">
        <option value="all">All statuses</option>
        <option value="active">Active</option>
        <option value="inactive">Inactive</option>
      </select>
    </div>
    <div class="toolbar-actions">
      <div class="cust-toolbar-search toolbar-search">
        <span class="search-icon" aria-hidden="true">${icon("search", { size: 18 })}</span>
        <input type="search" class="cust-toolbar-search-input" id="cust-search" placeholder="Search clients..." autocomplete="off" />
      </div>
      <div class="cust-toolbar-btn-group">
        <button type="button" class="btn btn-ghost btn-sm cust-toolbar-btn" id="cust-clear-filters" title="Clear filters">${icon("rotateCcw", { size: 16 })} Clear</button>
        <button type="button" class="btn btn-ghost btn-sm cust-toolbar-btn" id="cust-export">${icon("download", { size: 16 })} Export</button>
        <button type="button" class="btn btn-ghost btn-sm cust-toolbar-btn" id="cust-import">${icon("upload", { size: 16 })} Import</button>
      </div>
    </div>
  `;

  const tableWrap = document.createElement("div");
  tableWrap.className = "table-wrap customers-table-wrap";
  tableWrap.innerHTML = `
    <table class="dash-table customers-table" id="customers-table">
      <thead>
        <tr>
          <th class="col-num">#</th>
          <th>Client</th>
          <th class="cust-col-center">Type</th>
          <th>Phone</th>
          <th>Email</th>
          <th class="cust-col-center">Linked Projects</th>
          <th class="cust-col-center">Outstanding</th>
          <th class="cust-col-center">Status</th>
          <th class="cust-col-center">Joined</th>
          <th class="cust-col-center">Actions</th>
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
  dirBody.append(toolbar, tableWrap);
  root.appendChild(directoryCard);

  container.appendChild(root);

  let allClients = [];
  let allProjects = [];
  let allInvoices = [];
  let aggregates = buildClientAggregates([], []);
  const projectMap = new Map();
  const filters = { query: "", status: "all", clientType: "all", name: "", phone: "", email: "" };

  const searchInput = toolbar.querySelector("#cust-search");
  const filterName = toolbar.querySelector("#cust-filter-name");
  const filterPhone = toolbar.querySelector("#cust-filter-phone");
  const filterEmail = toolbar.querySelector("#cust-filter-email");
  const filterType = toolbar.querySelector("#cust-filter-type");
  const filterStatus = toolbar.querySelector("#cust-filter-status");
  const clearBtn = toolbar.querySelector("#cust-clear-filters");
  const exportBtn = toolbar.querySelector("#cust-export");
  const importBtn = toolbar.querySelector("#cust-import");
  const countEl = directoryCard.querySelector("#cust-count");
  const tbody = tableWrap.querySelector("tbody");

  function goToClientForm(clientId = "") {
    navigateTo(clientId ? `/clients/new?edit=${encodeURIComponent(clientId)}` : "/clients/new");
  }

  setPageChrome({
    title: "Clients / Owners",
    subtitle: "Manage project owners, employers, and contract contacts.",
    showDateRange: false,
    quickActionLabel: "+ Add New Client",
    onQuickAction: () => goToClientForm(),
  });

  let detailOverlay = null;
  let openClientId = null;

  function onDetailEscape(e) {
    if (e.key === "Escape") closeClientDetail();
  }

  function closeClientDetail() {
    openClientId = null;
    document.removeEventListener("keydown", onDetailEscape);
    document.body.classList.remove("cust-detail-open");
    detailOverlay?.remove();
    detailOverlay = null;
    tbody.querySelectorAll(".cust-row").forEach((tr) => tr.classList.remove("row-selected"));
  }

  function buildClientDetailHtml(client) {
    const linkedBills = allInvoices.filter((b) => b.clientId === client.id);
    const agg = aggregates.byClient.get(client.id) || { projectCount: 0, outstanding: 0 };
    const projectLabel = client.projectId ? projectMap.get(client.projectId) || "—" : "—";
    const docs = Array.isArray(client.documents) ? client.documents : [];

    const detailField = (label, valueHtml, extraClass = "") =>
      `<div class="cust-detail-field${extraClass ? ` ${extraClass}` : ""}"><span class="cust-detail-label">${escapeHtml(label)}</span><div class="cust-detail-value">${valueHtml}</div></div>`;

    const contactValue = client.contactPersonName
      ? `${escapeHtml(client.contactPersonName)}${client.contactPersonDesignation ? ` · ${escapeHtml(client.contactPersonDesignation)}` : ""}`
      : "";

    const sections = [];
    if (contactValue) {
      sections.push(`
        <div class="cust-detail-section">
          <h4 class="cust-detail-section-title">Contact &amp; notes</h4>
          <div class="cust-detail-section-body">
            ${detailField("Contact person", contactValue)}
          </div>
        </div>`);
    }
    if (docs.length) {
      sections.push(`
        <div class="cust-detail-section">
          <h4 class="cust-detail-section-title">Documents</h4>
          <div class="cust-detail-field cust-detail-docs">
            <ul class="cust-doc-list">${docs
              .map(
                (d) =>
                  `<li><strong>${escapeHtml(d.name || "Document")}</strong> · ${escapeHtml(d.docType || "file")}${d.fileUrl ? ` · <a href="${escapeHtml(d.fileUrl)}" target="_blank" rel="noopener">Open</a>` : ""}</li>`
              )
              .join("")}</ul>
          </div>
        </div>`);
    }

    return `
      <div class="cust-detail-head">
        <div class="cust-detail-title">
          <span class="user-avatar ${avatarColorClass(client.name)}">${initials(client.name)}</span>
          <div>
            <strong id="cust-detail-modal-title">${escapeHtml(client.name)}</strong>
            <span class="cust-detail-sub">${escapeHtml(client.phone)}${client.email ? ` · ${escapeHtml(client.email)}` : ""}</span>
          </div>
        </div>
        <button type="button" class="icon-btn icon-btn--sm cust-detail-close" id="cust-detail-close" aria-label="Close details">${icon("x", { size: 16 })}</button>
      </div>
      <div class="cust-detail-grid">
        ${detailField("Type", clientTypePill(client.clientType))}
        ${detailField("Status", clientStatusPill(client.status || "active"))}
        ${detailField("Portal", isPortalAccessEnabled(client) ? "Enabled" : "Disabled")}
        ${detailField("Joined", client.createdAt ? formatDate(client.createdAt) : "—")}
        ${detailField("Linked projects", String(agg.projectCount || 0))}
        ${detailField("Outstanding", agg.outstanding > 0 ? formatBDT(agg.outstanding) : "—")}
        ${detailField("NID", escapeHtml(client.nid || "—"))}
        ${detailField("Contract ref", escapeHtml(client.contractRef || "—"))}
        ${detailField("Primary project", escapeHtml(projectLabel))}
      </div>
      <div class="cust-detail-duo-row">
        ${detailField("Bills", `${linkedBills.length} invoice${linkedBills.length === 1 ? "" : "s"}`)}
        ${detailField("Address", client.address ? escapeHtml(client.address) : "—")}
      </div>
      ${sections.join("")}
      <div class="cust-detail-actions">
        <button type="button" class="btn btn-primary btn-sm" id="cust-detail-edit">${icon("pencil", { size: 16 })} Edit</button>
        ${agg.projectCount ? `<button type="button" class="btn btn-ghost btn-sm" id="cust-detail-projects">View projects</button>` : ""}
        ${linkedBills.length ? `<a href="/billing" class="btn btn-ghost btn-sm">View billing</a>` : ""}
      </div>
    `;
  }

  function wireClientDetailModal(modal, client) {
    modal.querySelector("#cust-detail-close").onclick = () => closeClientDetail();
    modal.querySelector("#cust-detail-edit").onclick = () => startEdit(client);
    const projBtn = modal.querySelector("#cust-detail-projects");
    if (projBtn) {
      projBtn.onclick = () => {
        closeClientDetail();
        navigateTo(`/projects?clientId=${encodeURIComponent(client.id)}`);
      };
    }
    if (!modal.hasAttribute("tabindex")) modal.setAttribute("tabindex", "-1");
    modal.focus({ preventScroll: true });
  }

  function openClientDetailModal(client) {
    closeClientDetail();
    openClientId = client.id;

    const overlay = document.createElement("div");
    overlay.className = "cust-detail-overlay";
    overlay.setAttribute("role", "presentation");
    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) closeClientDetail();
    });

    const modal = document.createElement("div");
    modal.className = "cust-detail-modal card";
    modal.setAttribute("role", "dialog");
    modal.setAttribute("aria-modal", "true");
    modal.setAttribute("aria-labelledby", "cust-detail-modal-title");
    modal.innerHTML = buildClientDetailHtml(client);
    modal.addEventListener("click", (e) => e.stopPropagation());

    overlay.appendChild(modal);
    document.body.appendChild(overlay);
    detailOverlay = overlay;

    document.body.classList.add("cust-detail-open");
    document.addEventListener("keydown", onDetailEscape);
    wireClientDetailModal(modal, client);

    tbody.querySelectorAll(".cust-row").forEach((tr) => {
      tr.classList.toggle("row-selected", tr.dataset.id === client.id);
    });
  }

  function syncOpenDetailModal() {
    if (!openClientId) return;
    const client = allClients.find((c) => c.id === openClientId);
    if (!client) {
      closeClientDetail();
      return;
    }
    openClientDetailModal(client);
  }

  function startEdit(client) {
    closeClientDetail();
    goToClientForm(client.id);
  }

  function syncAggregatesAndMetrics() {
    aggregates = buildClientAggregates(allProjects, allInvoices, allClients);
    renderMetrics(metricsRow, allClients, aggregates);
  }

  function viewClient(client) {
    openClientDetailModal(client);
  }

  function getFiltered() {
    return applyFilters(allClients, filters);
  }

  function refreshTable() {
    const filtered = getFiltered();
    const total = allClients.length;
    countEl.textContent = `Showing ${filtered.length} client${filtered.length === 1 ? "" : "s"}`;
    const duplicateIds = buildPossibleDuplicateIds(allClients);
    renderDirectoryTable(tbody, filtered, aggregates, duplicateIds, startEdit, viewClient);
    syncOpenDetailModal();
  }

  function syncFiltersFromInputs() {
    filters.query = searchInput.value;
    filters.name = filterName.value;
    filters.phone = filterPhone.value;
    filters.email = filterEmail.value;
    filters.clientType = filterType.value;
    filters.status = filterStatus.value;
    refreshTable();
  }

  [searchInput, filterName, filterPhone, filterEmail].forEach((el) => {
    el.oninput = syncFiltersFromInputs;
  });
  filterStatus.onchange = syncFiltersFromInputs;
  filterType.onchange = syncFiltersFromInputs;

  clearBtn.onclick = () => {
    searchInput.value = "";
    filterName.value = "";
    filterPhone.value = "";
    filterEmail.value = "";
    filterType.value = "all";
    filterStatus.value = "all";
    filters.query = "";
    filters.name = "";
    filters.phone = "";
    filters.email = "";
    filters.clientType = "all";
    filters.status = "all";
    closeClientDetail();
    refreshTable();
  };

  exportBtn.onclick = () => {
    const filtered = getFiltered();
    if (!filtered.length) {
      showToast("No clients to export", "error");
      return;
    }
    exportClientsCsv(filtered, projectMap, aggregates);
    showToast(`Exported ${filtered.length} clients`);
  };

  importBtn.onclick = () => {
    showToast("Import is available in the full ERP — demo mode uses seed data");
  };

  const unsubClients = listenList("clients", (items) => {
    allClients = items;
    syncAggregatesAndMetrics();
    refreshTable();
  });

  const unsubProjects = listenList("projects", (items) => {
    allProjects = items;
    projectMap.clear();
    items.forEach((p) => projectMap.set(p.id, p.name));
    syncAggregatesAndMetrics();
    refreshTable();
  });

  const unsubInvoices = listenList("clientInvoices", (items) => {
    allInvoices = items;
    syncAggregatesAndMetrics();
    refreshTable();
  });

  return {
    unmount: () => {
      closeClientDetail();
      unsubClients();
      unsubProjects();
      unsubInvoices();
    },
  };
}

export function mountCustomers(container) {
  return mountClients(container);
}
