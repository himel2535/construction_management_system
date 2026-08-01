"use client";

import { useEffect, useRef } from "react";
import { useSearchParams } from "next/navigation";
import { usePathname } from "next/navigation";

export default function ReportsProjectCostPage() {
  const containerRef = useRef<HTMLDivElement>(null);
  const searchParams = useSearchParams();
  const pathname = usePathname();

  useEffect(() => {
    let cleanup: (() => void) | undefined;
    
    import("@/page_reports_detail.js").then((mod) => {
      if (containerRef.current) {
        containerRef.current.innerHTML = "";
        cleanup = mod.mountReportsProjectCost(containerRef.current);
      }
    }).catch(err => {
      console.error("Failed to load page_reports_detail.js", err);
    });

    return () => {
      if (cleanup) {
        try {
          cleanup();
        } catch (e) {
          console.warn("[ReportsProjectCostPage] cleanup error", e);
        }
      }
    };
  }, [pathname, searchParams]);

  return <div className="app-root page-reportsprojectcostpage" id="app-root" ref={containerRef}></div>;
}
