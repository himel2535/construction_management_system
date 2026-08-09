import { create, updatePath, getList } from "./svc_data.js";
import { getCurrentUserId, getCurrentUserName } from "./svc_auth.js";
import { todayISO } from "./util_assets.js";

async function nextAssetCode() {
  try {
    const list = await getList("assets");
    const count = list ? list.length : 0;
    return `AST-${String(count + 1).padStart(3, "0")}`;
  } catch (e) {
    return `AST-${String(Date.now()).slice(-5)}`;
  }
}

export async function createAsset(data) {
  const assetCode = data.assetCode || (await nextAssetCode());
  return create("assets", {
    assetCode,
    name: data.name,
    category: data.category || "tools_equipment",
    purchaseDate: data.purchaseDate || todayISO(),
    purchaseValue: Number(data.purchaseValue) || 0,
    vendor: data.vendor || "",
    assignedProjectId: data.assignedProjectId || "",
    status: data.status || "in_use",
    createdBy: getCurrentUserId(),
  });
}

export async function updateAsset(id, data) {
  await updatePath(`assets/${id}`, { ...data, updatedBy: getCurrentUserId() });
}

export async function transferAsset(assetId, { fromProjectId, toProjectId, date, note }) {
  await create("assetAssignments", {
    assetId,
    fromProjectId: fromProjectId || "",
    toProjectId: toProjectId || "",
    date: date || todayISO(),
    assignedBy: getCurrentUserName() || getCurrentUserId(),
    note: note || "",
    type: "transfer",
    createdBy: getCurrentUserId(),
  });
  await updatePath(`assets/${assetId}`, {
    assignedProjectId: toProjectId,
    status: "in_use",
    updatedBy: getCurrentUserId(),
  });
}

export async function assignAsset(assetId, { toProjectId, date, note }) {
  const asset = { id: assetId };
  return transferAsset(assetId, { fromProjectId: "", toProjectId, date, note });
}

export async function logMaintenance(assetId, data) {
  return create("assetMaintenance", {
    assetId,
    lastServiceDate: data.lastServiceDate || todayISO(),
    nextServiceDue: data.nextServiceDue || "",
    maintenanceCost: Number(data.maintenanceCost) || 0,
    description: data.description || "",
    createdBy: getCurrentUserId(),
  });
}
