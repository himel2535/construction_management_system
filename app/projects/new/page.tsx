"use client";

import { useEffect, useRef } from "react";
import { useSearchParams } from "next/navigation";
import { usePathname } from "next/navigation";

const moduleCache = new Map<string, any>();

export default function ProjectCreatePage() {
  const containerRef = useRef<HTMLDivElement>(null);
  const searchParams = useSearchParams();
  const pathname = usePathname();

  useEffect(() => {
    let cleanup: (() => void) | undefined;
    
    (moduleCache.has("@/page_project_create.js") ? Promise.resolve(moduleCache.get("@/page_project_create.js")) : import("@/page_project_create.js").then(res => { moduleCache.set("@/page_project_create.js", res); return res; })).then((mod) => {
      if (containerRef.current) {
        containerRef.current.innerHTML = "";
        cleanup = mod.mountProjectCreate(containerRef.current);
      }
    }).catch(err => {
      console.error("Failed to load page_project_create.js", err);
    });

    return () => {
      if (cleanup) {
        try {
          cleanup();
        } catch (e) {
          console.warn("[ProjectCreatePage] cleanup error", e);
        }
      }
    };
  }, [pathname, searchParams]);

  return <div className="app-root page-projectcreatepage" id="app-root" ref={containerRef}></div>;
}
