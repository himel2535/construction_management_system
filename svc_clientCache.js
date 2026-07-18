/** In-memory client cache (hydrated from API snapshot + polling). */

let data = {};
const listeners = new Map();

function parsePath(path) {
  return path.split("/").filter(Boolean);
}

export function getRef(path) {
  const parts = parsePath(path);
  let cur = data;
  for (const p of parts) {
    if (cur == null || typeof cur !== "object") return undefined;
    cur = cur[p];
  }
  return cur;
}

function setAtPath(path, value) {
  const parts = parsePath(path);
  if (!parts.length) return;
  let cur = data;
  for (let i = 0; i < parts.length - 1; i++) {
    if (!cur[parts[i]] || typeof cur[parts[i]] !== "object") cur[parts[i]] = {};
    cur = cur[parts[i]];
  }
  cur[parts[parts.length - 1]] = value;
  notify(path);
}

function notify(changedPath) {
  for (const [path, cbs] of listeners) {
    if (
      changedPath === path ||
      changedPath.startsWith(path + "/") ||
      path.startsWith(changedPath + "/")
    ) {
      for (const cb of cbs) cb();
    }
  }
}

export function clearCache() {
  data = {};
  listeners.clear();
}

export function valToList(val) {
  if (!val || typeof val !== "object" || Array.isArray(val)) return [];
  return Object.entries(val).map(([id, row]) => ({ id, ...row }));
}

export function push(path, payload) {
  const coll = getRef(path) || {};
  const id = `id_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  coll[id] = { ...payload, updatedAt: Date.now() };
  setAtPath(path, coll);
  return id;
}

export function setPath(path, payload) {
  if (payload !== null && typeof payload === "object" && !Array.isArray(payload)) {
    setAtPath(path, payload);
  } else {
    setAtPath(path, payload);
  }
}

export function updatePath(path, partial) {
  const cur = getRef(path) || {};
  setAtPath(path, { ...cur, ...partial, updatedAt: Date.now() });
}

export function listen(path, callback) {
  const run = () => callback(getRef(path));
  if (!listeners.has(path)) listeners.set(path, new Set());
  listeners.get(path).add(run);
  run();
  return () => listeners.get(path)?.delete(run);
}

export function listenList(path, callback) {
  return listen(path, (val) => callback(valToList(val)));
}

export async function runTransaction(path, mutator) {
  const cur = getRef(path) ?? 0;
  const next = mutator(cur);
  setAtPath(path, next);
  return { snapshot: { val: () => next } };
}
