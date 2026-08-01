"use client";

import { useEffect, useRef } from "react";
import { useSearchParams } from "next/navigation";

const moduleCache = new Map<string, any>();

export default function ProjectsPage() {
  const containerRef = useRef<HTMLDivElement>(null);

  const searchParams = useSearchParams();

  useEffect(() => {
    if (!containerRef.current) return;
    let cleanup: (() => void) | undefined;

    (moduleCache.has("@/page_projects.js") ? Promise.resolve(moduleCache.get("@/page_projects.js")) : import("@/page_projects.js").then(res => { moduleCache.set("@/page_projects.js", res); return res; })).then(({ mountProjects }) => {
      if (containerRef.current) {
        containerRef.current.innerHTML = "";
        const res = mountProjects(containerRef.current);
        if (res && typeof res.unmount === "function") {
          cleanup = res.unmount;
        }
      }
    });

    return () => {
      if (cleanup) {
        try {
          cleanup();
        } catch (e) {
          console.warn("[ProjectsPage] cleanup error", e);
        }
      }
    };
  }, [searchParams]);

  return <div ref={containerRef} className="projects-mount-node" style={{ width: "100%" }} />;
}
