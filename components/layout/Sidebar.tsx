"use client";

import Link from "next/link";
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
  { path: "/approvals", label: "Approvals", icon: "approvals", badge: "2" },
  { path: "/reports", label: "Reports", icon: "reports" },
  { path: "/client-portal", label: "Client Portal", icon: "portal" },
  { path: "/settings", label: "Settings", icon: "settings" },
];

export default function Sidebar() {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);

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
    <aside className={`sidebar ${collapsed ? "sidebar-collapsed" : ""}`}>
      <div className="sidebar-head">
        <Link href="/dashboard" className="sidebar-head-brand" title="Go to home">
          <span className="sidebar-logo" aria-hidden="true">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img className="nav-color-icon nav-color-icon--logo" src="/assets/icons/nav/nav-logo.svg" width="32" height="32" alt="" />
          </span>
          <div className="sidebar-head-text">
            <h1>Construction ERP</h1>
            <p>Owner / Admin panel</p>
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
        {NAV_ITEMS.map((item) => {
          const isActive = pathname === item.path || (item.path !== "/dashboard" && pathname.startsWith(item.path));
          return (
            <Link
              key={item.path}
              href={item.path}
              className={`nav-link ${isActive ? "active" : ""}`}
              title={item.label}
            >
              <span className="nav-icon">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img className="nav-color-icon" src={`/assets/icons/nav/nav-${item.icon}.svg`} width="32" height="32" alt="" />
              </span>
              <span className="nav-label">{item.label}</span>
              {item.badge && <span className="nav-badge">{item.badge}</span>}
            </Link>
          );
        })}
      </nav>

      <div className="sidebar-foot">
        <Link href="/settings" className="sidebar-user-card" title="Settings">
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
