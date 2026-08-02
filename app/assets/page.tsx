"use client";

import { useEffect, useRef } from "react";

const moduleCache = new Map<string, any>();

export default function AssetsPage() {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    let cleanup: (() => void) | undefined;

    (moduleCache.has("@/page_assets.js") ? Promise.resolve(moduleCache.get("@/page_assets.js")) : import("@/page_assets.js").then(res => { moduleCache.set("@/page_assets.js", res); return res; })).then(({ mountAssets }) => {
      if (containerRef.current) {
        containerRef.current.innerHTML = "";
        const res = mountAssets(containerRef.current);
        if (res && typeof res.unmount === "function") {
          cleanup = res.unmount;
        }
      }
    });

    return () => {
      if (cleanup) cleanup();
    };
  }, []);

  return <div ref={containerRef} className="assets-mount-node" style={{ width: "100%" }} />;
}
