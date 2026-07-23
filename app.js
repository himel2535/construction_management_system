import { APP_VERSION } from "./version.js";

import { renderLayout, setActiveNav, syncSidebarUserFoot } from "./cmp_layout.js";

import { registerRoute, startRouter } from "./router.js";

import { initTenantContext, getActiveTenantId } from "./svc_tenant.js";

import { setCurrentUser } from "./svc_auth.js";

import { refreshProjectCostCache } from "./svc_operations.js";

import { ensureFirebaseSeed } from "./svc_firebaseOps.js";

import { get, listenValue } from "./svc_data.js";

import { invalidateRoleCache } from "./svc_governance.js";

import { syncHeaderUser } from "./cmp_header.js";

import { DEMO_ACTOR_UID } from "./firebase.js";

import { bootSkeletonHtml } from "./cmp_skeleton.js";

const PAGE_ROUTES = [
  ["/dashboard", "./page_dashboard.js", "mountDashboard"],
  ["/clients", "./page_customers.js", "mountClients"],
  ["/clients/new", "./page_client_create.js", "mountClientCreate"],
  ["/customers", "./page_customers.js", "mountClients"],
  ["/customers/new", "./page_client_create.js", "mountClientCreate"],
  ["/projects", "./page_projects.js", "mountProjects"],
  ["/projects/new", "./page_project_create.js", "mountProjectCreate"],
  ["/billing", "./page_sales.js", "mountBilling"],
  ["/sales", "./page_sales.js", "mountBilling"],
  ["/accounting", "./page_accounting.js", "mountAccounting"],
  ["/purchases", "./page_purchases.js", "mountPurchases"],
  ["/suppliers", "./page_suppliers.js", "mountSuppliers"],
  ["/inventory", "./page_inventory.js", "mountInventory"],
  ["/assets", "./page_assets.js", "mountAssets"],
  ["/workers", "./page_workers.js", "mountWorkers"],
  ["/site-incharge", "./page_site_incharge.js", "mountSiteIncharge"],
  ["/reports", "./page_reports.js", "mountReports"],
  ["/reports/project-cost", "./page_reports_detail.js", "mountReportsProjectCost"],
  ["/reports/analytics", "./page_reports_detail.js", "mountReportsAnalytics"],
  ["/reports/worker-payroll", "./page_reports_detail.js", "mountReportsWorkerPayroll"],
  ["/approvals", "./page_approvals.js", "mountApprovals"],
  ["/arbitration", "./page_arbitration.js", "mountArbitration"],
  ["/settings", "./page_settings.js", "mountSettings"],
  ["/client-portal", "./page_client_portal.js", "mountClientPortal"],
];

const pageModuleCache = new Map();

function getBootPath() {
  const p = location.pathname;
  if (!p || p === "/") return "/dashboard";
  return p;
}

const appBootEl = document.getElementById("app");
if (appBootEl && !appBootEl.querySelector(".erp-boot-skeleton")) {
  appBootEl.innerHTML = bootSkeletonHtml("Connecting to Firebase...", getBootPath());
}

function showBootError(message, detail = "") {
  const appEl = document.getElementById("app");
  appEl.innerHTML = `
    <div style="max-width:32rem;margin:3rem auto;padding:1.5rem;border:1px solid #fecaca;background:#fef2f2;border-radius:8px;font-family:system-ui,sans-serif">
      <h2 style="margin:0 0 0.5rem;color:#991b1b">App failed to load</h2>
      <p style="margin:0 0 0.75rem">${message}</p>
      ${detail ? `<pre style="font-size:12px;overflow:auto;background:#fff;padding:0.75rem;border-radius:4px">${detail}</pre>` : ""}
    </div>
  `;
}

function isBundleDeploy() {
  return Boolean(document.querySelector('script[src*="app.bundle"]'));
}

async function withTimeout(promise, ms, label) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(
      () => reject(new Error(`${label} timed out after ${ms}ms`)),
      ms
    );
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    clearTimeout(timer);
  }
}

function setBootStatus(text) {
  const appEl = document.getElementById("app");
  if (appEl) {
    appEl.innerHTML = bootSkeletonHtml(text, getBootPath());
  }
}

async function verifyDeployPaths() {
  const bundle = isBundleDeploy();
  const checks = bundle
    ? [
        { url: "app.bundle.js", label: "app.bundle.js", shouldExist: true },
        { url: "firebase.js", label: "firebase.js", shouldExist: true },
        { url: "app.js", label: "unbundled app.js (remove on production)", shouldExist: false },
        {
          url: "svc_payroll.js",
          label: "unbundled svc_payroll.js (mixed deploy)",
          shouldExist: false,
        },
        {
          url: "page_customers.js",
          label: "unbundled page_*.js (mixed deploy)",
          shouldExist: false,
        },
        {
          url: "assets/pages/customers.js",
          label: "legacy assets/pages/customers.js",
          shouldExist: false,
        },
        { url: "assets/app.js", label: "legacy assets/app.js", shouldExist: false },
      ]
    : [
        { url: "app.js", label: "app.js (dev)", shouldExist: true },
        { url: "page_customers.js", label: "page_customers.js (dev)", shouldExist: true },
        { url: "svc_payroll.js", label: "svc_payroll.js (dev)", shouldExist: true },
        {
          url: "assets/pages/customers.js",
          label: "legacy assets/pages/customers.js",
          shouldExist: false,
        },
        { url: "assets/app.js", label: "legacy assets/app.js", shouldExist: false },
      ];

  if (!bundle) {
    console.warn(
      "[ERP] DEPLOY: Unbundled mode (app.js). On production use app.bundle.js only — upload ALL source files or run npm run build and deploy dist/deploy/."
    );
  }

  for (const { url, label, shouldExist } of checks) {
    try {
      const res = await fetch(url, { method: "HEAD", cache: "no-store" });
      if (shouldExist && !res.ok) {
        console.warn(
          `[ERP] DEPLOY: Missing ${label} (HTTP ${res.status}). Upload all files from dist/deploy/ to public_html.`
        );
      }
      if (!shouldExist && res.ok) {
        console.warn(
          `[ERP] DEPLOY: ${label} still reachable. Delete legacy files and purge LiteSpeed/Cloudflare cache.`
        );
      }
    } catch {
      if (shouldExist) {
        console.warn(`[ERP] DEPLOY: Could not reach ${label}. Check upload path and domain.`);
      }
    }
  }
}

async function mountLazyPage(modulePath, exportName, container) {
  try {
    let mod = pageModuleCache.get(modulePath);
    if (!mod) {
      mod = await import(modulePath);
      pageModuleCache.set(modulePath, mod);
    }
    container.innerHTML = "";
    const mount = mod[exportName];
    if (typeof mount !== "function") {
      throw new Error(`Missing export ${exportName}`);
    }
    return mount(container);
  } catch (e) {
    console.error(`[ERP] Failed to load ${modulePath}`, e);
    const missing =
      /Failed to fetch|404|module/i.test(String(e?.message || e)) ||
      (e?.message || "").includes("svc_payroll");
    container.innerHTML = `
      <div class="card card-pad" style="max-width:36rem">
        <h3 style="margin:0 0 0.5rem">Page failed to load</h3>
        <p style="margin:0 0 0.75rem">
          ${
            missing
              ? "Upload <strong>svc_payroll.js</strong> and related files from F:\\realestate-erp\\ to cPanel public_html. See <strong>UPLOAD-F-DRIVE-NOW.txt</strong> or upload everything from <strong>cpanel-upload-ready\\</strong>."
              : "Check browser console and uploaded JS files on the server."
          }
        </p>
        <pre style="font-size:12px;overflow:auto;margin:0">${String(e?.message || e)}</pre>
      </div>
    `;
    return undefined;
  }
}

async function afterAuth() {
  const { restoreLocalQueueBackup, processOfflineQueue } = await import("./svc_sync.js");

  restoreLocalQueueBackup();

  await refreshProjectCostCache();

  if (navigator.onLine) {
    try {
      await processOfflineQueue();
    } catch (e) {
      console.warn("[ERP] offline queue replay skipped", e);
    }
  }
}

function mountAppShell() {
  const appEl = document.getElementById("app");

  appEl.innerHTML = "";

  const layout = renderLayout();

  appEl.appendChild(layout);

  setActiveNav();

  for (const [path, modulePath, exportName] of PAGE_ROUTES) {
    registerRoute(path, (c) => mountLazyPage(modulePath, exportName, c));
  }

  window.addEventListener("online", () => {
    import("./svc_sync.js").then(({ processOfflineQueue }) => processOfflineQueue());
  });

  listenValue("roles", () => {
    invalidateRoleCache();
    syncHeaderUser();
    syncSidebarUserFoot();
  });

  window.__ERP_BOOT_COMPLETE__ = true;

  startRouter();
}

async function boot() {
  const appEl = document.getElementById("app");

  if (!appEl) return;

  console.info(`[ERP] build ${APP_VERSION} — Firebase RTDB (erptriniti)`);

  setBootStatus("Connecting to Firebase...");

  verifyDeployPaths();

  try {
    await withTimeout(ensureFirebaseSeed(), 12000, "Firebase connection");
    await get("roles");
    await initTenantContext();
    setCurrentUser({
      id: DEMO_ACTOR_UID,
      name: "Demo User",
      email: "owner@demo.com",
      role: "owner",
      tenantId: getActiveTenantId(),
    });

    mountAppShell();

    afterAuth().catch((e) => {
      console.warn("[ERP] background init skipped", e);
    });
  } catch (e) {
    console.error("[ERP] boot failed", e);

    const msg = e?.message || String(e);
    const isTimeout = /timed out/i.test(msg);

    showBootError(
      isTimeout ? "Firebase connection timed out." : "Firebase connection failed.",
      msg +
        "\n\nCheck:\n1. Upload app.bundle.js AND firebase.js to public_html\n2. Firebase Console → erptriniti → Realtime Database enabled\n3. Rules allow read/write (database.rules.json)\n4. Browser console for permission_denied"
    );
  }
}

boot().catch((e) => {
  showBootError("Unexpected error.", e?.message || String(e));
});
