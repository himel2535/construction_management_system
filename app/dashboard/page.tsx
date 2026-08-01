"use client";

import { useEffect, useRef } from "react";
import { useSearchParams } from "next/navigation";

export default function DashboardPage() {
  const containerRef = useRef<HTMLDivElement>(null);
  const searchParams = useSearchParams();

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
  }, [searchParams]);

  return <div ref={containerRef} className="dashboard-mount-node" style={{ width: "100%" }} />;
}
