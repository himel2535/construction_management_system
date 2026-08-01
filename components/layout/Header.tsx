"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

export default function Header() {
  const pathname = usePathname();

  useEffect(() => {
    Promise.all([
      import("@/cmp_header.js"),
    ]).then(([{ applyRouteChrome, initHeaderInteractions }]) => {
      applyRouteChrome();
      initHeaderInteractions();
    });
  }, [pathname]);

  return (
    <header className="app-header">
      <div className="header-left">
        <button
          type="button"
          className="icon-btn"
          id="sidebar-toggle"
          aria-label="Open menu"
          onClick={() => {
            document.querySelector(".app-shell")?.classList.toggle("sidebar-open");
          }}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 6h16M4 12h16M4 18h16" /></svg>
        </button>
      </div>
      <div className="page-chrome page-toolbar card" id="page-chrome">
        <button type="button" className="page-chrome-back icon-btn icon-btn--round" id="page-chrome-back" style={{ display: "none" }} aria-label="Go back">
          <span className="page-chrome-back-icon" aria-hidden="true">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M15 18l-6-6 6-6" /></svg>
          </span>
        </button>
        <div className="page-chrome-titles">
          <h1 className="page-chrome-title" id="page-chrome-title">Dashboard</h1>
          <p className="page-chrome-subtitle" id="page-chrome-subtitle">Welcome back! Here&apos;s what&apos;s happening with your business today.</p>
        </div>
        <div className="header-center">
          <div className="header-search-wrap">
            <span className="search-icon" aria-hidden="true">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="7" /><path d="M20 20l-3-3" /></svg>
            </span>
            <input type="search" className="header-search" id="header-search" placeholder="Search anything..." autoComplete="off" aria-controls="header-search-panel" aria-expanded="false" />
            <div className="header-search-panel" id="header-search-panel" hidden role="listbox" aria-label="Search results"></div>
          </div>
        </div>
        <div className="page-chrome-actions">
          <button type="button" className="icon-btn header-notify" id="header-notify-btn" aria-label="Notifications" aria-expanded="false">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" /><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" /></svg>
            <span className="notify-badge" id="header-notify-badge" hidden>0</span>
          </button>
          <div className="notify-dropdown" id="header-notify-dropdown" hidden role="menu" aria-label="Notifications"></div>
          <button type="button" className="date-range-btn" id="page-chrome-date" style={{ display: "none" }}>
            <span className="date-icon">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4M8 2v4M3 10h18" /></svg>
            </span>
            <span className="date-range-text"></span>
            <span className="date-chevron">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 9l6 6 6-6" /></svg>
            </span>
          </button>
          <div className="header-user-wrap">
            <button type="button" className="header-user" id="header-user-btn" aria-label="User menu" aria-expanded="false" aria-haspopup="true">
              <span className="user-avatar">DU</span>
              <span className="user-meta">
                <span className="user-name">Demo User</span>
                <span className="user-chevron">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 9l6 6 6-6" /></svg>
                </span>
              </span>
            </button>
            <div className="header-user-dropdown notify-dropdown" id="header-user-dropdown" hidden role="menu" aria-label="Demo user menu"></div>
          </div>
        </div>
      </div>
    </header>
  );
}
