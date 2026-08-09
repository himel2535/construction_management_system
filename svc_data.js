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
  
  const isProjectNested = (
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

  if (parts.length > baseIndex + 2) {
    // e.g. supplierProducts/supplierId/productId
    const parentId = parts[baseIndex + 1];
    id = parts[parts.length - 1]; // the actual item id is the last part
    if (isProjectNested) {
      projectId = parentId;
    }
  } else if (parts.length > baseIndex + 1) {
    // e.g. supplierProducts/supplierId (for creation or list listening)
    id = parts[baseIndex + 1];
    if (isProjectNested) {
      projectId = id;
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

const listMemoryCache = new Map();
const CLIENT_CACHE_TTL_MS = 10000;

export function invalidateClientCache(pathPattern) {
  if (!pathPattern) {
    listMemoryCache.clear();
    return;
  }
  for (const key of listMemoryCache.keys()) {
    if (key.includes(pathPattern)) {
      listMemoryCache.delete(key);
    }
  }
}

export async function getList(path) {
  try {
    const { collection, id } = parsePath(path);
    if (!collection) return [];
    
    const cached = listMemoryCache.get(path);
    if (cached && Date.now() - cached.timestamp < CLIENT_CACHE_TTL_MS) {
      return cached.data;
    }

    let query = "";
    if (id) {
      if (collection.startsWith("supplier")) query = `?supplierId=${id}`;
      else if (collection.startsWith("project")) query = `?projectId=${id}`;
      else if (collection.startsWith("asset")) query = `?assetId=${id}`;
      else query = `?parentId=${id}`;
    }
    
    const dataList = await api.getList(collection + query);
    
    // Cache the list
    listMemoryCache.set(path, { timestamp: Date.now(), data: dataList });

    // The old system expects the cache to store objects by ID
    const map = {};
    for (const item of dataList) {
      if (item.id) map[item.id] = item;
    }
    setPath(path, map);
    
    return dataList;
  } catch (error) {
    console.error(`[svc_data REST getList] Error fetching ${path}:`, error);
    return listMemoryCache.get(path)?.data || [];
  }
}

export async function create(path, data) {
  try {
    const tenantId = getActiveTenantId();
    const { collection, id, projectId } = parsePath(path);
    const payload = {
      ...data,
      tenantId,
      source: data.source || "live",
    };
    
    // Inject foreign key for subcollections
    if (id) {
      if (collection.startsWith("supplier")) payload.supplierId = id;
      else if (collection.startsWith("project")) payload.projectId = id;
      else if (collection.startsWith("asset")) payload.assetId = id;
      else payload.parentId = id;
    }
    
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
    invalidateClientCache(collection);
    window.dispatchEvent(new CustomEvent("backend_data_changed"));
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
    invalidateClientCache(collection);
    window.dispatchEvent(new CustomEvent("backend_data_changed"));
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
    invalidateClientCache(collection);
    window.dispatchEvent(new CustomEvent("backend_data_changed"));
  } catch (error) {
    console.error(`[svc_data REST removePath] Error removing ${path}:`, error);
    throw error;
  }
}

export function listenList(path, callback) {
  let isMounted = true;
  
  // Instant SWR callback if cached data exists in memory
  const cached = listMemoryCache.get(path);
  if (cached?.data) {
    callback(cached.data);
  }

  const fetch = () => {
    getList(path).then((data) => {
      if (isMounted) callback(data);
    });
  };

  fetch();

  const listener = () => {
    invalidateClientCache(path);
    fetch();
  };
  window.addEventListener("backend_data_changed", listener);

  return () => {
    isMounted = false;
    window.removeEventListener("backend_data_changed", listener);
  };
}

export function listenValue(path, callback) {
  let isMounted = true;
  
  const fetch = () => {
    get(path).then(({ val }) => {
      if (isMounted) callback(val());
    });
  };

  fetch();

  const listener = () => fetch();
  window.addEventListener("backend_data_changed", listener);

  return () => {
    isMounted = false;
    window.removeEventListener("backend_data_changed", listener);
  };
}

export function listenProjectSub(projectId, subCollection, callback) {
  if (!projectId) {
    callback([]);
    return () => {};
  }
  let isMounted = true;
  
  const fetch = () => {
    api.getList(subCollection).then((data) => {
      if (isMounted) {
        const filtered = data.filter(item => item.projectId === projectId);
        callback(filtered);
      }
    }).catch(e => {
      if (isMounted) callback([]);
    });
  };

  fetch();

  const listener = () => fetch();
  window.addEventListener("backend_data_changed", listener);

  return () => {
    isMounted = false;
    window.removeEventListener("backend_data_changed", listener);
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
