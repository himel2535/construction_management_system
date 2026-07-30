"use client";

import { useEffect, useRef } from "react";

export default function CustomersPage() {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    let cleanup: (() => void) | undefined;

    import("@/page_customers.js").then(({ mountClients }) => {
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

  return <div ref={containerRef} className="clients-mount-node" style={{ width: '100%' }} />;
}
