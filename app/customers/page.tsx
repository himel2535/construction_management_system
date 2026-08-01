"use client";

import { useEffect, useRef } from "react";
import { useSearchParams } from "next/navigation";

const moduleCache = new Map<string, any>();

export default function CustomersPage() {
  const containerRef = useRef<HTMLDivElement>(null);
  const searchParams = useSearchParams();

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
  }, [searchParams]);

  return <div ref={containerRef} className="clients-mount-node" style={{ width: "100%" }} />;
}
