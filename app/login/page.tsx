"use client";

import { useEffect, useRef } from "react";

const moduleCache = new Map<string, any>();

export default function LoginPage() {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    let cleanup: (() => void) | undefined;

    (moduleCache.has("@/page_login.js") ? Promise.resolve(moduleCache.get("@/page_login.js")) : import("@/page_login.js").then(res => { moduleCache.set("@/page_login.js", res); return res; })).then(({ mountLogin }) => {
      if (containerRef.current) {
        containerRef.current.innerHTML = "";
        const res = mountLogin(containerRef.current);
        if (res && typeof res.unmount === "function") {
          cleanup = res.unmount;
        }
      }
    });

    return () => {
      if (cleanup) cleanup();
    };
  }, []);

  return <div ref={containerRef} className="login-mount-node" style={{ width: "100%", height: "100vh" }} />;
}
