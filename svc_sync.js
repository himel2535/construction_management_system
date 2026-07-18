/**
 * Offline queue — replay to Firebase when back online.
 */
import { updatePath, listenList, create } from "./svc_data.js";
import { valToList, setPath, getRef } from "./svc_clientCache.js";
import { getActiveTenantId, getDeviceId } from "./svc_tenant.js";
import { getCurrentUserId } from "./svc_auth.js";

export { getDeviceId };

export function isOnline() {
  return typeof navigator === "undefined" ? true : navigator.onLine;
}

export async function enqueueOfflineOp(op) {
  const deviceId = getDeviceId();
  const tenantId = getActiveTenantId();
  const collPath = `offlineQueue/${deviceId}`;
  const opId = await create(collPath, {
    ...op,
    deviceId,
    tenantId,
    status: "pending",
    attempts: 0,
    createdAt: Date.now(),
    actorId: getCurrentUserId(),
  });
  persistLocalQueueBackup(deviceId);
  return opId;
}

function persistLocalQueueBackup(deviceId) {
  if (typeof localStorage === "undefined") return;
  const q = getRef(`offlineQueue/${deviceId}`) || {};
  localStorage.setItem(`erp_offline_queue_${deviceId}`, JSON.stringify(q));
}

export function restoreLocalQueueBackup() {
  if (typeof localStorage === "undefined") return;
  const deviceId = getDeviceId();
  const key = `erp_offline_queue_${deviceId}`;
  const raw = localStorage.getItem(key);
  if (!raw) return;
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object") {
      setPath(`offlineQueue/${deviceId}`, parsed);
    }
  } catch {
    /* ignore corrupt backup */
  }
}

export async function processOfflineQueue() {
  if (!isOnline()) {
    return { applied: 0, conflicts: 0, pending: 0 };
  }
  const deviceId = getDeviceId();
  const ops = valToList(getRef(`offlineQueue/${deviceId}`) || {}).filter(
    (o) => o.status === "pending"
  );
  let applied = 0;
  for (const op of ops) {
    try {
      if (op.type === "create" && op.path && op.payload) {
        await create(op.path, op.payload);
      } else if (op.type === "update" && op.path && op.payload) {
        await updatePath(op.path, op.payload);
      }
      await updatePath(`offlineQueue/${deviceId}/${op.id}`, {
        status: "applied",
        appliedAt: Date.now(),
      });
      applied++;
    } catch (e) {
      console.warn("[ERP] offline op failed", op, e);
      await updatePath(`offlineQueue/${deviceId}/${op.id}`, {
        status: "failed",
        lastError: e.message,
        attempts: (op.attempts || 0) + 1,
      });
    }
  }
  persistLocalQueueBackup(deviceId);
  const { refreshReportsCacheClient } = await import("./svc_operations.js");
  await refreshReportsCacheClient();
  const pending = ops.length - applied;
  return { applied, conflicts: 0, pending };
}

export async function resolveConflict(conflictId, resolution) {
  const tenantId = getActiveTenantId();
  const path = `syncConflicts/${tenantId}/${conflictId}`;
  const row = getRef(path);
  if (!row) throw new Error("Conflict not found");

  if (resolution === "keep_client") {
    const cur = getRef(row.path) || {};
    await updatePath(row.path, { ...cur, ...row.clientSnapshot, updatedAt: Date.now() });
  }

  await updatePath(path, {
    status: "resolved",
    resolution,
    resolvedAt: Date.now(),
    updatedAt: Date.now(),
  });

  const { refreshReportsCacheClient } = await import("./svc_operations.js");
  await refreshReportsCacheClient();
  return true;
}

export function listenSyncHealth(callback) {
  const deviceId = getDeviceId();
  const unsubQ = listenList(`offlineQueue/${deviceId}`, (ops) => callback({ ops, deviceId }));
  const unsubC = listenList(`syncConflicts/${getActiveTenantId()}`, (conflicts) =>
    callback({ conflicts, deviceId })
  );
  return () => {
    unsubQ();
    unsubC();
  };
}
