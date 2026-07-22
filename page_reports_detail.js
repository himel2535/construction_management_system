import { listenValue } from "./svc_data.js";
import { setActiveNav } from "./cmp_layout.js";
import { setPageChrome } from "./cmp_header.js";
import { showToast } from "./cmp_toast.js";
import { reconcileSitePayroll } from "./svc_payroll.js";
import { canPerformAction } from "./svc_governance.js";
import {
  renderProjectCostTable,
  renderAnalyticsBlocks,
  renderWorkerPayrollBlocks,
  reportsWidgetShell,
} from "./cmp_reports.js";

function mountDetailPage(container, { title, subtitle, widgetTitle, widgetSub, bodyId, renderInto, headerIcon = "" }) {
  setActiveNav();
  setPageChrome({ title, subtitle });

  const root = document.createElement("div");
  root.className = "reports-page reports-page--detail dashboard-page dashboard-mockup";
  root.innerHTML = reportsWidgetShell({
    title: widgetTitle,
    sub: widgetSub,
    bodyId,
    extraClass: "reports-detail-widget",
    headerIcon,
  });
  container.appendChild(root);

  const body = root.querySelector(`#${bodyId}`);
  const unsubs = [];

  const paint = (payload) => {
    if (!body) return;
    body.innerHTML = renderInto(payload);
  };

  return { body, paint, unsubs, root };
}

function bindPayrollReconcile(scope, data) {
  scope.querySelector("#reports-reconcile-payroll")?.addEventListener("click", async () => {
    const pid = data?.siteSummary?.[0]?.projectId;
    if (!pid) {
      showToast("No project in summary", "error");
      return;
    }
    const month = data?.monthKey || new Date().toISOString().slice(0, 7);
    try {
      await reconcileSitePayroll(pid, month);
      showToast("Payroll reconciled");
    } catch (err) {
      showToast(err.message, "error");
    }
  });
}

export function mountReportsProjectCost(container) {
  const { paint, unsubs } = mountDetailPage(container, {
    title: "Project cost control",
    subtitle: "Full budget vs committed vs actual by project.",
    widgetTitle: "All projects — cost control",
    widgetSub: "Financial management",
    bodyId: "reports-detail-project-cost",
    headerIcon: "projectCost",
    renderInto: (rows) => renderProjectCostTable(rows || [], {}),
  });

  const unsub = listenValue("reportsCache/projectCostSummary", (rows) => paint(rows));
  unsubs.push(unsub);

  return {
    unmount: () => unsubs.forEach((fn) => fn?.()),
  };
}

export function mountReportsAnalytics(container) {
  const { paint, unsubs } = mountDetailPage(container, {
    title: "Reporting & Analytics",
    subtitle: "Profitability, delays, utilization, and sector comparison.",
    widgetTitle: "Reporting & Analytics",
    widgetSub: "Full report tables and KPI blocks",
    bodyId: "reports-detail-analytics",
    headerIcon: "analytics",
    renderInto: (a) =>
      a
        ? renderAnalyticsBlocks(a, { tableLimit: null })
        : `<p class="proj-empty">No analytics data</p>`,
  });

  const unsub = listenValue("reportsCache/analytics", (a) => paint(a));
  unsubs.push(unsub);

  return {
    unmount: () => unsubs.forEach((fn) => fn?.()),
  };
}

export function mountReportsWorkerPayroll(container) {
  const { body, paint, unsubs } = mountDetailPage(container, {
    title: "Site Worker & Payroll",
    subtitle: "Site summary, advances, payments, and reconciliation.",
    widgetTitle: "Site Worker & Payroll",
    widgetSub: "Full payroll and payment tables",
    bodyId: "reports-detail-worker-payroll",
    headerIcon: "workerPayroll",
    renderInto: (data) => {
      if (!data) return `<p class="proj-empty">No payroll data</p>`;
      const showReconcile = canPerformAction("approve") || canPerformAction("approve_expense");
      return renderWorkerPayrollBlocks(data, {
        tableLimit: null,
        includeReconcile: showReconcile,
      });
    },
  });

  const unsub = listenValue("reportsCache/workerPayroll", (data) => {
    paint(data);
    if (body && data && (canPerformAction("approve") || canPerformAction("approve_expense"))) {
      bindPayrollReconcile(body, data);
    }
  });
  unsubs.push(unsub);

  return {
    unmount: () => unsubs.forEach((fn) => fn?.()),
  };
}
