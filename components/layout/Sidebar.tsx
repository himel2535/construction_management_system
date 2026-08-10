"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useState, useEffect } from "react";

const NAV_ITEMS = [
  { path: "/dashboard", label: "Dashboard", icon: "dashboard" },
  { path: "/projects", label: "Projects", icon: "projects" },
  { path: "/site-incharge", label: "Site Management", icon: "site" },
  { path: "/customers", label: "Clients / Contacts", icon: "clients" },
  { path: "/purchases", label: "Procurement", icon: "procurement" },
  { path: "/suppliers", label: "Suppliers", icon: "suppliers" },
  { path: "/inventory", label: "Inventory", icon: "inventory" },
  { path: "/workers", label: "HR & Payroll", icon: "hr" },
  { path: "/assets", label: "Assets & Equipment", icon: "assets" },
  { path: "/billing", label: "Billing", icon: "billing" },
  { path: "/accounting", label: "Finance", icon: "finance" },
  { path: "/approvals", label: "Approvals", icon: "approvals" },
  { path: "/reports", label: "Reports", icon: "reports" },
  { path: "/client-portal", label: "Client Portal", icon: "portal" },
  { path: "/settings", label: "Settings", icon: "settings" },
];

export default function Sidebar() {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [navItems, setNavItems] = useState<typeof NAV_ITEMS>([]);
  const [approvalCount, setApprovalCount] = useState(0);

  useEffect(() => {
    let unsub: (() => void) | undefined;
    let unsubQ: (() => void) | undefined;
    let handleSessionChange: (() => void) | undefined;
    
    Promise.all([
      import("@/util_roles.js"),
      import("@/svc_governance.js"),
      import("@/svc_data.js")
    ]).then(([{ filterNavItems }, { getCurrentRole, isApprovalQueueRowVisible }, { listenValue, listenList }]) => {
      const updateNav = () => {
        setNavItems(filterNavItems(NAV_ITEMS, getCurrentRole()));
      };

      // Initial filter
      updateNav();
      
      // Listen for role changes
      unsub = listenValue("roles", () => {
        updateNav();
      });

      // Listen for approvals queue updates
      unsubQ = listenList("approvalQueue", (list: any[]) => {
        const count = (list || []).filter(isApprovalQueueRowVisible).length;
        setApprovalCount(count);
      });

      handleSessionChange = () => {
        updateNav();
      };
      window.addEventListener("erp:session-user-changed", handleSessionChange);
    });
    
    return () => {
      if (unsub) unsub();
      if (unsubQ) unsubQ();
      if (handleSessionChange) {
        window.removeEventListener("erp:session-user-changed", handleSessionChange);
      }
    };
  }, []);

  useEffect(() => {
    try {
      setCollapsed(localStorage.getItem("erp-sidebar-collapsed") === "1");
    } catch {
      /* ignore */
    }
  }, []);

  const toggleCollapse = () => {
    const next = !collapsed;
    setCollapsed(next);
    try {
      localStorage.setItem("erp-sidebar-collapsed", next ? "1" : "0");
    } catch {
      /* ignore */
    }
  };

  return (
    <aside className={`sidebar ${collapsed ? "sidebar-collapsed" : ""}`} style={{ backgroundColor: '#ffffff', borderRight: '1px solid #e2e8f0' }}>
      <div className="sidebar-head">
        <Link href="/dashboard" prefetch={true} className="sidebar-head-brand" title="Go to home">
          <span className="sidebar-logo" aria-hidden="true">
            <svg width="32" height="32" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg" className="nav-color-icon nav-color-icon--logo">
              <path d="M28 16A12 12 0 1 1 4 16A12 12 0 0 1 28 16Z" stroke="#1e3a8a" strokeWidth="2" strokeDasharray="60 15" strokeLinecap="round" />
              <path d="M12 24V10h4v14" fill="#1e3a8a" />
              <path d="M16 24v-8h4v8" fill="#f97316" />
              <path d="M12 8L16 4l8 4v2" stroke="#1e3a8a" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M6 20l6-6 4 4 10-10" stroke="#f97316" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M21 8h5v5" fill="#f97316" />
            </svg>
          </span>
          <div className="sidebar-head-text">
            <h1><span className="title-const">Construction</span> <span className="title-erp">ERP</span></h1>
          </div>
        </Link>
        <button type="button" className="sidebar-collapse-btn" aria-label="Collapse sidebar" onClick={toggleCollapse}>
          <svg className="sidebar-collapse-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            {collapsed ? (
              <>
                <path d="M6 8l4 4-4 4" />
                <path d="M10 7h10" />
                <path d="M13 12h7" />
                <path d="M10 17h10" />
              </>
            ) : (
              <>
                <path d="M4 7h10" />
                <path d="M4 12h7" />
                <path d="M4 17h10" />
                <path d="M18 8l-4 4 4 4" />
              </>
            )}
          </svg>
        </button>
      </div>

      <nav id="sidebar-nav">
        {navItems.map((item) => {
          const isActive = pathname === item.path || (item.path !== "/dashboard" && pathname.startsWith(item.path));
          const isApprovals = item.path === "/approvals";
          const badgeCount = isApprovals ? approvalCount : null;
          return (
            <Link
              key={item.path}
              href={item.path}
              prefetch={true}
              className={`nav-link ${isActive ? "active" : ""}`}
              title={item.label}
            >
              <span className="nav-icon">
                <Image
                  className="nav-color-icon"
                  src={`/assets/icons/nav/nav-${item.icon}.svg`}
                  width={32}
                  height={32}
                  alt={item.label}
                  sizes="32px"
                  priority={item.path === "/dashboard"}
                />
              </span>
              <span className="nav-label">{item.label}</span>
              {badgeCount !== null && badgeCount > 0 && (
                <span className="nav-badge">{badgeCount > 99 ? "99+" : badgeCount}</span>
              )}
            </Link>
          );
        })}
      </nav>

      <div className="sidebar-foot">
        <Link href="/settings" prefetch={true} className="sidebar-user-card" title="Settings">
          <span className="user-avatar sm">DU</span>
          <span className="sidebar-user-text">
            <strong>Demo User</strong>
            <span>Owner / Admin</span>
          </span>
          <span className="sidebar-user-chevron">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 9l6 6 6-6" /></svg>
          </span>
        </Link>
      </div>
    </aside>
  );
}
