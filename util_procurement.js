/** Cross-supplier product catalog helpers for procurement (PO / GRN). */

/** @typedef {{ supplierId: string, supplierName: string, productId: string, name: string, code: string, unit: string, rate: number, status: string, productKey: string }} CatalogEntry */

/**
 * Normalize product name for grouping suppliers offering the same item.
 * @param {string} name
 */
export function productKeyFromName(name) {
  return String(name || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

/**
 * @param {Array<{ id: string, name?: string, status?: string }>} suppliers
 * @param {Record<string, Array<object>>} productsBySupplierId
 * @returns {CatalogEntry[]}
 */
export function buildProductCatalog(suppliers, productsBySupplierId) {
  const supplierMap = new Map(suppliers.map((s) => [s.id, s]));
  const catalog = [];
  for (const [supplierId, products] of Object.entries(productsBySupplierId || {})) {
    const sup = supplierMap.get(supplierId);
    if (!sup || sup.status === "inactive") continue;
    for (const p of products || []) {
      if ((p.status || "active") === "inactive") continue;
      const name = String(p.name || "").trim();
      if (!name) continue;
      catalog.push({
        supplierId,
        supplierName: sup.name || supplierId,
        productId: p.id,
        name,
        code: String(p.code || "").trim(),
        unit: String(p.unit || "pcs").trim() || "pcs",
        rate: Number(p.rate) || 0,
        status: p.status || "active",
        productKey: productKeyFromName(name),
      });
    }
  }
  return catalog.sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * @param {CatalogEntry[]} catalog
 * @param {string} query
 * @param {number} [limit]
 */
export function searchProducts(catalog, query, limit = 20) {
  const q = String(query || "").trim().toLowerCase();
  if (!q) return [];
  const seen = new Set();
  const out = [];
  for (const entry of catalog) {
    const key = entry.productKey;
    if (seen.has(key)) continue;
    const hay = `${entry.name} ${entry.code}`.toLowerCase();
    if (!hay.includes(q)) continue;
    seen.add(key);
    out.push(entry);
    if (out.length >= limit) break;
  }
  return out;
}

/**
 * Unique product names for autocomplete (first match per productKey).
 * @param {CatalogEntry[]} catalog
 */
export function listProductSuggestions(catalog, query, limit = 20) {
  return searchProducts(catalog, query, limit);
}

/**
 * All catalog rows for a product (one per supplier).
 * @param {CatalogEntry[]} catalog
 * @param {string} productKey
 */
export function suppliersForProduct(catalog, productKey) {
  const key = productKey || "";
  return catalog.filter((e) => e.productKey === key);
}

/**
 * @param {CatalogEntry[]} catalog
 * @param {string} supplierId
 * @param {string} productId
 */
export function findCatalogEntry(catalog, supplierId, productId) {
  return catalog.find((e) => e.supplierId === supplierId && e.productId === productId) || null;
}

/**
 * @param {number} qty
 * @param {number} rate
 */
export function calcLineAmount(qty, rate) {
  const q = Number(qty) || 0;
  const r = Number(rate) || 0;
  return Math.round(q * r * 100) / 100;
}

/**
 * @param {object} line
 */
export function normalizePoLine(line) {
  const qty = Number(line.qty) || 0;
  const rate = Number(line.rate) || 0;
  return {
    supplierProductId: line.supplierProductId || "",
    productName: String(line.productName || "").trim(),
    productCode: String(line.productCode || "").trim(),
    supplierId: line.supplierId || "",
    supplierName: line.supplierName || "",
    unit: String(line.unit || "pcs").trim() || "pcs",
    qty,
    rate,
    amount: calcLineAmount(qty, rate),
  };
}

/**
 * @param {object[]} lines
 */
export function sumPoLines(lines) {
  return (lines || []).reduce((s, l) => s + (Number(l.amount) || calcLineAmount(l.qty, l.rate)), 0);
}

/**
 * Short summary for PO table, e.g. "Cement ×50, Rod ×20"
 * @param {object} po
 */
export function summarizePoItems(po) {
  const lines = po?.lines;
  if (lines?.length) {
    return lines
      .map((l) => {
        const name = l.productName || "Item";
        const qty = Number(l.qty) || 0;
        return qty ? `${name} ×${qty}` : name;
      })
      .join(", ");
  }
  return po?.itemSummary || "—";
}

/**
 * Remaining qty per line for GRN (ordered - received on prior GRNs).
 * @param {object} po
 * @param {object[]} grnsForPo
 */
export function poLinesWithReceiveBalance(po, grnsForPo = []) {
  const lines = po?.lines || [];
  if (!lines.length) return [];

  const receivedByProduct = {};
  for (const grn of grnsForPo) {
    if (grn.status !== "received") continue;
    for (const rl of grn.receiveLines || []) {
      const key = rl.supplierProductId || rl.productName || "";
      receivedByProduct[key] = (receivedByProduct[key] || 0) + (Number(rl.qty) || 0);
    }
    if (!grn.receiveLines?.length && grn.amount && lines.length === 1) {
      const key = lines[0].supplierProductId || lines[0].productName || "";
      receivedByProduct[key] = (receivedByProduct[key] || 0) + (Number(grn.amount) / (lines[0].rate || 1));
    }
  }

  return lines.map((line, index) => {
    const key = line.supplierProductId || line.productName || String(index);
    const ordered = Number(line.qty) || 0;
    const received = receivedByProduct[key] || 0;
    const remaining = Math.max(0, ordered - received);
    return { ...line, lineIndex: index, orderedQty: ordered, receivedQty: received, remainingQty: remaining };
  });
}
