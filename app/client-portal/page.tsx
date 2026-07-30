"use client";

import { useEffect, useRef } from "react";

export default function ClientPortalPage() {
  const containerRef = useRef<HTMLDivElement>(null);

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
      if (cleanup) cleanup();
    };
  }, []);

  return <div ref={containerRef} className="client-portal-mount-node" style={{ width: "100%" }} />;
}
