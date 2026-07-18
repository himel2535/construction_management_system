/** Site issue vouchers — central stock to site transfer */

import { create, updatePath, readRef, getList } from "./svc_data.js";
import { getCurrentUserId } from "./svc_auth.js";
import { todayISO } from "./util_format.js";
import { recordStockOut } from "./svc_inventory.js";
import { checkCentralStock } from "./svc_centralStock.js";

let voucherSeq = 0;

function nextVoucherNo() {
  voucherSeq += 1;
  const d = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  return `IV-${d}-${String(voucherSeq).padStart(4, "0")}`;
}

export async function createIssueVoucherFromRequisition(projectId, mrId, { issuedBy, qtyOverride } = {}) {
  const mr = readRef(`materialRequests/${projectId}/${mrId}`);
  if (!mr) throw new Error("Requisition not found");
  if (mr.requestType !== "central") throw new Error("Not a central requisition");
  if (mr.status !== "approved") throw new Error("Requisition must be approved before issue");
  if (mr.issueVoucherId) throw new Error("Voucher already issued for this requisition");

  const materialId = mr.inventoryMaterialId;
  if (!materialId) throw new Error("Requisition missing inventory material");

  const materials = await getList("inventoryMaterials");
  const material = materials.find((m) => m.id === materialId);
  if (!material) throw new Error("Inventory material not found");

  const qty = Number(qtyOverride ?? mr.qty) || 0;
  if (qty <= 0) throw new Error("Issue quantity must be positive");

  const stockCheck = await checkCentralStock(materialId, qty);
  if (!stockCheck.ok) throw new Error(stockCheck.message);

  const proj = readRef(`projects/${projectId}`) || {};
  const sicId = mr.siteInChargeId || proj.siteInChargeId || "";
  const sic = sicId ? readRef(`siteInCharges/${sicId}`) : null;

  await recordStockOut({
    materialId,
    materialName: material.name,
    quantity: qty,
    projectId,
    issueDate: todayISO(),
    purpose: mr.purpose || mr.title || "Site issue voucher",
    workerId: "",
    workerName: sic?.name || "Site in-charge",
    workerRole: "site_in_charge",
    returnExpected: false,
    issueVoucherRef: mrId,
  });

  const voucherId = await create(`issueVouchers/${projectId}`, {
    requisitionId: mrId,
    projectId,
    inventoryMaterialId: materialId,
    materialName: material.name,
    unit: material.unit || "unit",
    qtyIssued: qty,
    voucherNo: nextVoucherNo(),
    issueDate: todayISO(),
    issuedBy: issuedBy || getCurrentUserId(),
    receivedBySiteInChargeId: sicId,
    receivedByName: sic?.name || "",
    status: "issued",
    createdAt: Date.now(),
    updatedAt: Date.now(),
  });

  await updatePath(`materialRequests/${projectId}/${mrId}`, {
    ...mr,
    issueVoucherId: voucherId,
    deliveryStatus: "delivered",
    updatedAt: Date.now(),
  });

  return voucherId;
}

export function listIssueVouchers(projectId, vouchers = []) {
  return (vouchers || []).filter((v) => !projectId || v.projectId === projectId);
}

export function listPendingCentralRequisitions(allMrsByProject = {}) {
  const pending = [];
  for (const [projectId, mrs] of Object.entries(allMrsByProject)) {
    for (const mr of mrs || []) {
      if (mr.requestType !== "central") continue;
      if (mr.status !== "approved") continue;
      if (mr.issueVoucherId) continue;
      pending.push({ ...mr, projectId });
    }
  }
  return pending.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
}
