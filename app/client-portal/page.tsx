"use client";

import { useEffect, useRef } from "react";
import { useSearchParams } from "next/navigation";

export default function ClientPortalPage() {
  const containerRef = useRef<HTMLDivElement>(null);
  const searchParams = useSearchParams();

  useEffect(() => {
    if (!containerRef.current) return;
    let cleanup: (() => void) | undefined;

    import("@/page_client_portal.js").then(({ mountClientPortal }) => {
      if (containerRef.current) {
        containerRef.current.innerHTML = "";
        const res = mountClientPortal(containerRef.current);
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
          console.warn("[ClientPortalPage] cleanup error", e);
        }
      }
    };
  }, [searchParams]);

  return <div ref={containerRef} className="client-portal-mount-node" style={{ width: "100%" }} />;
}
