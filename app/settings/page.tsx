"use client";

import { useEffect, useRef } from "react";
import { useSearchParams } from "next/navigation";

const moduleCache = new Map<string, any>();

export default function SettingsPage() {
  const containerRef = useRef<HTMLDivElement>(null);
  const searchParams = useSearchParams();

  useEffect(() => {
    if (!containerRef.current) return;
    let cleanup: (() => void) | undefined;

    (moduleCache.has("@/page_settings.js") ? Promise.resolve(moduleCache.get("@/page_settings.js")) : import("@/page_settings.js").then(res => { moduleCache.set("@/page_settings.js", res); return res; })).then(({ mountSettings }) => {
      if (containerRef.current) {
        containerRef.current.innerHTML = "";
        const res = mountSettings(containerRef.current);
        if (res && typeof res.unmount === "function") {
          cleanup = res.unmount;
        }
      }
    });

    return () => {
      if (cleanup) cleanup();
    };
  }, [searchParams]);

  return <div ref={containerRef} className="settings-mount-node" style={{ width: "100%" }} />;
}
