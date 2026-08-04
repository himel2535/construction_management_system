"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";

const moduleCache = new Map<string, any>();

export default function ClientsPage() {
  const containerRef = useRef<HTMLDivElement>(null);
  const pathname = usePathname();

  useEffect(() => {
    let cleanup: (() => void) | undefined;
    
    (moduleCache.has("@/page_customers.js") ? Promise.resolve(moduleCache.get("@/page_customers.js")) : import("@/page_customers.js").then(res => { moduleCache.set("@/page_customers.js", res); return res; })).then((mod) => {
      if (containerRef.current) {
        containerRef.current.innerHTML = "";
        cleanup = mod.mountClients(containerRef.current);
      }
    }).catch(err => {
      console.error("Failed to load page_customers.js", err);
    });

    return () => {
      if (cleanup) {
        try {
          cleanup();
        } catch (e) {
          console.warn("[ClientsPage] cleanup error", e);
        }
      }
    };
  }, [pathname]);

  return <div className="app-root page-clientspage" id="app-root" ref={containerRef}></div>;
}
