"use client";

import { useEffect, useRef } from "react";

export default function AssetsPage() {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    let cleanup: (() => void) | undefined;

    import("@/page_assets.js").then(({ mountAssets }) => {
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
