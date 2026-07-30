"use client";

import { useEffect, useRef } from "react";

export default function ProjectsPage() {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    let cleanup: (() => void) | undefined;

    import("@/page_projects.js").then(({ mountProjects }) => {
      if (containerRef.current) {
        containerRef.current.innerHTML = "";
        const res = mountProjects(containerRef.current);
        if (res && typeof res.unmount === "function") {
          cleanup = res.unmount;
        }
      }
    });

    return () => {
      if (cleanup) cleanup();
    };
  }, []);

  return <div ref={containerRef} className="projects-mount-node" style={{ width: '100%' }} />;
}
