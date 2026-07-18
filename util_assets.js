/** Assets module helpers */

export const ASSET_CATEGORIES = [
  { id: "heavy_machinery", label: "Heavy Machinery" },
  { id: "vehicle", label: "Vehicle" },
  { id: "tools_equipment", label: "Tools & Equipment" },
];

export const ASSET_STATUSES = [
  { id: "in_use", label: "In Use" },
  { id: "idle", label: "Idle" },
  { id: "under_repair", label: "Under Repair" },
  { id: "damaged", label: "Damaged" },
  { id: "retired", label: "Retired" },
];

export const STATUS_FILTERS = [{ id: "all", label: "All" }, ...ASSET_STATUSES];

export function categoryLabel(id) {
  return ASSET_CATEGORIES.find((c) => c.id === id)?.label || id || "—";
}

export function assetStatusLabel(id) {
  return ASSET_STATUSES.find((s) => s.id === id)?.label || id || "—";
}

export function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

export function isMaintenanceOverdue(record, today = todayISO()) {
  return record?.nextServiceDue ? record.nextServiceDue < today : false;
}

export function filterAssets(list, { status = "all", query = "" } = {}) {
  let out = [...(list || [])];
  if (status !== "all") out = out.filter((a) => a.status === status);
  const q = query.trim().toLowerCase();
  if (q) {
    out = out.filter(
      (a) =>
        String(a.name || "").toLowerCase().includes(q) ||
        String(a.assetCode || "").toLowerCase().includes(q)
    );
  }
  return out.sort((a, b) => String(a.name).localeCompare(String(b.name)));
}

export function paginateSlice(list, page, pageSize = 10) {
  const total = list.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(Math.max(1, page), totalPages);
  const start = (safePage - 1) * pageSize;
  return { items: list.slice(start, start + pageSize), total, totalPages, page: safePage };
}

export function latestMaintenanceByAsset(maintenanceRows) {
  const map = new Map();
  for (const m of maintenanceRows || []) {
    const cur = map.get(m.assetId);
    if (!cur || (m.lastServiceDate || "") >= (cur.lastServiceDate || "")) map.set(m.assetId, m);
  }
  return map;
}
