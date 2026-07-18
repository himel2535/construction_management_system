import { listenList } from "./svc_data.js";
import { readRef } from "./svc_tenant.js";
import { setActiveNav } from "./cmp_layout.js";
import { setPageChrome } from "./cmp_header.js";
import { statusChip, progressBar } from "./cmp_ui.js";
import { formatBDT } from "./util_format.js";
import { getCurrentRole, getRoleEntry } from "./svc_governance.js";
import { isGovProject, projectTypeLabel } from "./util_govProject.js";
import { enrichProjectList } from "./svc_projectDetails.js";

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export function mountClientPortal(container) {
  setActiveNav();
  setPageChrome({
    title: "Client Portal",
    subtitle: "View your project progress and billing — read only.",
    showDateRange: false,
  });

  const root = document.createElement("div");
  root.className = "page-content client-portal-page";
  root.innerHTML = `<div id="portal-host"><p class="proj-empty">Loading portal...</p></div>`;
  container.appendChild(root);

  const host = root.querySelector("#portal-host");
  const state = {
    projects: [],
    invoices: [],
    milestones: [],
    client: null,
  };

  function loadMilestones() {
    const entry = getRoleEntry();
    const clientId = entry?.clientId;
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

  function render() {
    const role = getCurrentRole();
    const entry = getRoleEntry();
    const clientId = entry?.clientId;

    if (role !== "client") {
      host.innerHTML = `<div class="card card-pad"><p class="proj-empty">Client portal is available for Client role users only.</p></div>`;
      return;
    }

    if (!clientId) {
      host.innerHTML = `<div class="card card-pad"><p class="proj-empty">No client record linked to this user. Ask admin to set clientId in Settings.</p></div>`;
      return;
    }

    loadMilestones();
    const linkedProjects = state.projects.filter(
      (p) => p.clientId === clientId || p.clientName === state.client?.name
    );
    const bills = state.invoices.filter((b) => b.clientId === clientId);

    const today = new Date().toISOString().slice(0, 10);
    const upcomingBills = bills.filter((b) => {
      if (b.status === "paid" || b.status === "cancelled") return false;
      const due = Math.max(0, Number(b.amount || 0) - Number(b.paidAmount || 0));
      return due > 0 && b.dueDate && b.dueDate >= today;
    }).sort((a, b) => String(a.dueDate).localeCompare(String(b.dueDate)));

    host.innerHTML = `
      ${upcomingBills.length ? `
      <div class="portal-due-banner card card-pad">
        <strong>Upcoming bill due dates</strong>
        <ul class="portal-due-list">
          ${upcomingBills.slice(0, 5).map((b) => {
            const due = Math.max(0, Number(b.amount || 0) - Number(b.paidAmount || 0));
            return `<li>${escapeHtml(b.projectName || "Project")} — due ${escapeHtml(b.dueDate)} · ${formatBDT(due)} outstanding</li>`;
          }).join("")}
        </ul>
      </div>` : ""}
      <div class="portal-hero card card-pad">
        <h2 class="section-title">${escapeHtml(state.client?.name || "Client")}</h2>
        <p class="section-sub">${escapeHtml(state.client?.contractRef ? `Contract: ${state.client.contractRef}` : "Project owner portal")}</p>
      </div>
      <div class="portal-grid">
        ${linkedProjects.length ? linkedProjects.map((p) => `
          <section class="card card-pad portal-project-card">
            <h3 class="section-title">${escapeHtml(p.name)}</h3>
            <p class="section-sub">${escapeHtml(projectTypeLabel(p.projectType))} · ${escapeHtml(p.status || "ongoing")}</p>
            <div class="progress-cell">${progressBar(p.progressPercent || 0)}<small>${p.progressPercent || 0}% complete</small></div>
            <dl class="portal-meta">
              <div><dt>Timeline</dt><dd>${escapeHtml(p.startDate || "—")} → ${escapeHtml(p.endDate || "—")}</dd></div>
              ${isGovProject(p) ? `<div><dt>Work order</dt><dd>${escapeHtml(p.workOrderNo || "—")}</dd></div>` : `<div><dt>Contract value</dt><dd>${formatBDT(p.contractValue || 0)}</dd></div>`}
            </dl>
          </section>
        `).join("") : `<div class="card card-pad"><p class="proj-empty">No projects linked to your account yet.</p></div>`}
      </div>
      <section class="card card-pad" style="margin-top:1rem">
        <h3 class="section-title">Billing</h3>
        <div class="table-wrap">
          <table class="dash-table">
            <thead><tr><th>Project</th><th>Type</th><th class="text-right">Amount</th><th class="text-right">Paid</th><th class="text-right">Due</th><th>Due date</th><th>Status</th><th>Date</th></tr></thead>
            <tbody>
              ${bills.length ? bills.map((b) => {
                const due = Math.max(0, Number(b.amount || 0) - Number(b.paidAmount || 0));
                return `<tr>
                  <td>${escapeHtml(b.projectName || "—")}</td>
                  <td>${escapeHtml(b.billType || "—")}</td>
                  <td class="text-right">${formatBDT(b.amount)}</td>
                  <td class="text-right">${formatBDT(b.paidAmount || 0)}</td>
                  <td class="text-right">${formatBDT(due)}</td>
                  <td>${escapeHtml(b.dueDate || "—")}</td>
                  <td>${statusChip(b.status || "draft")}</td>
                  <td>${escapeHtml(b.billDate || "—")}</td>
                </tr>`;
              }).join("") : '<tr class="empty-row"><td colspan="8">No bills yet</td></tr>'}
            </tbody>
          </table>
        </div>
      </section>
      <section class="card card-pad" style="margin-top:1rem">
        <h3 class="section-title">Upcoming milestones</h3>
        <ul class="portal-milestone-list">
          ${state.milestones.length ? state.milestones.slice(0, 8).map((m) => `
            <li><strong>${escapeHtml(m.title)}</strong> — ${escapeHtml(m.projectName)} · deadline ${escapeHtml(m.plannedDate || "—")} · ${statusChip(m.status || "pending")}</li>
          `).join("") : `<li class="proj-empty">No milestones scheduled</li>`}
        </ul>
      </section>
    `;
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
