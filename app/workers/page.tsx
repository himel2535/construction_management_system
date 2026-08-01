"use client";

import { useEffect, useRef } from "react";
import { useSearchParams } from "next/navigation";

const moduleCache = new Map<string, any>();

export default function WorkersPage() {
  const containerRef = useRef<HTMLDivElement>(null);
  const searchParams = useSearchParams();

  useEffect(() => {
    if (!containerRef.current) return;
    let cleanup: (() => void) | undefined;

    (moduleCache.has("@/page_workers.js") ? Promise.resolve(moduleCache.get("@/page_workers.js")) : import("@/page_workers.js").then(res => { moduleCache.set("@/page_workers.js", res); return res; })).then(({ mountWorkers }) => {
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
  }, [searchParams]);

  return <div ref={containerRef} className="workers-mount-node" style={{ width: "100%" }} />;
}
