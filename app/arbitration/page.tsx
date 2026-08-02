"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";

const moduleCache = new Map<string, any>();

export default function ArbitrationPage() {
  const containerRef = useRef<HTMLDivElement>(null);
  const pathname = usePathname();

  useEffect(() => {
    let cleanup: (() => void) | undefined;
    
    (moduleCache.has("@/page_arbitration.js") ? Promise.resolve(moduleCache.get("@/page_arbitration.js")) : import("@/page_arbitration.js").then(res => { moduleCache.set("@/page_arbitration.js", res); return res; })).then((mod) => {
      if (containerRef.current) {
        containerRef.current.innerHTML = "";
        cleanup = mod.mountArbitration(containerRef.current);
      }
    }).catch(err => {
      console.error("Failed to load page_arbitration.js", err);
    });

    return () => {
      if (cleanup) {
        try {
          cleanup();
        } catch (e) {
          console.warn("[ArbitrationPage] cleanup error", e);
        }
      }
    };
  }, [pathname, searchParams]);

  return <div className="app-root page-arbitrationpage" id="app-root" ref={containerRef}></div>;
}
