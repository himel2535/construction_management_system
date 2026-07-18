/** Central warehouse stock — GRN to stock-in bridge */

import { readRef, getList } from "./svc_data.js";
import { getCurrentUserId } from "./svc_auth.js";
import { recordStockIn } from "./svc_inventory.js";
import { mapProductToInventoryMaterial } from "./util_stockLedger.js";

export async function checkCentralStock(materialId, qty) {
  const materials = await getList("inventoryMaterials");
  const m = materials.find((x) => x.id === materialId);
  if (!m) return { ok: false, message: "Material not found in central stock" };
  const available = Number(m.currentStock) || 0;
  if (available < qty) {
    return { ok: false, message: `Insufficient central stock (${available} available)` };
  }
  return { ok: true, available };
}

/** Post GRN receive lines to central inventoryStockIn (idempotent per grnId+lineIndex). */
export async function postGrnToCentralStock(projectId, grnId, { receivedBy, lines = [], invoiceNo = "" } = {}) {
  const materials = await getList("inventoryMaterials");
  const existingIn = await getList("inventoryStockIn");
  const posted = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const qty = Number(line.qty ?? line.receivedQty) || 0;
    if (qty <= 0) continue;

    const dedupeKey = `${grnId}_${i}`;
    if (existingIn.some((r) => r.grnDedupeKey === dedupeKey)) continue;

    const material =
      (line.inventoryMaterialId && materials.find((m) => m.id === line.inventoryMaterialId)) ||
      mapProductToInventoryMaterial(line.productName, materials);

    if (!material) {
      throw new Error(`No inventory material mapped for "${line.productName || "line " + (i + 1)}"`);
    }

    const stockInId = await recordStockIn({
      materialId: material.id,
      materialName: material.name,
      quantity: qty,
      supplierId: line.supplierId || "",
      supplierName: line.supplierName || "",
      invoiceRef: invoiceNo || `GRN-${grnId}`,
      date: line.date || undefined,
      projectId: "",
      note: `Central GRN ${grnId} from project ${projectId}`,
      grnId,
      grnProjectId: projectId,
      grnLineIndex: i,
      grnDedupeKey: dedupeKey,
      invoiceNo,
      receivedBy: receivedBy || getCurrentUserId(),
      unitPrice: Number(line.rate ?? line.unitPrice) || 0,
      source: "grn",
    });
    posted.push({ stockInId, materialId: material.id, qty });
  }

  const grn = readRef(`goodsReceipts/${projectId}/${grnId}`) || {};
  if (posted.length) {
    const { updatePath } = await import("./svc_data.js");
    await updatePath(`goodsReceipts/${projectId}/${grnId}`, {
      ...grn,
      centralStockPosted: true,
      centralStockPostedAt: Date.now(),
      updatedAt: Date.now(),
    });
  }
  return posted;
}

export function grnHasCentralStock(grn, stockInRows = []) {
  if (grn?.centralStockPosted) return true;
  return stockInRows.some((r) => r.grnId === grn?.id);
}
