"use client";

import { useEffect, useRef } from "react";

export default function SiteInchargePage() {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    let cleanup: (() => void) | undefined;

    import("@/page_site_incharge.js").then(({ mountSiteIncharge }) => {
      if (containerRef.current) {
        containerRef.current.innerHTML = "";
        const res = mountSiteIncharge(containerRef.current);
        if (res && typeof res.unmount === "function") {
          cleanup = res.unmount;
        }
      }
    });

    return () => {
      if (cleanup) cleanup();
    };
  }, []);

  return <div ref={containerRef} className="site-incharge-mount-node" style={{ width: "100%" }} />;
}
