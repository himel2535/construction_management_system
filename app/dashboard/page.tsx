"use client";

import { useEffect, useRef } from "react";

export default function DashboardPage() {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    let cleanup: (() => void) | undefined;

    import("@/page_dashboard.js").then(({ mountDashboard }) => {
      if (containerRef.current) {
        containerRef.current.innerHTML = "";
        const res = mountDashboard(containerRef.current);
        if (res && typeof res.unmount === "function") {
          cleanup = res.unmount;
        }
      }
    });

    return () => {
      if (cleanup) cleanup();
    };
  }, []);

  return <div ref={containerRef} className="dashboard-mount-node" style={{ width: '100%' }} />;
}
