"use client";

import { useEffect, useRef } from "react";
import { useSearchParams } from "next/navigation";

const moduleCache = new Map<string, any>();

export default function ReportsPage() {
  const containerRef = useRef<HTMLDivElement>(null);
  const searchParams = useSearchParams();

  useEffect(() => {
    if (!containerRef.current) return;
    let cleanup: (() => void) | undefined;

    (moduleCache.has("@/page_reports.js") ? Promise.resolve(moduleCache.get("@/page_reports.js")) : import("@/page_reports.js").then(res => { moduleCache.set("@/page_reports.js", res); return res; })).then(({ mountReports }) => {
      if (containerRef.current) {
        containerRef.current.innerHTML = "";
        const res = mountReports(containerRef.current);
        if (res && typeof res.unmount === "function") {
          cleanup = res.unmount;
        }
      }
    });

    return () => {
      if (cleanup) cleanup();
    };
  }, [searchParams]);

  return <div ref={containerRef} className="reports-mount-node" style={{ width: "100%" }} />;
}
