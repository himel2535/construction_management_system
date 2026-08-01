"use client";

import { useEffect, useRef } from "react";
import { useSearchParams } from "next/navigation";
import { usePathname } from "next/navigation";

export default function SalesPage() {
  const containerRef = useRef<HTMLDivElement>(null);
  const searchParams = useSearchParams();
  const pathname = usePathname();

  useEffect(() => {
    let cleanup: (() => void) | undefined;
    
    import("@/page_sales.js").then((mod) => {
      if (containerRef.current) {
        containerRef.current.innerHTML = "";
        cleanup = mod.mountBilling(containerRef.current);
      }
    }).catch(err => {
      console.error("Failed to load page_sales.js", err);
    });

    return () => {
      if (cleanup) {
        try {
          cleanup();
        } catch (e) {
          console.warn("[SalesPage] cleanup error", e);
        }
      }
    };
  }, [pathname, searchParams]);

  return <div className="app-root page-salespage" id="app-root" ref={containerRef}></div>;
}
