"use client";

import { useEffect, useRef } from "react";
import { useSearchParams } from "next/navigation";

const moduleCache = new Map<string, any>();

export default function AccountingPage() {
  const containerRef = useRef<HTMLDivElement>(null);
  const searchParams = useSearchParams();

  useEffect(() => {
    if (!containerRef.current) return;
    let cleanup: (() => void) | undefined;

    (moduleCache.has("@/page_accounting.js") ? Promise.resolve(moduleCache.get("@/page_accounting.js")) : import("@/page_accounting.js").then(res => { moduleCache.set("@/page_accounting.js", res); return res; })).then(({ mountAccounting }) => {
      if (containerRef.current) {
        containerRef.current.innerHTML = "";
        const res = mountAccounting(containerRef.current);
        if (res && typeof res.unmount === "function") {
          cleanup = res.unmount;
        }
      }
    });

    return () => {
      if (cleanup) cleanup();
    };
  }, [searchParams]);

  return <div ref={containerRef} className="accounting-mount-node" style={{ width: "100%" }} />;
}
