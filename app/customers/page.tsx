"use client";

import { useEffect, useRef } from "react";

const moduleCache = new Map<string, any>();

export default function CustomersPage() {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    let cleanup: (() => void) | undefined;

    (moduleCache.has("@/page_customers.js") ? Promise.resolve(moduleCache.get("@/page_customers.js")) : import("@/page_customers.js").then(res => { moduleCache.set("@/page_customers.js", res); return res; })).then(({ mountClients }) => {
      if (containerRef.current) {
        containerRef.current.innerHTML = "";
        const res = mountClients(containerRef.current);
        if (res && typeof res.unmount === "function") {
          cleanup = res.unmount;
        }
      }
    });

    return () => {
      if (cleanup) cleanup();
    };
  }, []);

  return <div ref={containerRef} className="clients-mount-node" style={{ width: "100%" }} />;
}
