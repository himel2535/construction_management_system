"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import Sidebar from "./Sidebar";
import Header from "./Header";

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [isAuthorized, setIsAuthorized] = useState(true);
  const [initialized, setInitialized] = useState(false);

  useEffect(() => {
    Promise.all([
      import("@/svc_tenant.js"),
      import("@/svc_auth.js"),
    ]).then(async ([{ initTenantContext }, { checkSession }]) => {
      try {
        await initTenantContext().catch(() => {});
        const user = await checkSession();
        if (!user && pathname !== "/login") {
          router.replace("/login");
        } else if (user && pathname === "/login") {
          router.replace("/dashboard");
        }
        setInitialized(true);
        
        // Preload all page modules in the background for 0ms instant navigation
        const preloadModules = () => {
          const modules = [
            () => import("@/page_dashboard.js"),
            () => import("@/page_projects.js"),
            () => import("@/page_project_create.js"),
            () => import("@/page_site_incharge.js"),
            () => import("@/page_customers.js"),
            () => import("@/page_client_create.js"),
            () => import("@/page_purchases.js"),
            () => import("@/page_suppliers.js"),
            () => import("@/page_inventory.js"),
            () => import("@/page_workers.js"),
            () => import("@/page_assets.js"),
            () => import("@/page_sales.js"),
            () => import("@/page_accounting.js"),
            () => import("@/page_approvals.js"),
            () => import("@/page_reports.js"),
            () => import("@/page_reports_detail.js"),
            () => import("@/page_client_portal.js"),
            () => import("@/page_settings.js"),
            () => import("@/page_arbitration.js"),
          ];

          if (typeof window !== "undefined" && "requestIdleCallback" in window) {
            (window as any).requestIdleCallback(() => {
              modules.forEach((fn) => fn().catch(() => {}));
            });
          } else {
            setTimeout(() => {
              modules.forEach((fn) => fn().catch(() => {}));
            }, 1000);
          }
        };

        preloadModules();
      } catch (e) {
        console.warn("[AppShell] init fallback", e);
        setInitialized(true);
      }
    });
  }, []);

  useEffect(() => {
    if (!initialized) return;

    let unsub: (() => void) | undefined;
    let handleSessionChange: (() => void) | undefined;
    
    Promise.all([
      import("@/util_roles.js"),
      import("@/svc_governance.js"),
      import("@/svc_data.js"),
      import("@/util_route.js"),
      import("@/svc_auth.js"),
    ]).then(([{ canAccessRoute, defaultRouteForRole }, { getCurrentRole }, { listenValue }, { bindNavigate }, { getCurrentUser }]) => {
      bindNavigate((target: string, opts?: { replace?: boolean }) => {
        if (opts?.replace) {
          router.replace(target);
        } else {
          router.push(target);
        }
      });

      const checkAccess = () => {
        const user = getCurrentUser();
        if (!user) {
          if (pathname !== "/login") {
            setIsAuthorized(false);
            router.replace("/login");
          }
          return;
        }

        const role = getCurrentRole();
        if (!canAccessRoute(role, pathname)) {
          setIsAuthorized(false);
          const fallback = defaultRouteForRole(role);
          if (pathname !== fallback) {
            router.replace(fallback);
          }
        } else {
          setIsAuthorized(true);
        }
      };

      checkAccess();
      
      // Listen for role changes to re-evaluate access
      unsub = listenValue("roles", () => {
        checkAccess();
      });

      handleSessionChange = () => {
        checkAccess();
      };
      window.addEventListener("erp:session-user-changed", handleSessionChange);
    });

    return () => {
      if (unsub) unsub();
      if (handleSessionChange) {
        window.removeEventListener("erp:session-user-changed", handleSessionChange);
      }
    };
  }, [pathname, router, initialized]);

  return (
    <div className="app-root">
      {!initialized && (
        <div className="modern-loader-overlay" style={{ zIndex: 9999 }}>
          <div className="modern-loader-container">
            <div className="modern-loader-spinner" style={{ borderColor: '#B13A2E transparent #B13A2E transparent' }}></div>
            <span style={{ color: '#1e293b', fontWeight: 600, fontSize: '0.875rem' }}>Verifying session...</span>
          </div>
        </div>
      )}
      {pathname === "/login" ? (
        children
      ) : (
        <>
          <div
            className="sidebar-backdrop"
            id="sidebar-backdrop"
            onClick={() => {
              document.querySelector(".app-shell")?.classList.remove("sidebar-open");
            }}
          />
          <div className="app-shell" style={{ display: initialized ? 'flex' : 'none' }}>
            <Sidebar />
            <main className="main">
              <Header />
              <div className="main-inner" id="page-content">
                {isAuthorized ? children : null}
              </div>
            </main>
          </div>
        </>
      )}
    </div>
  );
}
