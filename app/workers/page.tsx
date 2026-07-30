"use client";

import { useEffect, useRef } from "react";

export default function WorkersPage() {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    let cleanup: (() => void) | undefined;

    import("@/page_workers.js").then(({ mountWorkers }) => {
      if (containerRef.current) {
        containerRef.current.innerHTML = "";
        const res = mountWorkers(containerRef.current);
        if (res && typeof res.unmount === "function") {
          cleanup = res.unmount;
        }
      }
    });

    return () => {
      if (cleanup) cleanup();
    };
  }, []);

  return <div ref={containerRef} className="workers-mount-node" style={{ width: "100%" }} />;
}
