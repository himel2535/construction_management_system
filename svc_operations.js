import { setPath } from "./svc_clientCache.js";
import { getActiveTenantId } from "./svc_tenant.js";
import {
  refreshReportsCacheClient as refreshFirebaseReports,
  triggerBackupMetaClient as triggerFirebaseBackup,
} from "./svc_firebaseOps.js";
import { db, ref, get } from "./firebase.js";
import { create, updatePath } from "./svc_data.js";
import { getCurrentUserId } from "./svc_auth.js";

export async function createClientInvoice({
  client,
  project,
  billType,
  amount,
  paidAmount,
  billDate,
  description,
}) {
  const billAmount = Number(amount || 0);
  const paid = Number(paidAmount || 0);
  const status = "draft";

  return create("clientInvoices", {
    clientId: client.id,
    clientName: client.name,
    projectId: project.id,
    projectName: project.name,
    billType: billType || "milestone",
    amount: billAmount,
    paidAmount: paid,
    status,
    billDate: billDate || new Date().toISOString().slice(0, 10),
    description: description || "",
    createdBy: getCurrentUserId(),
  });
}

export async function updateClientInvoiceStatus(id, newStatus, paidAmount = null) {
  const payload = { status: newStatus };
  if (paidAmount !== null) {
    payload.paidAmount = Number(paidAmount);
  }
  return updatePath(`clientInvoices/${id}`, payload);
}

/** @deprecated use createClientInvoice */
export const createSaleBooking = createClientInvoice;

export async function refreshReportsCacheClient() {
  const tenantId = getActiveTenantId();
  await refreshFirebaseReports(tenantId);
  const snap = await get(ref(db, `reportsCache/${tenantId}`));
  const cache = snap.val() || {};
  setPath("reportsCache", cache);
  try {
    const { scanAndEmitAlerts } = await import("./svc_alertEngine.js");
    await scanAndEmitAlerts();
  } catch (_) { /* alerts optional in demo */ }
}

export async function triggerBackupMetaClient() {
  return triggerFirebaseBackup();
}

export async function refreshProjectCostCache() {
  await refreshReportsCacheClient();
}
