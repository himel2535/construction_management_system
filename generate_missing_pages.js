const fs = require('fs');
const path = require('path');

const pages = [
  { route: '/projects/new', mod: 'page_project_create.js', fn: 'mountProjectCreate', name: 'ProjectCreatePage' },
  { route: '/clients/new', mod: 'page_client_create.js', fn: 'mountClientCreate', name: 'ClientCreatePage' },
  { route: '/customers/new', mod: 'page_client_create.js', fn: 'mountClientCreate', name: 'CustomerCreatePage' },
  { route: '/sales', mod: 'page_sales.js', fn: 'mountBilling', name: 'SalesPage' },
  { route: '/arbitration', mod: 'page_arbitration.js', fn: 'mountArbitration', name: 'ArbitrationPage' },
  { route: '/reports/project-cost', mod: 'page_reports_detail.js', fn: 'mountReportsProjectCost', name: 'ReportsProjectCostPage' },
  { route: '/reports/analytics', mod: 'page_reports_detail.js', fn: 'mountReportsAnalytics', name: 'ReportsAnalyticsPage' },
  { route: '/reports/worker-payroll', mod: 'page_reports_detail.js', fn: 'mountReportsWorkerPayroll', name: 'ReportsWorkerPayrollPage' },
  { route: '/clients', mod: 'page_customers.js', fn: 'mountClients', name: 'ClientsPage' }
];

pages.forEach(p => {
  const dir = path.join(__dirname, 'app', p.route.substring(1));
  fs.mkdirSync(dir, { recursive: true });
  
  const content = `"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";

export default function ${p.name}() {
  const containerRef = useRef<HTMLDivElement>(null);
  const pathname = usePathname();

  useEffect(() => {
    let cleanup: (() => void) | undefined;
    
    import("@/${p.mod}").then((mod) => {
      if (containerRef.current) {
        containerRef.current.innerHTML = "";
        cleanup = mod.${p.fn}(containerRef.current);
      }
    }).catch(err => {
      console.error("Failed to load ${p.mod}", err);
    });

    return () => {
      if (cleanup) {
        try {
          cleanup();
        } catch (e) {
          console.warn("[${p.name}] cleanup error", e);
        }
      }
    };
  }, [pathname]);

  return <div className="app-root page-${p.name.toLowerCase()}" id="app-root" ref={containerRef}></div>;
}
`;

  fs.writeFileSync(path.join(dir, 'page.tsx'), content);
  console.log(`Created ${path.join('app', p.route.substring(1), 'page.tsx')}`);
});
