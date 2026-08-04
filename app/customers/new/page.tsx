"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";

const moduleCache = new Map<string, any>();

export default function CustomerCreatePage() {
  const containerRef = useRef<HTMLDivElement>(null);
  const pathname = usePathname();

  useEffect(() => {
    let cleanup: (() => void) | undefined;
    
    (moduleCache.has("@/page_client_create.js") ? Promise.resolve(moduleCache.get("@/page_client_create.js")) : import("@/page_client_create.js").then(res => { moduleCache.set("@/page_client_create.js", res); return res; })).then((mod) => {
      if (containerRef.current) {
        containerRef.current.innerHTML = "";
        cleanup = mod.mountClientCreate(containerRef.current);
      }
    }).catch(err => {
      console.error("Failed to load page_client_create.js", err);
    });

    return () => {
      if (cleanup) {
        try {
          cleanup();
        } catch (e) {
          console.warn("[CustomerCreatePage] cleanup error", e);
        }
      }
    };
  }, [pathname]);

  return <div className="app-root page-customercreatepage" id="app-root" ref={containerRef}></div>;
}
