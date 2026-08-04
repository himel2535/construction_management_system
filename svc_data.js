import { api } from './lib/apiClient.ts';
import { valToList, getRef, setPath } from "./svc_clientCache.js";
import {
  isTenantScopedPath,
  scopedStoragePath,
  resolveRead,
  readRef,
  onTenantChange,
  getActiveTenantId,
} from "./svc_tenant.js";

export { valToList, readRef, resolveRead, getRef, setPath };

function parsePath(path) {
  if (!path) return { collection: '', id: null, projectId: null };
  const parts = path.split('/').filter(Boolean);
  
  let baseIndex = 0;
  if (parts[0] === 'tenantData' && parts.length >= 3) {
    baseIndex = 2; // skip tenantData and tenantId
  }
  
  const collection = parts[baseIndex];
  
  const isNested = (
    collection === 'siteMaterialLogs' ||
    collection === 'materialLogs' ||
    collection === 'projectRoster' ||
    collection === 'siteSettlements' ||
    collection === 'materialRequests' ||
    collection === 'siteDiaries' ||
    collection === 'equipmentLogs' ||
    collection === 'purchaseOrders' ||
    collection === 'goodsReceipts' ||
    collection === 'projectProgress'
  );

  let id = null;
  let projectId = null;

  if (isNested) {
    if (parts.length > baseIndex + 2) {
      projectId = parts[baseIndex + 1];
      id = parts[baseIndex + 2];
    } else if (parts.length > baseIndex + 1) {
      projectId = parts[baseIndex + 1];
    }
  } else {
    if (parts.length > baseIndex + 1) {
      id = parts[baseIndex + 1];
    }
  }

  return { collection, id, projectId };
}

export async function get(path) {
  try {
    const { collection, id } = parsePath(path);
    if (!collection || !id) return { val: () => null, exists: () => false };
    
    const data = await api.get(collection, id);
    setPath(path, data);
    return {
      val: () => data,
      exists: () => !!data,
    };
  } catch (error) {
    console.error(`[svc_data REST get] Error fetching ${path}:`, error);
    return { val: () => null, exists: () => false };
  }
}

export async function getList(path) {
  try {
    const { collection } = parsePath(path);
    if (!collection) return [];
    
    const dataList = await api.getList(collection);
    
    // The old system expects the cache to store objects by ID
    const map = {};
    for (const item of dataList) {
      if (item.id) map[item.id] = item;
    }
    setPath(path, map);
    
    return dataList;
  } catch (error) {
    console.error(`[svc_data REST getList] Error fetching ${path}:`, error);
    return [];
  }
}

export async function create(path, data) {
  try {
    const tenantId = getActiveTenantId();
    const { collection, projectId } = parsePath(path);
    const payload = {
      ...data,
      tenantId,
      source: data.source || "live",
    };
    
    // Auto-inject projectId for nested collections where path contains it
    if (projectId && !payload.projectId && (
      collection === 'siteMaterialLogs' ||
      collection === 'materialLogs' ||
      collection === 'projectRoster' ||
      collection === 'siteSettlements' ||
      collection === 'materialRequests' ||
      collection === 'siteDiaries' ||
      collection === 'equipmentLogs' ||
      collection === 'purchaseOrders' ||
      collection === 'goodsReceipts' ||
      collection === 'projectProgress'
    )) {
      payload.projectId = projectId;
    }

    const result = await api.create(collection, payload);
    return result.id;
  } catch (error) {
    console.error(`[svc_data REST create] Error creating ${path}:`, error);
    throw error;
  }
}

export async function updatePath(path, data) {
  try {
    const { collection, id, projectId } = parsePath(path);
    if (!id) throw new Error("Cannot update a collection without an ID");
    
    const payload = { ...data, source: data.source || "live" };
    
    if (projectId && !payload.projectId && (
      collection === 'siteMaterialLogs' ||
      collection === 'materialLogs' ||
      collection === 'projectRoster' ||
      collection === 'siteSettlements' ||
      collection === 'materialRequests' ||
      collection === 'siteDiaries' ||
      collection === 'equipmentLogs' ||
      collection === 'purchaseOrders' ||
      collection === 'goodsReceipts' ||
      collection === 'projectProgress'
    )) {
      payload.projectId = projectId;
    }

    await api.update(collection, id, payload);
  } catch (error) {
    console.error(`[svc_data REST updatePath] Error updating ${path}:`, error);
    throw error;
  }
}

export async function removePath(path) {
  try {
    const { collection, id } = parsePath(path);
    if (!id) throw new Error("Cannot remove a collection without an ID");
    
    await api.delete(collection, id);
  } catch (error) {
    console.error(`[svc_data REST removePath] Error removing ${path}:`, error);
    throw error;
  }
}

export function listenList(path, callback) {
  // REST API isn't realtime by default.
  // We fetch initially and invoke the callback.
  let isMounted = true;
  
  getList(path).then((data) => {
    if (isMounted) callback(data);
  });

  return () => {
    isMounted = false;
  };
}

export function listenValue(path, callback) {
  let isMounted = true;
  
  get(path).then(({ val }) => {
    if (isMounted) callback(val());
  });

  return () => {
    isMounted = false;
  };
}

export function listenProjectSub(projectId, subCollection, callback) {
  if (!projectId) {
    callback([]);
    return () => {};
  }
  // The backend might not support query params directly yet for sub-collections.
  // For now, we simulate by fetching the root collection and filtering, 
  // or calling the standard api.getList and filtering locally since it's a mock realtime connection.
  let isMounted = true;
  
  api.getList(subCollection).then((data) => {
    if (isMounted) {
      const filtered = data.filter(item => item.projectId === projectId);
      callback(filtered);
    }
  }).catch(e => {
    if (isMounted) callback([]);
  });

  return () => {
    isMounted = false;
  };
}

export async function propagateClientDenorm(clientId, clientName) {
  console.log("propagateClientDenorm: REST adaptation needed for bulk updates. Skipping for now.");
}

export async function syncClientPrimaryProject({
  clientId,
  clientName,
  projectId = "",
  previousProjectId = "",
}) {
  if (!clientId) return;
  const nextId = projectId || "";
  const prevId = previousProjectId || "";

  if (prevId && prevId !== nextId) {
    try {
      const prev = readRef(`projects/${prevId}`);
      if (prev && prev.clientId === clientId) {
        await updatePath(`projects/${prevId}`, {
          clientId: "",
          clientName: "",
        });
      }
    } catch(e) {}
  }

  if (nextId) {
    await updatePath(`projects/${nextId}`, {
      clientId,
      clientName: clientName || "",
    });
  }
}

export async function propagateCustomerDenorm(customerId, customerName) {
  return propagateClientDenorm(customerId, customerName);
}

export async function runCounterTransaction(path, mutator) {
  // Simple read-modify-write as a fallback for transaction
  const { collection, id } = parsePath(path);
  const current = await api.get(collection, id).catch(() => ({}));
  const nextData = mutator(current);
  await api.update(collection, id, nextData);
  return nextData;
}

export function applySnapshotToStore() {}
