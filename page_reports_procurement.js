/** §2.6.3 Procurement & stock reports */

import { listenList, listenValue } from "./svc_data.js";
import { formatBDT } from "./util_format.js";
import { statusChip } from "./cmp_ui.js";
import { listLowStock } from "./util_inventory.js";
import {
  consumptionBySite,
  issuedVsUsedVariance,
  rollupSiteLedger,
  accountabilityForSiteInCharge,
} from "./util_stockLedger.js";

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
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

export function mountProcurementStockReports(host) {
  const state = {
    materials: [],
    projects: [],
    siteInCharges: [],
    usageByProject: {},
    vouchersByProject: {},
    mrsByProject: {},
    filters: {
      dateFrom: "",
      dateTo: "",
      projectId: "all",
      materialId: "all",
      sicId: "all",
    },
  };

  host.className = "card card-pad";
  host.style.marginTop = "1rem";
  host.innerHTML = `
    <h3 class="section-title">Procurement &amp; stock (§2.6)</h3>
    <p class="text-muted">PO workflow lives on Purchases. Central stock: GRN → issue voucher → site usage.</p>
    <div class="form-grid proj-form-inline" id="stock-report-filters">
      <label>From <input type="date" id="sr-from" /></label>
      <label>To <input type="date" id="sr-to" /></label>
      <label>Site <select id="sr-project"><option value="all">All sites</option></select></label>
      <label>Material <select id="sr-material"><option value="all">All items</option></select></label>
      <label>Site in-charge <select id="sr-sic"><option value="all">All</option></select></label>
      <button type="button" class="btn btn-primary btn-sm" id="sr-apply">Apply filters</button>
    </div>
    <div id="sr-consumption" class="stock-report-block"></div>
    <div id="sr-variance" class="stock-report-block"></div>
    <div id="sr-accountability" class="stock-report-block"></div>
    <div id="sr-lowstock" class="stock-report-block"></div>
  `;

  function render() {
    const f = state.filters;
    const projOpts = state.projects.map(
      (p) => `<option value="${p.id}" ${f.projectId === p.id ? "selected" : ""}>${escapeHtml(p.name)}</option>`
    );
    host.querySelector("#sr-project").innerHTML = `<option value="all">All sites</option>${projOpts}`;
    const matOpts = state.materials.map(
      (m) => `<option value="${m.id}" ${f.materialId === m.id ? "selected" : ""}>${escapeHtml(m.name)}</option>`
    );
    host.querySelector("#sr-material").innerHTML = `<option value="all">All items</option>${matOpts}`;
    const sicOpts = state.siteInCharges.map(
      (s) => `<option value="${s.id}" ${f.sicId === s.id ? "selected" : ""}>${escapeHtml(s.name)}</option>`
    );
    host.querySelector("#sr-sic").innerHTML = `<option value="all">All</option>${sicOpts}`;
    host.querySelector("#sr-from").value = f.dateFrom;
    host.querySelector("#sr-to").value = f.dateTo;

    const consumption = consumptionBySite(state.usageByProject, state.projects, f);
    host.querySelector("#sr-consumption").innerHTML = `
      <h4 class="sup-section-title">Site-wise consumption</h4>
      ${consumption.length ? `<table class="dash-table"><thead><tr><th>Date</th><th>Site</th><th>Material</th><th>Used</th><th>Wasted</th><th>Task</th></tr></thead><tbody>${consumption
        .slice(0, 50)
        .map(
          (r) => `<tr><td>${escapeHtml(r.logDate)}</td><td>${escapeHtml(r.projectName)}</td><td>${escapeHtml(r.materialName)}</td><td>${r.qtyUsed}</td><td>${r.qtyWasted}</td><td>${escapeHtml(r.usedFor || "—")}</td></tr>`
        )
        .join("")}</tbody></table>` : `<p class="proj-empty">No consumption for filters</p>`}`;

    const varianceRows = [];
    for (const [pid, logs] of Object.entries(state.usageByProject)) {
      if (f.projectId !== "all" && pid !== f.projectId) continue;
      const vouchers = state.vouchersByProject[pid] || [];
      const ledger = rollupSiteLedger(pid, vouchers, logs);
      varianceRows.push(...issuedVsUsedVariance(ledger));
    }
    host.querySelector("#sr-variance").innerHTML = `
      <h4 class="sup-section-title">Issued vs used variance</h4>
      ${varianceRows.length ? `<table class="dash-table"><thead><tr><th>Site</th><th>Material</th><th>Issued</th><th>Used+Wasted</th><th>Balance</th></tr></thead><tbody>${varianceRows
        .map((r) => {
          const proj = state.projects.find((p) => p.id === r.projectId);
          const cls = r.flagged ? "variance-warn-row" : "";
          return `<tr class="${cls}"><td>${escapeHtml(proj?.name || r.projectId)}</td><td>${escapeHtml(r.materialName)}</td><td>${r.qtyIssued}</td><td>${r.qtyUsed + r.qtyWasted}</td><td class="${r.flagged ? "sic-variance-warn" : ""}">${r.variance}</td></tr>`;
        })
        .join("")}</tbody></table>` : `<p class="proj-empty">No variance rows</p>`}`;

    const sicId = f.sicId === "all" ? state.siteInCharges[0]?.id : f.sicId;
    const acc = sicId
      ? accountabilityForSiteInCharge(sicId, {
          mrsByProject: state.mrsByProject,
          vouchersByProject: state.vouchersByProject,
          usageLogsByProject: state.usageByProject,
          projects: state.projects,
        })
      : [];
    const sicName = state.siteInCharges.find((s) => s.id === sicId)?.name || "—";
    host.querySelector("#sr-accountability").innerHTML = `
      <h4 class="sup-section-title">Site in-charge accountability — ${escapeHtml(sicName)}</h4>
      ${acc.length ? `<table class="dash-table"><thead><tr><th>Date</th><th>Type</th><th>Site</th><th>Detail</th><th>Status</th></tr></thead><tbody>${acc
        .slice(0, 30)
        .map(
          (a) => `<tr><td>${escapeHtml(a.date || "—")}</td><td>${escapeHtml(a.type)}</td><td>${escapeHtml(a.projectName)}</td><td>${escapeHtml(a.label)}</td><td>${statusChip(a.status)}</td></tr>`
        )
        .join("")}</tbody></table>` : `<p class="proj-empty">No records for selected person</p>`}`;

    const low = listLowStock(state.materials);
    host.querySelector("#sr-lowstock").innerHTML = `
      <h4 class="sup-section-title">Central low-stock alert</h4>
      ${low.length ? `<table class="dash-table"><thead><tr><th>Material</th><th>Stock</th><th>Reorder</th><th>Shortfall</th></tr></thead><tbody>${low
        .map((m) => {
          const shortfall = Math.max(0, (Number(m.reorderLevel) || 0) - (Number(m.currentStock) || 0));
          return `<tr class="variance-warn-row"><td>${escapeHtml(m.name)}</td><td>${m.currentStock}</td><td>${m.reorderLevel}</td><td>${shortfall}</td></tr>`;
        })
        .join("")}</tbody></table>` : `<p class="proj-empty">All materials above reorder level</p>`}`;
  }

  host.querySelector("#sr-apply").onclick = () => {
    state.filters = {
      dateFrom: host.querySelector("#sr-from").value,
      dateTo: host.querySelector("#sr-to").value,
      projectId: host.querySelector("#sr-project").value,
      materialId: host.querySelector("#sr-material").value,
      sicId: host.querySelector("#sr-sic").value,
    };
    render();
  };

  const unsubs = [
    listenList("inventoryMaterials", (list) => {
      state.materials = list;
      render();
    }),
    listenList("projects", (list) => {
      state.projects = list;
      render();
    }),
    listenList("siteInCharges", (list) => {
      state.siteInCharges = list;
      render();
    }),
    listenValue("siteMaterialLogs", (root) => {
      state.usageByProject = parseNestedByProject(root);
      render();
    }),
    listenValue("issueVouchers", (root) => {
      state.vouchersByProject = parseNestedByProject(root);
      render();
    }),
    listenValue("materialRequests", (root) => {
      state.mrsByProject = parseNestedByProject(root);
      render();
    }),
  ];

  render();

  return () => unsubs.forEach((u) => u());
}
