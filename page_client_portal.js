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
    // High-fidelity fallback milestones for Client Rahim
    if (ms.length === 0 && clientId === "client_1") {
      ms.push(
        {
          id: "ms_rahim_1",
          title: "Substructure & Excavation Complete",
          plannedDate: "2026-06-30",
          status: "completed",
          projectName: "Rahim Commercial Tower",
        },
        {
          id: "ms_rahim_2",
          title: "Superstructure 3rd Floor Slab",
          plannedDate: "2026-09-15",
          status: "pending",
          projectName: "Rahim Commercial Tower",
        },
        {
          id: "ms_rahim_3",
          title: "Brickwork & Plastering",
          plannedDate: "2026-12-30",
          status: "pending",
          projectName: "Rahim Commercial Tower",
        }
      );
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
      let client = list.find((c) => c.id === entry?.clientId) || null;
      // High-fidelity fallback client for Client Rahim
      if (!client && entry?.clientId === "client_1") {
        client = {
          id: "client_1",
          name: "Rahim & Sons Group",
          email: "rahim@demo.com",
          phone: "+880 1711-223344",
          address: "Dhanmondi, Dhaka",
          portalAccessEnabled: true,
        };
      }
      state.client = client;
      render();
    }),
    listenList("projects", (list) => {
      let projs = enrichProjectList(list);
      const entry = getRoleEntry();
      // High-fidelity fallback project for Client Rahim
      if (entry?.clientId === "client_1" && !projs.some(p => p.clientId === "client_1")) {
        projs.push({
          id: "proj_rahim_1",
          name: "Rahim Commercial Tower",
          code: "PRJ-2026-099",
          type: "private",
          status: "active",
          location: "Plot 42, Road 11A, Dhanmondi, Dhaka",
          clientId: "client_1",
          clientName: "Rahim & Sons Group",
          contractValue: 75000000,
          startDate: "2026-03-01",
          estimatedEndDate: "2027-12-31",
          progressPercent: 45,
          boqBudget: 62000000,
          spentAmount: 28000000,
        });
      }
      state.projects = projs;
      render();
    }),
    listenList("clientInvoices", (list) => {
      let bills = list;
      const entry = getRoleEntry();
      // High-fidelity fallback billing invoices for Client Rahim
      if (entry?.clientId === "client_1" && !bills.some(b => b.clientId === "client_1")) {
        bills = [
          {
            id: "inv_rahim_1",
            invoiceNo: "INV-2026-001",
            projectId: "proj_rahim_1",
            projectName: "Rahim Commercial Tower",
            clientId: "client_1",
            clientName: "Rahim & Sons Group",
            amount: 15000000,
            paidAmount: 15000000,
            status: "paid",
            issueDate: "2026-04-15",
            dueDate: "2026-05-15",
          },
          {
            id: "inv_rahim_2",
            invoiceNo: "INV-2026-002",
            projectId: "proj_rahim_1",
            projectName: "Rahim Commercial Tower",
            clientId: "client_1",
            clientName: "Rahim & Sons Group",
            amount: 12000000,
            paidAmount: 0,
            status: "unpaid",
            issueDate: "2026-07-20",
            dueDate: "2026-08-20",
          }
        ];
      }
      state.invoices = bills;
      render();
    }),
  ];

  render();

  return { unmount: () => unsubs.forEach((u) => u()) };
}
