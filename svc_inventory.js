import { create, updatePath, getList } from "./svc_data.js";
import { getCurrentUserId } from "./svc_auth.js";
import { todayISO } from "./util_inventory.js";

export async function createMaterial(data) {
  return create("inventoryMaterials", {
    name: data.name,
    category: data.category || "cement",
    unit: data.unit || "bag",
    currentStock: Number(data.currentStock) || 0,
    reorderLevel: Number(data.reorderLevel) || 0,
    status: "active",
    createdBy: getCurrentUserId(),
  });
}

export async function updateMaterial(id, data) {
  await updatePath(`inventoryMaterials/${id}`, { ...data, updatedBy: getCurrentUserId() });
}

async function adjustStock(materialId, delta) {
  const list = await getList("inventoryMaterials");
  const m = list.find((x) => x.id === materialId);
  if (!m) throw new Error("Material not found");
  const next = (Number(m.currentStock) || 0) + delta;
  if (next < 0) throw new Error("Insufficient stock");
  await updatePath(`inventoryMaterials/${materialId}`, { currentStock: next, updatedBy: getCurrentUserId() });
  return next;
}

export async function recordStockIn(data) {
  const qty = Number(data.quantity) || 0;
  if (qty <= 0) throw new Error("Quantity must be positive");
  const id = await create("inventoryStockIn", {
    materialId: data.materialId,
    materialName: data.materialName,
    quantity: qty,
    supplierId: data.supplierId || "",
    supplierName: data.supplierName || "",
    invoiceRef: data.invoiceRef || "",
    date: data.date || todayISO(),
    projectId: data.projectId || "",
    note: data.note || "",
    grnId: data.grnId || "",
    grnProjectId: data.grnProjectId || "",
    grnLineIndex: data.grnLineIndex ?? null,
    grnDedupeKey: data.grnDedupeKey || "",
    invoiceNo: data.invoiceNo || "",
    receivedBy: data.receivedBy || "",
    unitPrice: Number(data.unitPrice) || 0,
    source: data.source || "manual",
    createdBy: getCurrentUserId(),
  });
  await adjustStock(data.materialId, qty);
  return id;
}

export async function recordStockOut(data) {
  const qty = Number(data.quantity) || 0;
  if (qty <= 0) throw new Error("Quantity must be positive");
  await adjustStock(data.materialId, -qty);
  return create("inventoryStockOut", {
    materialId: data.materialId,
    materialName: data.materialName,
    quantity: qty,
    workerId: data.workerId || "",
    workerName: data.workerName || "",
    workerRole: data.workerRole || "",
    projectId: data.projectId || "",
    issueDate: data.issueDate || todayISO(),
    purpose: data.purpose || "",
    returnExpected: Boolean(data.returnExpected),
    returnDate: data.returnDate || "",
    returnStatus: data.returnExpected ? data.returnStatus || "not_returned" : "returned",
    issueVoucherRef: data.issueVoucherRef || "",
    createdBy: getCurrentUserId(),
  });
}

export async function updateStockOutReturn(stockOutId, returnStatus) {
  await updatePath(`inventoryStockOut/${stockOutId}`, {
    returnStatus,
    returnDate: todayISO(),
    updatedBy: getCurrentUserId(),
  });
}

export { listLowStock, listPendingReturns, buildStockLedger, materialIssueHistory } from "./util_inventory.js";
