"use client";

import { useEffect, useRef } from "react";

const moduleCache = new Map<string, any>();

export default function BillingPage() {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    let cleanup: (() => void) | undefined;

    (moduleCache.has("@/page_sales.js") ? Promise.resolve(moduleCache.get("@/page_sales.js")) : import("@/page_sales.js").then(res => { moduleCache.set("@/page_sales.js", res); return res; })).then(({ mountBilling }) => {
      if (containerRef.current) {
        containerRef.current.innerHTML = "";
        const res = mountBilling(containerRef.current);
        if (res && typeof res.unmount === "function") {
          cleanup = res.unmount;
        }
      }
    });

    return () => {
      if (cleanup) cleanup();
    };
  }, []);

  return <div ref={containerRef} className="billing-mount-node" style={{ width: "100%" }} />;
}
