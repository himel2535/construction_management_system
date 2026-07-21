import { listenList } from "./svc_data.js";
import { createClientInvoice, updateClientInvoiceStatus } from "./svc_operations.js";
import { formatBDT } from "./util_format.js";
import { showToast } from "./cmp_toast.js";
import { setActiveNav } from "./cmp_layout.js";
import { setPageChrome } from "./cmp_header.js";
import { openCustFormDialog, escapeHtml } from "./cmp_projectTab.js";
import { renderPagination, statusChip } from "./cmp_moduleHub.js";
import { icon } from "./cmp_icons.js";
import { kpiIcon } from "./cmp_dashboardIcons.js";
import { guardAction, canPerformAction } from "./svc_governance.js";
import { paginateSlice } from "./util_inventory.js";

const BILL_TYPES = [
  { value: "milestone", label: "Milestone bill" },
  { value: "progress", label: "Progress / RA bill" },
  { value: "final", label: "Final bill" },
];

const TABS = [
  { id: "all", label: "All bills" },
  { id: "draft", label: "Draft" },
  { id: "submitted", label: "Submitted" },
  { id: "approved", label: "Approved" },
  { id: "paid", label: "Paid" },
];

function billTypeLabel(value) {
  return BILL_TYPES.find((t) => t.value === value)?.label || value || "—";
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function invoiceBalance(inv) {
  if (!inv || inv.status === "cancelled" || inv.status === "paid") return 0;
  return Math.max(0, Number(inv.amount || 0) - Number(inv.paidAmount || 0));
}

function billingSparklineSvg(values = [], tone = "green") {
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

function renderBillingTabBar(tabs, activeId, onSelect) {
  const wrap = document.createElement("div");
  wrap.className = "proj-tab-subnav bill-pill-tabs bill-pill-tabs--billing-main";
  for (const t of tabs) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = `proj-tab bill-tab-pill bill-tab-pill--${t.id}${activeId === t.id ? " is-active" : ""}`;
    btn.textContent = t.label;
    btn.onclick = () => onSelect(t.id);
    wrap.appendChild(btn);
  }
  return wrap;
}

function billActions(row) {
  const status = row.status || "draft";
  const parts = [];
  if (status === "draft" && canPerformAction("submit_billing")) {
    parts.push(
      `<button type="button" class="btn btn-ghost btn-sm bill-act" data-id="${escapeHtml(row.id)}" data-act="submitted">Submit</button>`
    );
  }
  if (status === "submitted" && canPerformAction("approve_billing")) {
    parts.push(
      `<button type="button" class="btn btn-primary btn-sm bill-act" data-id="${escapeHtml(row.id)}" data-act="approved">Approve</button>`
    );
  }
  if ((status === "approved" || status === "partial") && canPerformAction("approve_billing")) {
    const due = Math.max(0, Number(row.amount || 0) - Number(row.paidAmount || 0));
    if (due > 0) {
      parts.push(
        `<button type="button" class="btn btn-ghost btn-sm bill-act" data-id="${escapeHtml(row.id)}" data-act="record-payment">Record full payment</button>`
      );
    }
  }
  return parts.join(" ") || "—";
}

export function mountBilling(container) {
  setActiveNav();
  setPageChrome({
    title: "Billing & Invoicing",
    subtitle: "Client bills, progress billing, and payment tracking.",
    showDateRange: false,
    quickActionLabel: "",
    onQuickAction: null,
  });

  const root = document.createElement("div");
  root.className = "billing-page dashboard-page dashboard-mockup";
  container.appendChild(root);

  const state = {
    clients: [],
    projects: [],
    invoices: [],
    activeTab: "all",
    filterQuery: "",
    listPage: 1,
    listPageSize: 10,
  };

  let kpiHost = null;
  let tabHost = null;
  let contentHost = null;

  function filteredInvoices() {
    let list = [...state.invoices].sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    const tab = state.activeTab;
    if (tab === "draft") list = list.filter((r) => (r.status || "draft") === "draft");
    else if (tab === "submitted") list = list.filter((r) => r.status === "submitted");
    else if (tab === "approved") list = list.filter((r) => r.status === "approved" || r.status === "partial");
    else if (tab === "paid") list = list.filter((r) => r.status === "paid");

    const q = state.filterQuery.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (r) =>
          String(r.clientName || "").toLowerCase().includes(q) ||
          String(r.projectName || "").toLowerCase().includes(q) ||
          String(r.description || "").toLowerCase().includes(q) ||
          String(billTypeLabel(r.billType)).toLowerCase().includes(q)
      );
    }
    return list;
  }

  function computeKpiMetrics() {
    const inv = state.invoices;
    const draft = inv.filter((r) => (r.status || "draft") === "draft").length;
    const submitted = inv.filter((r) => r.status === "submitted").length;
    const outstanding = inv
      .filter((r) => r.status === "approved" || r.status === "partial")
      .reduce((sum, r) => sum + invoiceBalance(r), 0);
    return { total: inv.length, draft, submitted, outstanding };
  }

  function renderKpiStrip() {
    if (!kpiHost) return;
    const { total, draft, submitted, outstanding } = computeKpiMetrics();

    const cards = [
      {
        label: "Total bills",
        value: String(total),
        iconKey: "projects",
        tone: "blue",
        footLeft: total ? "Client invoices on file" : "No bills yet",
        spark: billingSparklineSvg([2, total || 1, total || 2, total || 3, 2, 2, 2], "blue"),
      },
      {
        label: "Draft",
        value: String(draft),
        iconKey: "collection",
        tone: "green",
        footLeft: draft ? "Awaiting submit" : "None in draft",
        spark: billingSparklineSvg([draft || 1, draft, draft, 1, 1, 1, 1], "green"),
      },
      {
        label: "Pending approval",
        value: String(submitted),
        iconKey: "expense",
        tone: submitted ? "orange" : "green",
        footLeft: submitted ? "Submitted for review" : "None pending",
        spark: billingSparklineSvg([submitted || 1, submitted, submitted, 1, 1, 1, 1], submitted ? "orange" : "green"),
      },
      {
        label: "Outstanding",
        value: formatBDT(outstanding),
        iconKey: "receivable",
        tone: outstanding ? "teal" : "green",
        footLeft: outstanding ? "Approved / partial due" : "Nothing due",
        spark: billingSparklineSvg([2, outstanding ? 4 : 2, 3, outstanding ? 5 : 2, 3, 2, 2], "teal"),
      },
    ];

    kpiHost.className = "dash-kpi-row bill-kpi-host";
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

  function openCreateBillDialog() {
    openCustFormDialog({
      title: "Create bill",
      subtitle: "Saved as draft — submit from the list when ready.",
      modalClass: "bill-invoice-modal",
      submitLabel: "Create bill (draft)",
      values: {
        clientId: "",
        projectId: "",
        billType: "milestone",
        amount: "",
        paidAmount: "",
        billDate: todayISO(),
        description: "",
      },
      sections: [
        {
          title: "Client & project",
          fields: [
            {
              name: "clientId",
              label: "Client / owner *",
              type: "select",
              required: true,
              options: [
                { value: "", label: "Select client" },
                ...state.clients.map((c) => ({
                  value: c.id,
                  label: `${c.name}${c.phone ? ` · ${c.phone}` : ""}`.trim(),
                })),
              ],
            },
            {
              name: "projectId",
              label: "Project *",
              type: "select",
              required: true,
              options: [
                { value: "", label: "Select project" },
                ...state.projects.map((p) => ({ value: p.id, label: p.name })),
              ],
            },
          ],
        },
        {
          title: "Bill details",
          fields: [
            {
              name: "billType",
              label: "Bill type",
              type: "select",
              options: BILL_TYPES.map((t) => ({ value: t.value, label: t.label })),
            },
            { name: "amount", label: "Bill amount *", type: "number", step: "0.01", min: 0, required: true },
            { name: "paidAmount", label: "Payment received", type: "number", step: "0.01", min: 0 },
            { name: "billDate", label: "Bill date", type: "date" },
            { name: "description", label: "Description / bill ref", fullWidth: true },
          ],
        },
      ],
      onSave: async (vals) => {
        const client = state.clients.find((c) => c.id === vals.clientId);
        const project = state.projects.find((p) => p.id === vals.projectId);
        if (!client || !project) {
          showToast("Select a valid client and project", "error");
          throw new Error("validation");
        }
        const amount = Number(vals.amount);
        if (!Number.isFinite(amount) || amount <= 0) {
          showToast("Enter a valid bill amount", "error");
          throw new Error("validation");
        }
        try {
          await createClientInvoice({
            client,
            project,
            billType: vals.billType,
            amount,
            paidAmount: Number(vals.paidAmount) || 0,
            billDate: vals.billDate,
            description: String(vals.description || "").trim(),
          });
          showToast("Bill created as draft");
        } catch (err) {
          showToast(err.message, "error");
          throw err;
        }
      },
    });
  }

  function wireBillActions(section) {
    section.querySelectorAll(".bill-act").forEach((btn) => {
      btn.onclick = async () => {
        const row = state.invoices.find((x) => x.id === btn.dataset.id);
        if (!row) return;
        try {
          if (btn.dataset.act === "record-payment") {
            guardAction("approve_billing");
            const amount = Number(row.amount || 0);
            await updateClientInvoiceStatus(row.id, "paid", { paidAmount: amount });
            showToast("Payment recorded — bill paid");
            return;
          }
          if (btn.dataset.act === "submitted") {
            guardAction("submit_billing");
            await updateClientInvoiceStatus(row.id, "submitted");
            showToast("Bill submitted for approval");
            return;
          }
          if (btn.dataset.act === "approved") {
            guardAction("approve_billing");
            await updateClientInvoiceStatus(row.id, "approved");
            showToast("Bill approved");
          }
        } catch (err) {
          showToast(err.message, "error");
        }
      };
    });
  }

  function renderBillsTab() {
    const wrap = document.createElement("div");
    wrap.className = "bill-tab-panel";

    const list = filteredInvoices();
    const page = paginateSlice(list, state.listPage, state.listPageSize);
    if (page.page !== state.listPage) state.listPage = page.page;

    const section = document.createElement("section");
    section.className = "dash-widget dash-widget--projects card bill-report-block";
    section.innerHTML = `
      <div class="dash-widget-head dash-widget-head--split">
        <div>
          <h3 class="dash-widget-title">Client bills</h3>
          <p class="dash-widget-sub">Draft → submitted → approved → paid</p>
        </div>
        <span class="cust-toolbar-count">Showing ${page.total} bill${page.total === 1 ? "" : "s"}</span>
      </div>
      <div class="dash-widget-body">
        <div class="toolbar-row projects-toolbar billing-toolbar" id="bill-list-toolbar">
          <div class="toolbar-actions" style="width:100%;justify-content:flex-end;">
            <div class="cust-toolbar-search toolbar-search">
              <span class="search-icon" aria-hidden="true">${icon("search", { size: 18 })}</span>
              <input type="search" class="cust-toolbar-search-input" id="bill-list-search" placeholder="Search bills..." autocomplete="off" value="${escapeHtml(state.filterQuery)}" />
            </div>
            <div class="cust-toolbar-btn-group">
              <button type="button" class="btn btn-ghost btn-sm cust-toolbar-btn cust-toolbar-btn--clear" id="bill-clear-search" title="Clear search">${icon("rotateCcw", { size: 16 })} Clear</button>
              <button type="button" class="btn btn-primary btn-sm" id="bill-create">+ Create bill</button>
            </div>
          </div>
        </div>
        <div class="bill-list-content-host"></div>
      </div>
    `;

    const contentHostEl = section.querySelector(".bill-list-content-host");

    if (!page.items.length) {
      const empty = document.createElement("p");
      empty.className = "proj-empty";
      empty.textContent = state.invoices.length ? "No bills match your filters" : "No bills yet — create your first bill.";
      contentHostEl.appendChild(empty);
    } else {
      const desktop = document.createElement("div");
      desktop.className = "table-wrap projects-table-wrap";
      desktop.innerHTML = `
        <table class="dash-table projects-table billing-table">
          <thead>
            <tr>
              <th>Client</th><th>Project</th><th>Type</th>
              <th class="cust-col-center">Amount</th><th class="cust-col-center">Paid</th>
              <th>Date</th><th class="cust-col-center">Status</th><th class="cust-col-center">Action</th>
            </tr>
          </thead>
          <tbody>
            ${page.items
              .map(
                (row) => `<tr>
              <td>${escapeHtml(row.clientName || "—")}</td>
              <td>${escapeHtml(row.projectName || "—")}</td>
              <td>${escapeHtml(billTypeLabel(row.billType))}</td>
              <td class="cust-col-center">${formatBDT(row.amount)}</td>
              <td class="cust-col-center">${formatBDT(row.paidAmount || 0)}</td>
              <td>${escapeHtml(row.billDate || "—")}</td>
              <td class="cust-col-center">${statusChip(row.status || "draft")}</td>
              <td class="cust-col-center proj-row-actions-cell">${billActions(row)}</td>
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

    const toolbar = section.querySelector("#bill-list-toolbar");
    toolbar.querySelector("#bill-list-search").oninput = (e) => {
      state.filterQuery = e.target.value;
      state.listPage = 1;
      renderContent();
    };
    toolbar.querySelector("#bill-clear-search").onclick = () => {
      state.filterQuery = "";
      state.listPage = 1;
      renderContent();
    };
    toolbar.querySelector("#bill-create").onclick = () => openCreateBillDialog();

    wireBillActions(section);

    return wrap;
  }

  function renderTabs() {
    if (!tabHost) return;
    tabHost.innerHTML = "";
    tabHost.appendChild(
      renderBillingTabBar(TABS, state.activeTab, (tab) => {
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
    contentHost.appendChild(renderBillsTab());
  }

  function render() {
    renderKpiStrip();
    renderTabs();
    renderContent();
  }

  function ensureLayout() {
    root.innerHTML = `
      <div id="bill-metrics" class="bill-kpi-host"></div>
      <div class="bill-tab-host"></div>
      <div class="bill-content-host"></div>
    `;
    kpiHost = root.querySelector("#bill-metrics");
    tabHost = root.querySelector(".bill-tab-host");
    contentHost = root.querySelector(".bill-content-host");
  }

  ensureLayout();
  render();

  const unsubClients = listenList("clients", (list) => {
    state.clients = list.filter((c) => (c.status || "active") === "active");
    renderKpiStrip();
    if (contentHost?.childElementCount) renderContent();
  });

  const unsubProjects = listenList("projects", (list) => {
    state.projects = list;
    if (contentHost?.childElementCount) renderContent();
  });

  const unsubInvoices = listenList("clientInvoices", (list) => {
    state.invoices = list;
    render();
  });

  return {
    unmount: () => {
      unsubInvoices();
      unsubClients();
      unsubProjects();
    },
  };
}

export function mountSales(container) {
  return mountBilling(container);
}
