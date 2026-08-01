"use client";

import { useEffect, useRef } from "react";
import { useSearchParams } from "next/navigation";

export default function ApprovalsPage() {
  const containerRef = useRef<HTMLDivElement>(null);
  const searchParams = useSearchParams();

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
  }, [searchParams]);

  return <div ref={containerRef} className="approvals-mount-node" style={{ width: "100%" }} />;
}
