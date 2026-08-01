"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import Sidebar from "./Sidebar";
import Header from "./Header";

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [isAuthorized, setIsAuthorized] = useState(true);

  useEffect(() => {
    Promise.all([
      import("@/svc_firebaseOps.js"),
      import("@/svc_tenant.js"),
      import("@/svc_auth.js"),
      import("@/firebase.js"),
    ]).then(async ([{ ensureFirebaseSeed }, { initTenantContext, getActiveTenantId }, { setCurrentUser }, { DEMO_ACTOR_UID }]) => {
      try {
        await ensureFirebaseSeed().catch(() => {});
        await initTenantContext().catch(() => {});
        setCurrentUser({
          id: DEMO_ACTOR_UID,
          name: "Demo User",
          email: "owner@demo.com",
          role: "owner",
          tenantId: getActiveTenantId() || "tn_default",
        });
      } catch (e) {
        console.warn("[AppShell] init fallback", e);
      }
    });
  }, []);

  useEffect(() => {
    let unsub: (() => void) | undefined;
    let handleSessionChange: (() => void) | undefined;
    
    Promise.all([
      import("@/util_roles.js"),
      import("@/svc_governance.js"),
      import("@/svc_data.js"),
      import("@/util_route.js"),
    ]).then(([{ canAccessRoute, defaultRouteForRole }, { getCurrentRole }, { listenValue }, { bindNavigate }]) => {
      bindNavigate((target: string, opts?: { replace?: boolean }) => {
        if (opts?.replace) {
          router.replace(target);
        } else {
          router.push(target);
        }
      });

      const checkAccess = () => {
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
  }, [pathname, router]);

  return (
    <div className="app-root">
      <div
        className="sidebar-backdrop"
        id="sidebar-backdrop"
        onClick={() => {
          document.querySelector(".app-shell")?.classList.remove("sidebar-open");
        }}
      />
      <div className="app-shell">
        <Sidebar />
        <main className="main">
          <Header />
          <div className="main-inner" id="page-content">
            {isAuthorized ? children : null}
          </div>
        </main>
      </div>
    </div>
  );
}
