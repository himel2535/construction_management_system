"use client";

import { useEffect, useRef } from "react";

export default function SettingsPage() {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    let cleanup: (() => void) | undefined;

    import("@/page_settings.js").then(({ mountSettings }) => {
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
  }, []);

  return <div ref={containerRef} className="settings-mount-node" style={{ width: '100%' }} />;
}
