/** Inventory module helpers */

export const MATERIAL_CATEGORIES = [
  { id: "cement", label: "Cement" },
  { id: "rod", label: "Rod" },
  { id: "brick", label: "Brick" },
  { id: "sand", label: "Sand" },
  { id: "stone_chips", label: "Stone Chips" },
  { id: "tiles", label: "Tiles" },
  { id: "paint", label: "Paint" },
  { id: "electrical", label: "Electrical" },
  { id: "plumbing", label: "Plumbing" },
  { id: "tools", label: "Tools" },
];

export const MATERIAL_UNITS = [
  { id: "bag", label: "bag" },
  { id: "ton", label: "ton" },
  { id: "piece", label: "piece" },
  { id: "cft", label: "cft" },
  { id: "kg", label: "kg" },
  { id: "liter", label: "liter" },
];

export function categoryLabel(id) {
  return MATERIAL_CATEGORIES.find((c) => c.id === id)?.label || id || "—";
}

export function unitLabel(id) {
  return MATERIAL_UNITS.find((u) => u.id === id)?.label || id || "—";
}

export function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

export function isLowStock(material) {
  const stock = Number(material?.currentStock) || 0;
  const reorder = Number(material?.reorderLevel) || 0;
  return reorder > 0 && stock < reorder;
}

export function daysPending(issueDate, today = todayISO()) {
  const a = new Date(issueDate);
  const b = new Date(today);
  if (Number.isNaN(a.getTime())) return 0;
  return Math.max(0, Math.floor((b - a) / 86400000));
}

export function listLowStock(materials) {
  return (materials || []).filter(isLowStock);
}

export function listPendingReturns(stockOutRows, today = todayISO()) {
  return (stockOutRows || [])
    .filter((r) => r.returnExpected && r.returnStatus === "not_returned")
    .map((r) => ({ ...r, daysPending: daysPending(r.issueDate, today) }))
    .sort((a, b) => b.daysPending - a.daysPending);
}

export function buildStockLedger(stockInRows, stockOutRows, filters = {}) {
  const { materialId, projectId, workerId, dateFrom, dateTo } = filters;
  const rows = [];
  for (const r of stockInRows || []) {
    if (materialId && materialId !== "all" && r.materialId !== materialId) continue;
    if (projectId && projectId !== "all" && r.projectId !== projectId) continue;
    if (dateFrom && r.date < dateFrom) continue;
    if (dateTo && r.date > dateTo) continue;
    rows.push({ date: r.date, type: "in", materialName: r.materialName, qty: Number(r.quantity) || 0, person: r.supplierName || "—", projectId: r.projectId, note: r.note || "" });
  }
  for (const r of stockOutRows || []) {
    if (materialId && materialId !== "all" && r.materialId !== materialId) continue;
    if (projectId && projectId !== "all" && r.projectId !== projectId) continue;
    if (workerId && workerId !== "all" && r.workerId !== workerId) continue;
    if (dateFrom && r.issueDate < dateFrom) continue;
    if (dateTo && r.issueDate > dateTo) continue;
    rows.push({ date: r.issueDate, type: "out", materialName: r.materialName, qty: Number(r.quantity) || 0, person: r.workerName || "—", projectId: r.projectId, note: r.purpose || "", returnStatus: r.returnStatus });
  }
  rows.sort((a, b) => String(a.date).localeCompare(String(b.date)));
  let balance = 0;
  return rows.map((r) => {
    balance += r.type === "in" ? r.qty : -r.qty;
    return { ...r, balance };
  });
}

export function materialIssueHistory(materialId, stockOutRows) {
  return (stockOutRows || [])
    .filter((r) => r.materialId === materialId)
    .sort((a, b) => String(b.issueDate).localeCompare(String(a.issueDate)));
}

export function paginateSlice(list, page, pageSize = 10) {
  const total = list.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(Math.max(1, page), totalPages);
  const start = (safePage - 1) * pageSize;
  return { items: list.slice(start, start + pageSize), total, totalPages, page: safePage };
}
