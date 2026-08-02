"use client";

import { useEffect, useRef } from "react";

const moduleCache = new Map<string, any>();

export default function DashboardPage() {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    let cleanup: (() => void) | undefined;

    (moduleCache.has("@/page_dashboard.js") ? Promise.resolve(moduleCache.get("@/page_dashboard.js")) : import("@/page_dashboard.js").then(res => { moduleCache.set("@/page_dashboard.js", res); return res; })).then(({ mountDashboard }) => {
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

  return <div ref={containerRef} className="dashboard-mount-node" style={{ width: "100%" }} />;
}
