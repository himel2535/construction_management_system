"use client";

import { useEffect, useRef } from "react";
import { useSearchParams } from "next/navigation";

const moduleCache = new Map<string, any>();

export default function PurchasesPage() {
  const containerRef = useRef<HTMLDivElement>(null);
  const searchParams = useSearchParams();

  useEffect(() => {
    if (!containerRef.current) return;
    let cleanup: (() => void) | undefined;

    (moduleCache.has("@/page_purchases.js") ? Promise.resolve(moduleCache.get("@/page_purchases.js")) : import("@/page_purchases.js").then(res => { moduleCache.set("@/page_purchases.js", res); return res; })).then(({ mountPurchases }) => {
      if (containerRef.current) {
        containerRef.current.innerHTML = "";
        const res = mountPurchases(containerRef.current);
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
          console.warn("[PurchasesPage] cleanup error", e);
        }
      }
    };
  }, [searchParams]);

  return <div ref={containerRef} className="purchases-mount-node" style={{ width: "100%" }} />;
}
