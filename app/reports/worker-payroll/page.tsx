"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";

const moduleCache = new Map<string, any>();

export default function ReportsWorkerPayrollPage() {
  const containerRef = useRef<HTMLDivElement>(null);
  const pathname = usePathname();

  useEffect(() => {
    let cleanup: (() => void) | undefined;
    
    (moduleCache.has("@/page_reports_detail.js") ? Promise.resolve(moduleCache.get("@/page_reports_detail.js")) : import("@/page_reports_detail.js").then(res => { moduleCache.set("@/page_reports_detail.js", res); return res; })).then((mod) => {
      if (containerRef.current) {
        containerRef.current.innerHTML = "";
        cleanup = mod.mountReportsWorkerPayroll(containerRef.current);
      }
    }).catch(err => {
      console.error("Failed to load page_reports_detail.js", err);
    });

    return () => {
      if (cleanup) {
        try {
          cleanup();
        } catch (e) {
          console.warn("[ReportsWorkerPayrollPage] cleanup error", e);
        }
      }
    };
  }, [pathname, searchParams]);

  return <div className="app-root page-reportsworkerpayrollpage" id="app-root" ref={containerRef}></div>;
}
