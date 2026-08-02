import {
  db,
  ref,
  get as fbGet,
  set,
  push,
  update,
  remove,
  onValue,
  runTransaction as fbRunTransaction,
} from "./firebase.js";
import { valToList, getRef, setPath } from "./svc_clientCache.js";
import {
  isTenantScopedPath,
  scopedStoragePath,
  resolveRead,
  readRef,
  onTenantChange,
  getActiveTenantId,
  SCOPED_ROOT_KEYS,
} from "./svc_tenant.js";

export { valToList, readRef, resolveRead, getRef, setPath };

function fbPath(logicalPath) {
  if (!logicalPath) return logicalPath;
  if (logicalPath.startsWith("tenantData/")) return logicalPath;
  if (logicalPath.startsWith("reportsCache/")) {
    const sub = logicalPath.slice("reportsCache/".length);
    return `reportsCache/${getActiveTenantId()}/${sub}`;
  }
  if (logicalPath === "reportsCache") return `reportsCache/${getActiveTenantId()}`;
  if (logicalPath.startsWith("syncConflicts/")) return logicalPath;
  if (isTenantScopedPath(logicalPath)) return scopedStoragePath(logicalPath);
  return logicalPath;
}

function parseNestedPath(path) {
  const parts = path.split("/").filter(Boolean);
  if (parts.length === 2 && SCOPED_ROOT_KEYS.has(parts[0])) {
    return { collection: parts[0], parentId: parts[1] };
  }
  return { collection: parts[0] || path };
}

function syncCacheFromSnapshot(logicalPath, val) {
  if (val === null || val === undefined) {
    setPath(fbPath(logicalPath), isTenantScopedPath(logicalPath) ? {} : null);
    return;
  }
  const cachePath = isTenantScopedPath(logicalPath)
    ? scopedStoragePath(logicalPath)
    : logicalPath;
  if (typeof val === "object" && !Array.isArray(val)) {
    const map = {};
    for (const [id, row] of Object.entries(val)) {
      map[id] = typeof row === "object" && row !== null ? { id, ...row } : row;
    }
    setPath(cachePath, map);
  } else {
    setPath(cachePath, val);
  }
}

export async function get(path) {
  const snap = await fbGet(ref(db, fbPath(path)));
  const v = snap.exists() ? snap.val() : null;
  syncCacheFromSnapshot(path, v);
  return {
    val: () => v,
    exists: () => snap.exists(),
  };
}

export async function getList(path) {
  const snap = await fbGet(ref(db, fbPath(path)));
  syncCacheFromSnapshot(path, snap.val());
  return valToList(resolveRead(path) ?? {});
}

export async function create(path, data) {
  const tenantId = getActiveTenantId();
  const parsed = parseNestedPath(path);
  const now = Date.now();
  const payload = {
    ...data,
    tenantId,
    source: data.source || "live",
    updatedAt: now,
    createdAt: data.createdAt ?? now,
  };
  const target = fbPath(path);
  const newRef = push(ref(db, target));
  await set(newRef, payload);
  return newRef.key;
}

export async function updatePath(path, data) {
  const parts = path.split("/").filter(Boolean);
  const now = Date.now();
  const payload = { ...data, updatedAt: now, source: data.source || "live" };
  await update(ref(db, fbPath(path)), payload);
}

export async function removePath(path) {
  await remove(ref(db, fbPath(path)));
}

export function listenList(path, callback) {
  const r = ref(db, fbPath(path));
  const handler = (snap) => {
    syncCacheFromSnapshot(path, snap.val());
    callback(valToList(resolveRead(path) ?? {}));
  };
  const unsub = onValue(r, handler);
  const unsubTenant = onTenantChange(() => {
    callback(valToList(resolveRead(path) ?? {}));
  });
  return () => {
    unsub();
    unsubTenant();
  };
}

export function listenValue(path, callback) {
  const r = ref(db, fbPath(path));
  const handler = (snap) => {
    const val = snap.val();
    syncCacheFromSnapshot(path, val);
    if (path.startsWith("reportsCache/")) {
      const sub = path.split("/")[1];
      const parent = getRef("reportsCache") || {};
      setPath("reportsCache", { ...parent, [sub]: val });
      callback(val);
      return;
    }
    if (path === "companyProfile/main" || path.includes("/")) {
      callback(val);
    } else {
      callback(resolveRead(path) ?? val ?? null);
    }
  };
  const unsub = onValue(r, handler);
  const unsubTenant = onTenantChange(() => {});
  return () => {
    unsub();
    unsubTenant();
  };
}

export function listenProjectSub(projectId, subCollection, callback) {
  if (!projectId) {
    callback([]);
    return () => {};
  }
  return listenList(`${subCollection}/${projectId}`, callback);
}

export async function propagateClientDenorm(clientId, clientName) {
  const tenantId = getActiveTenantId();
  const prefix = `tenantData/${tenantId}`;
  const invoicesSnap = await fbGet(ref(db, `${prefix}/clientInvoices`));

  const updates = {};
  const invoices = invoicesSnap.val();
  if (invoices) {
    for (const [id, row] of Object.entries(invoices)) {
      if (row.clientId === clientId) {
        updates[`${prefix}/clientInvoices/${id}/clientName`] = clientName;
      }
    }
  }
  if (Object.keys(updates).length) {
    await update(ref(db), updates);
  }
}

/**
 * Keep project.clientId in sync with a client's primary project selection.
 * Clears the previous project's link only if it still pointed at this client.
 * @param {{ clientId: string, clientName: string, projectId?: string, previousProjectId?: string }} opts
 */
export async function syncClientPrimaryProject({
  clientId,
  clientName,
  projectId = "",
  previousProjectId = "",
}) {
  if (!clientId) return;
  const now = Date.now();
  const nextId = projectId || "";
  const prevId = previousProjectId || "";

  if (prevId && prevId !== nextId) {
    const prev = readRef(`projects/${prevId}`);
    if (prev && prev.clientId === clientId) {
      await updatePath(`projects/${prevId}`, {
        clientId: "",
        clientName: "",
        updatedAt: now,
      });
    }
  }

  if (nextId) {
    await updatePath(`projects/${nextId}`, {
      clientId,
      clientName: clientName || "",
      updatedAt: now,
    });
  }
}

/** @deprecated use propagateClientDenorm */
export async function propagateCustomerDenorm(customerId, customerName) {
  return propagateClientDenorm(customerId, customerName);
}

export async function runCounterTransaction(path, mutator) {
  const r = ref(db, fbPath(path));
  const result = await fbRunTransaction(r, (current) => mutator(current));
  return result.snapshot.val();
}

/** No-op for Firebase boot (snapshot loaded via listeners) */
export function applySnapshotToStore() {}
