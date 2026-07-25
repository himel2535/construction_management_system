import { listenList } from "./svc_data.js";
import { readRef } from "./svc_tenant.js";
import { setActiveNav } from "./cmp_layout.js";
import { setPageChrome } from "./cmp_header.js";
import { getCurrentRole, getRoleEntry } from "./svc_governance.js";
import { enrichProjectList } from "./svc_projectDetails.js";
import {
  computeClientPortalStats,
  renderClientPortalKpiHtml,
  renderPortalHeroHtml,
  renderPortalProjectsSectionHtml,
  renderPortalBillingHtml,
  renderPortalMilestonesHtml,
} from "./cmp_clientPortalHub.js";

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function renderErrorCard(message) {
  return `<div class="card card-pad portal-access-notice"><p class="proj-empty">${escapeHtml(message)}</p></div>`;
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

  function setKpiHostVisible(visible) {
    kpiHost.hidden = !visible;
  }

  function render() {
    const role = getCurrentRole();
    const entry = getRoleEntry();
    const clientId = entry?.clientId;

    kpiHost.innerHTML = "";

    if (role !== "client") {
      setKpiHostVisible(false);
      bodyHost.innerHTML = renderErrorCard("Client portal is available for Client role users only.");
      return;
    }

    if (!clientId) {
      setKpiHostVisible(false);
      bodyHost.innerHTML = renderErrorCard(
        "No client record linked to this user. Ask admin to set clientId in Settings."
      );
      return;
    }

    if (state.client && state.client.portalAccessEnabled === false) {
      setKpiHostVisible(false);
      bodyHost.innerHTML = renderErrorCard(
        "Portal access has been disabled for your account. Contact your administrator."
      );
      return;
    }

    setKpiHostVisible(true);
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

    bodyHost.innerHTML = `
      ${renderPortalHeroHtml(state.client, upcomingBills)}
      <div class="portal-main-grid">
        <div class="portal-main-col portal-main-col--projects">
          ${renderPortalProjectsSectionHtml(linkedProjects)}
        </div>
        <div class="portal-main-col portal-main-col--side">
          ${renderPortalBillingHtml(bills)}
          ${renderPortalMilestonesHtml(state.milestones)}
        </div>
      </div>`;
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
