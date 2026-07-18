import { setPath } from "./svc_clientCache.js";
import { getActiveTenantId } from "./svc_tenant.js";
import {
  refreshReportsCacheClient as refreshFirebaseReports,
  triggerBackupMetaClient as triggerFirebaseBackup,
  createClientInvoice,
  updateClientInvoiceStatus,
} from "./svc_firebaseOps.js";
import { db, ref, get } from "./firebase.js";

export { createClientInvoice, updateClientInvoiceStatus };

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
