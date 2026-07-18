/** Central + site stock ledger rollups, variance, consumption reports */

import { mapProductToMaterialKey } from "./util_siteIncharge.js";

const NAME_KEYS = [
  { keys: ["cement", "simen"], category: "cement" },
  { keys: ["rod", "steel", "rebar"], category: "rod" },
  { keys: ["brick", "it"], category: "brick" },
  { keys: ["sand", "bali", "balu"], category: "sand" },
  { keys: ["stone", "chip", "chips"], category: "stone_chips" },
];

/** Map GRN product name or material key to inventoryMaterials row. */
export function mapProductToInventoryMaterial(productName, materials = []) {
  const n = String(productName || "").toLowerCase();
  let category = mapProductToMaterialKey(productName);
  for (const row of NAME_KEYS) {
    if (row.keys.some((k) => n.includes(k))) {
      category = row.category;
      break;
    }
  }
  const byCategory = materials.find(
    (m) => m.category === category || String(m.name || "").toLowerCase().includes(category.replace("_", " "))
  );
  if (byCategory) return byCategory;
  const byName = materials.find((m) => n.includes(String(m.name || "").toLowerCase().slice(0, 4)));
  return byName || null;
}

/** Company-wide central stock rollup per material. */
export function rollupCentralLedger(stockInRows = [], stockOutRows = [], materials = []) {
  const byId = {};
  for (const m of materials) {
    byId[m.id] = {
      materialId: m.id,
      materialName: m.name,
      unit: m.unit,
      qtyIn: 0,
      qtyOut: 0,
      runningBalance: Number(m.currentStock) || 0,
      lastUpdated: "",
    };
  }
  for (const r of stockInRows) {
    const id = r.materialId;
    if (!byId[id]) {
      byId[id] = {
        materialId: id,
        materialName: r.materialName || id,
        unit: "unit",
        qtyIn: 0,
        qtyOut: 0,
        runningBalance: 0,
        lastUpdated: "",
      };
    }
    byId[id].qtyIn += Number(r.quantity) || 0;
    if (!byId[id].lastUpdated || r.date > byId[id].lastUpdated) byId[id].lastUpdated = r.date || "";
  }
  for (const r of stockOutRows) {
    const id = r.materialId;
    if (!byId[id]) continue;
    byId[id].qtyOut += Number(r.quantity) || 0;
    if (!byId[id].lastUpdated || r.issueDate > byId[id].lastUpdated) byId[id].lastUpdated = r.issueDate || "";
  }
  return Object.values(byId).sort((a, b) => a.materialName.localeCompare(b.materialName));
}

/** Per-site balance: issued - used - wasted. */
export function rollupSiteLedger(projectId, issueVouchers = [], usageLogs = [], materialId = null) {
  const totals = {};

  for (const v of issueVouchers) {
    if (v.projectId && v.projectId !== projectId) continue;
    if (v.status !== "issued") continue;
    const mid = v.inventoryMaterialId;
    if (!mid) continue;
    if (materialId && mid !== materialId) continue;
    if (!totals[mid]) {
      totals[mid] = {
        projectId,
        materialId: mid,
        materialName: v.materialName || mid,
        unit: v.unit || "unit",
        qtyIssued: 0,
        qtyUsed: 0,
        qtyWasted: 0,
        balance: 0,
      };
    }
    totals[mid].qtyIssued += Number(v.qtyIssued) || 0;
  }

  for (const log of usageLogs) {
    for (const item of log.items || []) {
      const mid = item.inventoryMaterialId || item.materialKey;
      if (!mid) continue;
      if (materialId && mid !== materialId) continue;
      if (!totals[mid]) {
        totals[mid] = {
          projectId,
          materialId: mid,
          materialName: item.label || mid,
          unit: item.unit || "unit",
          qtyIssued: 0,
          qtyUsed: 0,
          qtyWasted: 0,
          balance: 0,
        };
      }
      const used = Number(item.usedQty ?? item.qty) || 0;
      const wasted = Number(item.wastedQty) || 0;
      totals[mid].qtyUsed += used;
      totals[mid].qtyWasted += wasted;
    }
  }

  for (const row of Object.values(totals)) {
    row.balance = row.qtyIssued - row.qtyUsed - row.qtyWasted;
  }
  return Object.values(totals).sort((a, b) => a.materialName.localeCompare(b.materialName));
}

/** Flag rows where balance != 0 (unaccounted stock on site). */
export function issuedVsUsedVariance(siteLedgerRows = [], { threshold = 0.01 } = {}) {
  return (siteLedgerRows || [])
    .map((row) => ({
      ...row,
      variance: row.balance,
      flagged: Math.abs(row.balance) > threshold,
    }))
    .filter((r) => r.flagged || r.qtyIssued > 0);
}

/** Aggregate usage by site/project and material. */
export function consumptionBySite(usageLogsByProject = {}, projects = [], filters = {}) {
  const { dateFrom, dateTo, projectId, materialId } = filters;
  const rows = [];
  for (const [pid, logs] of Object.entries(usageLogsByProject)) {
    if (projectId && projectId !== "all" && pid !== projectId) continue;
    const proj = projects.find((p) => p.id === pid);
    for (const log of logs || []) {
      const d = log.logDate || "";
      if (dateFrom && d < dateFrom) continue;
      if (dateTo && d > dateTo) continue;
      for (const item of log.items || []) {
        const mid = item.inventoryMaterialId || item.materialKey;
        if (materialId && materialId !== "all" && mid !== materialId) continue;
        const used = Number(item.usedQty ?? item.qty) || 0;
        const wasted = Number(item.wastedQty) || 0;
        if (used + wasted <= 0) continue;
        rows.push({
          projectId: pid,
          projectName: proj?.name || pid,
          logDate: d,
          materialId: mid,
          materialName: item.label || mid,
          unit: item.unit || "unit",
          qtyUsed: used,
          qtyWasted: wasted,
          usedFor: item.usedFor || "",
        });
      }
    }
  }
  return rows.sort((a, b) => (b.logDate || "").localeCompare(a.logDate || ""));
}

/** Cross-project accountability rollup for one site in-charge. */
export function accountabilityForSiteInCharge(
  siteInChargeId,
  { mrsByProject = {}, vouchersByProject = {}, usageLogsByProject = {}, projects = [] } = {}
) {
  const items = [];
  for (const [pid, mrs] of Object.entries(mrsByProject)) {
    const proj = projects.find((p) => p.id === pid);
    for (const mr of mrs || []) {
      if (mr.siteInChargeId !== siteInChargeId && mr.requestedBy !== siteInChargeId) continue;
      items.push({
        type: "requisition",
        date: mr.submittedAt ? new Date(mr.submittedAt).toISOString().slice(0, 10) : "",
        projectId: pid,
        projectName: proj?.name || pid,
        label: mr.title || "Material requisition",
        qty: mr.qty,
        status: mr.status,
      });
    }
  }
  for (const [pid, vouchers] of Object.entries(vouchersByProject)) {
    const proj = projects.find((p) => p.id === pid);
    for (const v of vouchers || []) {
      if (v.receivedBySiteInChargeId !== siteInChargeId) continue;
      items.push({
        type: "issue_voucher",
        date: v.issueDate || "",
        projectId: pid,
        projectName: proj?.name || pid,
        label: `${v.materialName} (${v.qtyIssued} ${v.unit || ""})`,
        qty: v.qtyIssued,
        status: v.status,
      });
    }
  }
  for (const [pid, logs] of Object.entries(usageLogsByProject)) {
    const proj = projects.find((p) => p.id === pid);
    for (const log of logs || []) {
      if (log.siteInChargeId !== siteInChargeId) continue;
      const totalUsed = (log.items || []).reduce(
        (s, i) => s + (Number(i.usedQty ?? i.qty) || 0) + (Number(i.wastedQty) || 0),
        0
      );
      items.push({
        type: "usage_log",
        date: log.logDate || "",
        projectId: pid,
        projectName: proj?.name || pid,
        label: `Usage log (${(log.items || []).length} items)`,
        qty: totalUsed,
        status: log.status,
      });
    }
  }
  return items.sort((a, b) => (b.date || "").localeCompare(a.date || ""));
}

/** Remaining site balance for a material after optional pending usage. */
export function siteBalanceForMaterial(siteLedgerRows, materialId) {
  const row = (siteLedgerRows || []).find((r) => r.materialId === materialId);
  return row?.balance ?? 0;
}
