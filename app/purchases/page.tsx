"use client";

import { useEffect, useRef } from "react";

export default function PurchasesPage() {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    let cleanup: (() => void) | undefined;

    import("@/page_purchases.js").then(({ mountPurchases }) => {
      if (containerRef.current) {
        containerRef.current.innerHTML = "";
        const res = mountPurchases(containerRef.current);
        if (res && typeof res.unmount === "function") {
          cleanup = res.unmount;
        }
      }
    });

    return () => {
      if (cleanup) cleanup();
    };
  }, []);

  return <div ref={containerRef} className="purchases-mount-node" style={{ width: '100%' }} />;
}
