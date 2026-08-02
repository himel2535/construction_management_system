"use client";

import { useEffect, useRef } from "react";

const moduleCache = new Map<string, any>();

export default function SuppliersPage() {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    let cleanup: (() => void) | undefined;

    (moduleCache.has("@/page_suppliers.js") ? Promise.resolve(moduleCache.get("@/page_suppliers.js")) : import("@/page_suppliers.js").then(res => { moduleCache.set("@/page_suppliers.js", res); return res; })).then(({ mountSuppliers }) => {
      if (containerRef.current) {
        containerRef.current.innerHTML = "";
        const res = mountSuppliers(containerRef.current);
        if (res && typeof res.unmount === "function") {
          cleanup = res.unmount;
        }
      }
    });

    return () => {
      if (cleanup) cleanup();
    };
  }, []);

  return <div ref={containerRef} className="suppliers-mount-node" style={{ width: "100%" }} />;
}
