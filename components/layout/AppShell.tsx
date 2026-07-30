"use client";

import { useEffect } from "react";
import Sidebar from "./Sidebar";
import Header from "./Header";

export default function AppShell({ children }: { children: React.ReactNode }) {
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
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
