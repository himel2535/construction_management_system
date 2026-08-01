"use client";

import { useEffect, useRef } from "react";
import { useSearchParams } from "next/navigation";

const moduleCache = new Map<string, any>();

export default function InventoryPage() {
  const containerRef = useRef<HTMLDivElement>(null);
  const searchParams = useSearchParams();

  useEffect(() => {
    if (!containerRef.current) return;
    let cleanup: (() => void) | undefined;

    (moduleCache.has("@/page_inventory.js") ? Promise.resolve(moduleCache.get("@/page_inventory.js")) : import("@/page_inventory.js").then(res => { moduleCache.set("@/page_inventory.js", res); return res; })).then(({ mountInventory }) => {
      if (containerRef.current) {
        containerRef.current.innerHTML = "";
        const res = mountInventory(containerRef.current);
        if (res && typeof res.unmount === "function") {
          cleanup = res.unmount;
        }
      }
    });

    return () => {
      if (cleanup) cleanup();
    };
  }, [searchParams]);

  return <div ref={containerRef} className="inventory-mount-node" style={{ width: "100%" }} />;
}
