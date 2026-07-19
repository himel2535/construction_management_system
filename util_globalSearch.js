function norm(value) {
  return String(value || "")
    .toLowerCase()
    .trim();
}

function itemHaystack(item) {
  return [item.label, item.subtitle, ...(item.keywords || [])].map(norm).join(" ");
}

export function buildGlobalSearchIndex({
  navItems = [],
  projects = [],
  clients = [],
  workers = [],
  suppliers = [],
} = {}) {
  const index = [];

  for (const nav of navItems) {
    index.push({
      type: "page",
      typeLabel: "Page",
      label: nav.label,
      subtitle: nav.path,
      path: nav.path,
      keywords: [nav.path.replace(/^\//, "").replace(/-/g, " ")],
    });
  }

  for (const project of projects) {
    if (!project?.id) continue;
    index.push({
      type: "project",
      typeLabel: "Project",
      label: project.name || project.id,
      subtitle: [project.location, project.status, project.code].filter(Boolean).join(" · "),
      path: `/projects?select=${encodeURIComponent(project.id)}`,
      keywords: [project.code, project.location, project.clientName, project.status].filter(Boolean),
    });
  }

  for (const client of clients) {
    if (!client?.id) continue;
    index.push({
      type: "client",
      typeLabel: "Client",
      label: client.name || client.companyName || client.id,
      subtitle: [client.companyName, client.phone, client.email].filter(Boolean).join(" · "),
      path: "/clients",
      keywords: [client.companyName, client.phone, client.email, client.contractRef].filter(Boolean),
    });
  }

  for (const worker of workers) {
    if (!worker?.id) continue;
    index.push({
      type: "worker",
      typeLabel: "Worker",
      label: worker.name || worker.id,
      subtitle: [worker.designation, worker.workerCode, worker.phone].filter(Boolean).join(" · "),
      path: "/workers",
      keywords: [worker.workerCode, worker.phone, worker.designation, worker.trade].filter(Boolean),
    });
  }

  for (const supplier of suppliers) {
    if (!supplier?.id) continue;
    index.push({
      type: "supplier",
      typeLabel: "Supplier",
      label: supplier.name || supplier.companyName || supplier.id,
      subtitle: [supplier.contactPerson, supplier.phone, supplier.email].filter(Boolean).join(" · "),
      path: "/suppliers",
      keywords: [supplier.companyName, supplier.phone, supplier.email, supplier.contactPerson].filter(Boolean),
    });
  }

  return index;
}

export function searchGlobalIndex(index = [], query = "", limit = 8) {
  const q = norm(query);
  if (!q) return [];

  return index
    .map((item) => {
      const hay = itemHaystack(item);
      if (!hay.includes(q)) return null;
      const label = norm(item.label);
      let score = 1;
      if (label === q) score += 20;
      else if (label.startsWith(q)) score += 10;
      else if (label.includes(q)) score += 5;
      if (item.type === "page") score += 2;
      return { item, score };
    })
    .filter(Boolean)
    .sort((a, b) => b.score - a.score || String(a.item.label).localeCompare(String(b.item.label)))
    .slice(0, limit)
    .map((row) => row.item);
}
