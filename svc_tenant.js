/**
 * Multi-company tenancy — tenant data lives in client cache (from API snapshot).
 */
import { getRef, valToList } from "./svc_clientCache.js";
import { getCurrentUser } from "./svc_auth.js";

export const DEFAULT_TENANT_ID = "tenant_triniti";
export const TENANT_LAKEVIEW_ID = "tenant_lakeview";
const STORAGE_KEY = "erp_active_tenant";
const DEVICE_KEY = "erp_device_id";

export const GLOBAL_ROOT_KEYS = new Set([
  "accounts",
  "vouchers",
  "companyProfile",
  "roles",
  "rolePermissions",
  "counters",
  "backupMeta",
  "reportsCache",
  "tenants",
  "offlineQueue",
  "syncCheckpoints",
  "syncConflicts",
  "payrollEntries",
]);

export const SCOPED_ROOT_KEYS = new Set([
  "projects",
  "clients",
  "clientInvoices",
  "customers",
  "units",
  "sales",
  "purchases",
  "workers",
  "inventoryMaterials",
  "inventoryStockIn",
  "inventoryStockOut",
  "assets",
  "assetAssignments",
  "assetMaintenance",
  "workerAttendance",
  "workerAdvances",
  "workerSalaryPayments",
  "workerSalaryCalculations",
  "workerTransfers",
  "workerDocuments",
  "vendors",
  "suppliers",
  "supplierBills",
  "supplierPayments",
  "supplierProducts",
  "supplierDocuments",
  "supplierNotes",
  "siteInCharges",
  "siteInChargeAssignments",
  "siteMaterialLogs",
  "siteDiaries",
  "projectRoster",
  "siteSettlements",
  "projectPhases",
  "projectMilestones",
  "projectDocuments",
  "boqItems",
  "materialRequests",
  "issueVouchers",
  "purchaseOrders",
  "goodsReceipts",
  "projectProgress",
  "subcontracts",
  "equipmentLogs",
  "projectExpenses",
  "qualityChecks",
  "safetyIncidents",
  "ncrReports",
  "changeOrders",
  "contractClaims",
  "auditLogs",
  "approvalQueue",
  "disputes",
  "arbitrationCases",
  "arbitrationHearings",
  "measurementEntries",
  "ipcBills",
  "ipcBillLines",
  "retentionLedger",
  "eotRequests",
  "govComplianceChecklist",
  "paymentMilestones",
  "projectTeamAssignments",
  "governmentProjectDetails",
  "privateProjectDetails",
  "responsibilityTasks",
  "notifications",
  "projectMessages",
]);

export function getDeviceId() {
  if (typeof localStorage === "undefined") return "device_demo";
  let id = localStorage.getItem(DEVICE_KEY);
  if (!id) {
    id = `dev_${Date.now().toString(36)}`;
    localStorage.setItem(DEVICE_KEY, id);
  }
  return id;
}

let activeTenantId =
  (typeof localStorage !== "undefined" && localStorage.getItem(STORAGE_KEY)) || DEFAULT_TENANT_ID;
const tenantListeners = new Set();

export function getActiveTenantId() {
  return activeTenantId;
}

export function setActiveTenantId(tenantId) {
  if (!tenantId || activeTenantId === tenantId) return;
  activeTenantId = tenantId;
  if (typeof localStorage !== "undefined") localStorage.setItem(STORAGE_KEY, tenantId);
  tenantListeners.forEach((cb) => cb(tenantId));
}

export function onTenantChange(callback) {
  tenantListeners.add(callback);
  return () => tenantListeners.delete(callback);
}

export function getRootCollection(path) {
  return String(path || "").split("/").filter(Boolean)[0] || "";
}

export function isSyncMetaPath(path) {
  const root = getRootCollection(path);
  return root === "offlineQueue" || root === "syncConflicts" || root === "syncCheckpoints";
}

export function isTenantScopedPath(path) {
  const root = getRootCollection(path);
  if (!root || root === "tenantData") return false;
  return SCOPED_ROOT_KEYS.has(root);
}

export function scopedStoragePath(path, tenantId = activeTenantId) {
  if (!isTenantScopedPath(path)) return path;
  return `tenantData/${tenantId}/${path}`;
}

export function readRef(path) {
  return resolveRead(path);
}

export function resolveRead(path) {
  if (!isTenantScopedPath(path)) return getRef(path);
  const scoped = getRef(scopedStoragePath(path));
  if (scoped !== undefined) return scoped;
  if (activeTenantId === DEFAULT_TENANT_ID) return getRef(path);
  return undefined;
}

export function listTenants() {
  return valToList(getRef("tenants") || {});
}

export async function initTenantContext() {
  const user = getCurrentUser();
  const sessionTenant = user?.tenantId || DEFAULT_TENANT_ID;
  const stored =
    (typeof localStorage !== "undefined" && localStorage.getItem(STORAGE_KEY)) || sessionTenant;
  setActiveTenantId(stored || sessionTenant);
  return getActiveTenantId();
}
