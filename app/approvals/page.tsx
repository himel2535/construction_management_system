"use client";

import { useEffect, useRef } from "react";

export default function ApprovalsPage() {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    let cleanup: (() => void) | undefined;

    import("@/page_approvals.js").then(({ mountApprovals }) => {
      if (containerRef.current) {
        containerRef.current.innerHTML = "";
        const res = mountApprovals(containerRef.current);
        if (res && typeof res.unmount === "function") {
          cleanup = res.unmount;
        }
      }
    });

    return () => {
      if (cleanup) cleanup();
    };
  }, []);

  return <div ref={containerRef} className="approvals-mount-node" style={{ width: "100%" }} />;
}
