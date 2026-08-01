"use client";

import { useEffect, useRef } from "react";
import { useSearchParams } from "next/navigation";
import { usePathname } from "next/navigation";

export default function ClientCreatePage() {
  const containerRef = useRef<HTMLDivElement>(null);
  const searchParams = useSearchParams();
  const pathname = usePathname();

  useEffect(() => {
    let cleanup: (() => void) | undefined;
    
    import("@/page_client_create.js").then((mod) => {
      if (containerRef.current) {
        containerRef.current.innerHTML = "";
        cleanup = mod.mountClientCreate(containerRef.current);
      }
    }).catch(err => {
      console.error("Failed to load page_client_create.js", err);
    });

    return () => {
      if (cleanup) {
        try {
          cleanup();
        } catch (e) {
          console.warn("[ClientCreatePage] cleanup error", e);
        }
      }
    };
  }, [pathname, searchParams]);

  return <div className="app-root page-clientcreatepage" id="app-root" ref={containerRef}></div>;
}
