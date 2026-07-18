import { create, listenList, updatePath, propagateClientDenorm } from "./svc_data.js";

import { getCurrentUserId } from "./svc_auth.js";
import { readRef } from "./svc_tenant.js";
import { showToast } from "./cmp_toast.js";
import { setActiveNav } from "./cmp_layout.js";
import { setPageChrome } from "./cmp_header.js";
import { metricCard, sectionCard, statusChip } from "./cmp_ui.js";
import { icon } from "./cmp_icons.js";
import { formatDate } from "./util_format.js";

function initials(name) {
  const parts = String(name || "?").trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return (parts[0][0] || "?").toUpperCase();
}

/** Normalize phone for uniqueness checks (digits only). */
function normalizePhone(phone) {
  return String(phone || "").replace(/\D/g, "");
}

function isValidEmail(email) {
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

  host.innerHTML = "";
  host.append(
    metricCard({
      iconHtml: icon("users", { size: 18 }),
      iconTone: "metric-icon--blue",
      label: "Total Clients",
      value: String(total),
      subtext: total ? `${active} active ∑ ${inactive} inactive` : "No clients yet",
      showLink: false,
    }),
    metricCard({
      iconHtml: icon("calendarPlus", { size: 18 }),
      iconTone: "metric-icon--green",
      label: "Added This Month",
      value: String(addedMonth),
      subtext: addedMonth ? `${addedMonth} new this month` : "None added this month",
      showLink: false,
    }),
    metricCard({
      iconHtml: icon("userCheck", { size: 18 }),
      iconTone: "metric-icon--purple",
      label: "Active",
      value: String(active),
      subtext: total ? `${Math.round((active / total) * 100)}% of total` : "ù",
      showLink: false,
    }),
    metricCard({
      iconHtml: icon("mail", { size: 18 }),
      iconTone: "metric-icon--orange",
      label: "With Email",
      value: String(withEmail),
      subtext: withoutEmail ? `${withoutEmail} without email` : "All have email on file",
      showLink: false,
    })
  );
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
          <strong>${c.name}</strong>
        </div>
      </td>
      <td>${c.phone}</td>
      <td>${c.email ? c.email : '<span class="text-muted">ù</span>'}</td>
      <td>${statusChip(c.status || "active")}</td>
      <td class="col-date">${c.createdAt ? formatDate(c.createdAt) : '<span class="text-muted">ù</span>'}</td>
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

function fillProjectSelect(sel, projects, selectedId = "") {
  sel.innerHTML = '<option value="">No project</option>';
  projects.forEach((p) => {
    const o = document.createElement("option");
    o.value = p.id;
    o.textContent = p.name;
    if (p.id === selectedId) o.selected = true;
    sel.appendChild(o);
  });
}

function fillUnitSelect() {}

function validateClientForm(form, allClients, editId) {
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
  root.className = "customers-page dashboard-page";

  const metricsRow = document.createElement("div");
  metricsRow.className = "metrics-row";
  metricsRow.id = "cust-metrics";
  root.appendChild(metricsRow);

  const directoryCard = sectionCard(
    "Client Directory",
    "Search, filter, and manage project owners and employers"
  );
  const dirBody = directoryCard.querySelector(".section-card-body");

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
    <div class="toolbar-meta">
      <span class="toolbar-count" id="cust-count"></span>
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
  dirBody.append(toolbar, detailPanel, tableWrap);
  root.appendChild(directoryCard);

  const formCard = sectionCard("Add Client", "Create a new client or project owner record");
  formCard.id = "cust-form-section";
  formCard.classList.add("cust-form-card");
  const formBody = formCard.querySelector(".section-card-body");
  const form = document.createElement("form");
  form.className = "form-grid cust-form cust-form--full";
  form.innerHTML = `
    <input name="name" placeholder="Name *" required />
    <input name="phone" placeholder="Phone *" required />
    <input name="email" type="email" placeholder="Email" />
    <input name="nid" placeholder="NID / National ID" />
    <input name="contractRef" placeholder="Contract / work order ref" />
    <textarea name="address" placeholder="Address" rows="2"></textarea>
    <select name="projectId" id="cust-project" aria-label="Project">
      <option value="">No project</option>
    </select>
    <select name="status" aria-label="Status">
      <option value="active">Active</option>
      <option value="inactive">Inactive</option>
    </select>
    <div class="form-actions">
      <button type="submit" class="btn btn-primary" id="cust-submit">Add client</button>
      <button type="button" class="btn btn-dark" id="cust-cancel" hidden>Cancel</button>
    </div>
  `;
  formBody.appendChild(form);
  root.appendChild(formCard);

  container.appendChild(root);

  let editId = null;
  let editCreatedAt = null;
  let editCreatedBy = getCurrentUserId();
  let editPreviousName = "";
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
  const countEl = toolbar.querySelector("#cust-count");
  const tbody = tableWrap.querySelector("tbody");
  const submitBtn = form.querySelector("#cust-submit");
  const cancelBtn = form.querySelector("#cust-cancel");
  const formTitle = formCard.querySelector(".section-title");
  const formSub = formCard.querySelector(".section-sub");
  const projectSel = form.querySelector("#cust-project");

  function focusForm() {
    formCard.classList.add("is-focused");
    formCard.scrollIntoView({ behavior: "smooth", block: "start" });
    form.name.focus();
  }

  setPageChrome({
    title: "Clients / Owners",
    subtitle: "Manage project owners, employers, and contract contacts.",
    showDateRange: false,
    quickActionLabel: "+ Add New Client",
    onQuickAction: () => {
      resetForm();
      focusForm();
    },
  });

  function resetForm() {
    editId = null;
    editCreatedAt = null;
    editCreatedBy = getCurrentUserId();
    editPreviousName = "";
    form.reset();
    form.status.value = "active";
    fillProjectSelect(projectSel, allProjects);
    submitBtn.textContent = "Add client";
    cancelBtn.hidden = true;
    formCard.classList.remove("is-editing");
    formTitle.textContent = "Add Client";
    formSub.textContent = "Create a new client record";
    tbody.querySelectorAll(".cust-row").forEach((tr) => tr.classList.remove("row-selected"));
  }

  function populateForm(client) {
    form.name.value = client.name || "";
    form.phone.value = client.phone || "";
    form.email.value = client.email || "";
    form.address.value = client.address || "";
    form.nid.value = client.nid || "";
    form.contractRef.value = client.contractRef || "";
    form.status.value = client.status || "active";
    fillProjectSelect(projectSel, allProjects, client.projectId || "");
  }

  function startEdit(client) {
    editId = client.id;
    const existing = readRef(`clients/${client.id}`);
    editCreatedAt = existing?.createdAt ?? client.createdAt ?? Date.now();
    editCreatedBy = existing?.createdBy ?? client.createdBy ?? getCurrentUserId();
    editPreviousName = existing?.name ?? client.name ?? "";
    populateForm(client);
    submitBtn.textContent = "Save changes";
    cancelBtn.hidden = false;
    formCard.classList.add("is-editing", "is-focused");
    formTitle.textContent = "Edit Client";
    formSub.textContent = `Updating ${client.name}`;
    detailPanel.hidden = true;
    tbody.querySelectorAll(".cust-row").forEach((tr) => {
      tr.classList.toggle("row-selected", tr.dataset.id === client.id);
    });
    focusForm();
  }

  function renderDetailPanel(client) {
    const linkedBills = allInvoices.filter((b) => b.clientId === client.id);
    const projectLabel = client.projectId
      ? projectMap.get(client.projectId) || "ù"
      : "ù";

    detailPanel.hidden = false;
    detailPanel.innerHTML = `
      <div class="cust-detail-head">
        <div class="cust-detail-title">
          <span class="user-avatar sm">${initials(client.name)}</span>
          <div>
            <strong>${client.name}</strong>
            <span class="cust-detail-sub">${client.phone}${client.email ? ` ù ${client.email}` : ""}</span>
          </div>
        </div>
        <button type="button" class="icon-btn icon-btn--sm" id="cust-detail-close" aria-label="Close details">${icon("x", { size: 16 })}</button>
      </div>
      <div class="cust-detail-grid">
        <div><span class="cust-detail-label">Status</span>${statusChip(client.status || "active")}</div>
        <div><span class="cust-detail-label">Joined</span>${client.createdAt ? formatDate(client.createdAt) : "ù"}</div>
        <div><span class="cust-detail-label">NID</span>${client.nid || "ù"}</div>
        <div><span class="cust-detail-label">Contract ref</span>${client.contractRef || "ù"}</div>
        <div><span class="cust-detail-label">Project</span>${projectLabel}</div>
        <div><span class="cust-detail-label">Bills</span>${linkedBills.length} invoice${linkedBills.length === 1 ? "" : "s"}</div>
      </div>
      ${client.address ? `<p class="cust-detail-address"><span class="cust-detail-label">Address</span> ${client.address}</p>` : ""}
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
    if (editId) {
      tbody.querySelectorAll(".cust-row").forEach((tr) => {
        tr.classList.toggle("row-selected", tr.dataset.id === editId);
      });
    }
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
    showToast("Import is available in the full ERP ù demo mode uses seed data");
  };

  cancelBtn.onclick = resetForm;

  form.onsubmit = async (e) => {
    e.preventDefault();
    const validation = validateClientForm(form, allClients, editId);
    if (!validation.ok) {
      showToast(validation.message, "error");
      return;
    }

    const now = Date.now();
    const payload = {
      ...validation.data,
      updatedAt: now,
      createdBy: editId ? editCreatedBy : getCurrentUserId(),
    };

    try {
      if (editId) {
        await updatePath(`clients/${editId}`, {
          ...payload,
          createdAt: editCreatedAt,
        });
        if (payload.name !== editPreviousName) {
          await propagateClientDenorm(editId, payload.name);
        }
        resetForm();
        showToast("Client updated");
      } else {
        await create("clients", {
          ...payload,
          createdAt: now,
        });
        form.reset();
        form.status.value = "active";
        fillProjectSelect(projectSel, allProjects);
        showToast("Client added");
      }
    } catch (err) {
      showToast(err.message, "error");
    }
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
    if (!editId) fillProjectSelect(projectSel, items);
    else fillProjectSelect(projectSel, items, form.projectId.value);
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
