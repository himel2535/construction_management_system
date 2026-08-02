"use client";

import { useEffect, useRef } from "react";

const moduleCache = new Map<string, any>();

export default function ClientPortalPage() {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    let cleanup: (() => void) | undefined;

    (moduleCache.has("@/page_client_portal.js") ? Promise.resolve(moduleCache.get("@/page_client_portal.js")) : import("@/page_client_portal.js").then(res => { moduleCache.set("@/page_client_portal.js", res); return res; })).then(({ mountClientPortal }) => {
      if (containerRef.current) {
        containerRef.current.innerHTML = "";
        const res = mountClientPortal(containerRef.current);
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
          console.warn("[ClientPortalPage] cleanup error", e);
        }
      }
    };
  }, []);

  return <div ref={containerRef} className="client-portal-mount-node" style={{ width: "100%" }} />;
}
