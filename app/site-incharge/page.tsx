"use client";

import { useEffect, useRef } from "react";
import { useSearchParams } from "next/navigation";

const moduleCache = new Map<string, any>();

export default function SiteInchargePage() {
  const containerRef = useRef<HTMLDivElement>(null);
  const searchParams = useSearchParams();

  useEffect(() => {
    if (!containerRef.current) return;
    let cleanup: (() => void) | undefined;

    (moduleCache.has("@/page_site_incharge.js") ? Promise.resolve(moduleCache.get("@/page_site_incharge.js")) : import("@/page_site_incharge.js").then(res => { moduleCache.set("@/page_site_incharge.js", res); return res; })).then(({ mountSiteIncharge }) => {
      if (containerRef.current) {
        containerRef.current.innerHTML = "";
        const res = mountSiteIncharge(containerRef.current);
        if (res && typeof res.unmount === "function") {
          cleanup = res.unmount;
        }
      }
    });

    return () => {
      if (cleanup) {
        try {
          cleanup();
        } catch (e) {
          console.warn("[SiteInchargePage] cleanup error", e);
        }
      }
    };
  }, [searchParams]);

  return <div ref={containerRef} className="site-incharge-mount-node" style={{ width: "100%" }} />;
}
