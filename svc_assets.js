import { create, updatePath } from "./svc_data.js";
import { getCurrentUserId, getCurrentUserName } from "./svc_auth.js";
import { db, ref, runTransaction, get } from "./firebase.js";
import { todayISO } from "./util_assets.js";

async function nextAssetCode() {
  const counterRef = ref(db, "counters/assetCode");
  const result = await runTransaction(counterRef, (current) => {
    const n = (typeof current === "number" ? current : current?.value) ?? 0;
    return n + 1;
  });
  const n = result.snapshot.val() ?? 1;
  return `AST-${String(n).padStart(3, "0")}`;
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
