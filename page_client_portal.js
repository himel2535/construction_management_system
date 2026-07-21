import { listenList } from "./svc_data.js";
import { readRef } from "./svc_tenant.js";
import { setActiveNav } from "./cmp_layout.js";
import { setPageChrome } from "./cmp_header.js";
import { statusChip, progressBar } from "./cmp_ui.js";
import { formatBDT } from "./util_format.js";
import { getCurrentRole, getRoleEntry } from "./svc_governance.js";
import { isGovProject, projectTypeLabel } from "./util_govProject.js";
import { enrichProjectList } from "./svc_projectDetails.js";
import {
  computeClientPortalStats,
  renderClientPortalKpiHtml,
  portalWidgetHtml,
} from "./cmp_clientPortalHub.js";

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function renderErrorCard(message) {
  return `<div class="dash-widget dash-widget--projects card portal-report-block"><div class="dash-widget-body portal-section-body"><p class="proj-empty">${escapeHtml(message)}</p></div></div>`;
}

export function mountClientPortal(container) {
  setActiveNav();
  setPageChrome({
    title: "Client Portal",
    subtitle: "View your project progress and billing — read only.",
    showDateRange: false,
  });

  const root = document.createElement("div");
  root.className = "client-portal-page dashboard-page dashboard-mockup";
  root.innerHTML = `
    <div id="portal-kpi-host" class="dash-kpi-row"></div>
    <div id="portal-body-host" class="portal-content-host"></div>`;
  container.appendChild(root);

  const kpiHost = root.querySelector("#portal-kpi-host");
  const bodyHost = root.querySelector("#portal-body-host");
  const state = {
    projects: [],
    invoices: [],
    milestones: [],
    client: null,
  };

  function loadMilestones(clientId) {
    const ms = [];
    for (const p of state.projects) {
      if (p.clientId !== clientId && p.clientName !== state.client?.name) continue;
      const bucket = readRef(`projectMilestones/${p.id}`) || {};
      Object.entries(bucket).forEach(([id, m]) => {
        ms.push({ id, ...m, projectName: p.name });
      });
    }
    state.milestones = ms.sort((a, b) => String(a.plannedDate).localeCompare(String(b.plannedDate)));
  }

  function renderProjectGrid(linkedProjects) {
    if (!linkedProjects.length) {
      return portalWidgetHtml("Your projects", "Progress and contract summary", `<p class="proj-empty">No projects linked to your account yet.</p>`);
    }
    const cards = linkedProjects
      .map(
        (p) => `
        <section class="dash-widget dash-widget--projects card portal-project-card">
          <div class="dash-widget-head">
            <h3 class="dash-widget-title">${escapeHtml(p.name)}</h3>
            <p class="dash-widget-sub">${escapeHtml(projectTypeLabel(p.projectType))} · ${escapeHtml(p.status || "ongoing")}</p>
          </div>
          <div class="dash-widget-body portal-section-body">
            <div class="progress-cell portal-progress-cell">${progressBar(p.progressPercent || 0)}<small>${p.progressPercent || 0}% complete</small></div>
            <dl class="portal-meta">
              <div><dt>Timeline</dt><dd>${escapeHtml(p.startDate || "—")} → ${escapeHtml(p.endDate || "—")}</dd></div>
              ${isGovProject(p) ? `<div><dt>Work order</dt><dd>${escapeHtml(p.workOrderNo || "—")}</dd></div>` : `<div><dt>Contract value</dt><dd>${formatBDT(p.contractValue || 0)}</dd></div>`}
            </dl>
          </div>
        </section>`
      )
      .join("");
    return `<div class="portal-project-grid">${cards}</div>`;
  }

  function renderBillingTable(bills) {
    const tableHtml = `
      <div class="table-wrap projects-table-wrap">
        <table class="dash-table projects-table portal-billing-table">
          <thead><tr><th>Project</th><th>Type</th><th class="text-right">Amount</th><th class="text-right">Paid</th><th class="text-right">Due</th><th>Due date</th><th class="cust-col-center">Status</th><th>Date</th></tr></thead>
          <tbody>
            ${bills.length
              ? bills
                  .map((b) => {
                    const due = Math.max(0, Number(b.amount || 0) - Number(b.paidAmount || 0));
                    return `<tr>
                  <td>${escapeHtml(b.projectName || "—")}</td>
                  <td>${escapeHtml(b.billType || "—")}</td>
                  <td class="text-right">${formatBDT(b.amount)}</td>
                  <td class="text-right">${formatBDT(b.paidAmount || 0)}</td>
                  <td class="text-right">${formatBDT(due)}</td>
                  <td>${escapeHtml(b.dueDate || "—")}</td>
                  <td class="cust-col-center">${statusChip(b.status || "draft")}</td>
                  <td>${escapeHtml(b.billDate || "—")}</td>
                </tr>`;
                  })
                  .join("")
              : '<tr class="empty-row"><td colspan="8">No bills yet</td></tr>'}
          </tbody>
        </table>
      </div>`;
    return portalWidgetHtml("Billing", "Invoices and payment status (read-only)", tableHtml);
  }

  function renderMilestonesSection() {
    const listHtml = `
      <ul class="portal-milestone-list">
        ${state.milestones.length
          ? state.milestones
              .slice(0, 8)
              .map(
                (m) => `
            <li class="portal-milestone-item">
              <strong>${escapeHtml(m.title)}</strong>
              <span class="portal-milestone-meta">${escapeHtml(m.projectName)} · deadline ${escapeHtml(m.plannedDate || "—")}</span>
              ${statusChip(m.status || "pending")}
            </li>`
              )
              .join("")
          : `<li class="proj-empty">No milestones scheduled</li>`}
      </ul>`;
    return portalWidgetHtml("Upcoming milestones", "Schedule across your projects", listHtml);
  }

  function render() {
    const role = getCurrentRole();
    const entry = getRoleEntry();
    const clientId = entry?.clientId;

    kpiHost.innerHTML = "";

    if (role !== "client") {
      bodyHost.innerHTML = renderErrorCard("Client portal is available for Client role users only.");
      return;
    }

    if (!clientId) {
      bodyHost.innerHTML = renderErrorCard(
        "No client record linked to this user. Ask admin to set clientId in Settings."
      );
      return;
    }

    if (state.client && state.client.portalAccessEnabled === false) {
      bodyHost.innerHTML = renderErrorCard(
        "Portal access has been disabled for your account. Contact your administrator."
      );
      return;
    }

    loadMilestones(clientId);
    const linkedProjects = state.projects.filter(
      (p) => p.clientId === clientId || p.clientName === state.client?.name
    );
    const bills = state.invoices.filter((b) => b.clientId === clientId);

    const stats = computeClientPortalStats({
      projects: linkedProjects,
      bills,
      milestones: state.milestones,
    });
    kpiHost.innerHTML = renderClientPortalKpiHtml(stats);

    const today = new Date().toISOString().slice(0, 10);
    const upcomingBills = bills
      .filter((b) => {
        if (b.status === "paid" || b.status === "cancelled") return false;
        const due = Math.max(0, Number(b.amount || 0) - Number(b.paidAmount || 0));
        return due > 0 && b.dueDate && b.dueDate >= today;
      })
      .sort((a, b) => String(a.dueDate).localeCompare(String(b.dueDate)));

    const dueBanner = upcomingBills.length
      ? `<div class="portal-due-banner card card-pad">
        <strong>Upcoming bill due dates</strong>
        <ul class="portal-due-list">
          ${upcomingBills
            .slice(0, 5)
            .map((b) => {
              const due = Math.max(0, Number(b.amount || 0) - Number(b.paidAmount || 0));
              return `<li>${escapeHtml(b.projectName || "Project")} — due ${escapeHtml(b.dueDate)} · ${formatBDT(due)} outstanding</li>`;
            })
            .join("")}
        </ul>
      </div>`
      : "";

    const hero = `<div class="portal-hero card card-pad">
        <h2 class="dash-widget-title">${escapeHtml(state.client?.name || "Client")}</h2>
        <p class="dash-widget-sub">${escapeHtml(state.client?.contractRef ? `Contract: ${state.client.contractRef}` : "Project owner portal")}</p>
      </div>`;

    bodyHost.innerHTML =
      dueBanner +
      hero +
      renderProjectGrid(linkedProjects) +
      renderBillingTable(bills) +
      renderMilestonesSection();
  }

  const unsubs = [
    listenList("clients", (list) => {
      const entry = getRoleEntry();
      state.client = list.find((c) => c.id === entry?.clientId) || null;
      render();
    }),
    listenList("projects", (list) => {
      state.projects = enrichProjectList(list);
      render();
    }),
    listenList("clientInvoices", (list) => {
      state.invoices = list;
      render();
    }),
  ];

  render();

  return { unmount: () => unsubs.forEach((u) => u()) };
}
