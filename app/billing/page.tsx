"use client";

import { useEffect, useRef } from "react";
import { useSearchParams } from "next/navigation";

export default function BillingPage() {
  const containerRef = useRef<HTMLDivElement>(null);
  const searchParams = useSearchParams();

  useEffect(() => {
    if (!containerRef.current) return;
    let cleanup: (() => void) | undefined;

    import("@/page_sales.js").then(({ mountBilling }) => {
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
  }, [searchParams]);

  return <div ref={containerRef} className="billing-mount-node" style={{ width: "100%" }} />;
}
