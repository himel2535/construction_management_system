"use client";

import { useEffect, useRef } from "react";

const moduleCache = new Map<string, any>();

export default function ApprovalsPage() {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    let cleanup: (() => void) | undefined;

    (moduleCache.has("@/page_approvals.js") ? Promise.resolve(moduleCache.get("@/page_approvals.js")) : import("@/page_approvals.js").then(res => { moduleCache.set("@/page_approvals.js", res); return res; })).then(({ mountApprovals }) => {
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
