/** Site in-charge — material presets, aggregations, GRN reconciliation */

export const MATERIAL_PRESETS = [
  { materialKey: "cement", label: "Cement", unit: "bag" },
  { materialKey: "sand", label: "Bali / Sand", unit: "cft" },
  { materialKey: "brick", label: "It / Brick", unit: "pcs" },
  { materialKey: "rod", label: "Rod / Steel", unit: "kg" },
  { materialKey: "stone", label: "Stone chips", unit: "cft" },
  { materialKey: "water", label: "Water", unit: "ltr" },
  { materialKey: "other", label: "Other", unit: "unit" },
];

export const SETTLEMENT_STATUSES = ["draft", "approved", "paid"];

export const SITE_INCHARGE_TABS = [
  { id: "overview", label: "Overview" },
  { id: "diary", label: "Daily diary" },
  { id: "material", label: "Material log" },
  { id: "equipment", label: "Equipment" },
  { id: "requests", label: "Material requests" },
  { id: "roster", label: "Workers" },
  { id: "payroll", label: "Payroll" },
  { id: "settlement", label: "Settlement" },
  { id: "projects", label: "Projects" },
];

const PRODUCT_TO_MATERIAL = [
  { keys: ["cement", "simen", "সিমেন্ট"], materialKey: "cement" },
  { keys: ["sand", "bali", "balu", "বালি"], materialKey: "sand" },
  { keys: ["brick", "it", "ইট"], materialKey: "brick" },
  { keys: ["rod", "steel", "rebar", "রড"], materialKey: "rod" },
  { keys: ["stone", "chip", "chips"], materialKey: "stone" },
  { keys: ["water"], materialKey: "water" },
];

export function presetByKey(key) {
  return MATERIAL_PRESETS.find((p) => p.materialKey === key) || MATERIAL_PRESETS[MATERIAL_PRESETS.length - 1];
}

export function mapProductToMaterialKey(productName) {
  const n = String(productName || "").toLowerCase();
  for (const row of PRODUCT_TO_MATERIAL) {
    if (row.keys.some((k) => n.includes(k))) return row.materialKey;
  }
  return "other";
}

export function currentMonthKey(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

export function monthLabel(monthKey) {
  if (!monthKey) return "—";
  const [y, m] = monthKey.split("-");
  const d = new Date(Number(y), Number(m) - 1, 1);
  return d.toLocaleDateString("en-US", { month: "long", year: "numeric" });
}

/** @param {object[]} logs */
export function aggregateMaterialByMonth(logs, monthKey, { siteInChargeId } = {}) {
  const totals = {};
  for (const log of logs || []) {
    if (siteInChargeId && log.siteInChargeId !== siteInChargeId) continue;
    const mk = (log.logDate || "").slice(0, 7);
    if (monthKey && mk !== monthKey) continue;
    for (const item of log.items || []) {
      const key = item.materialKey || item.label || "other";
      if (!totals[key]) {
        totals[key] = { materialKey: key, label: item.label || presetByKey(key).label, unit: item.unit || "unit", totalQty: 0 };
      }
      totals[key].totalQty += Number(item.qty) || 0;
    }
  }
  return Object.values(totals);
}

/** @param {object[]} grns */
export function aggregateGrnByMaterial(grns, monthKey) {
  const totals = {};
  for (const grn of grns || []) {
    const date = grn.receiptDate || grn.createdAt ? new Date(grn.createdAt).toISOString().slice(0, 10) : "";
    if (monthKey && date && !date.startsWith(monthKey)) continue;
    const lines = grn.receiveLines || [];
    if (lines.length) {
      for (const line of lines) {
        const key = mapProductToMaterialKey(line.productName);
        const preset = presetByKey(key);
        if (!totals[key]) {
          totals[key] = { materialKey: key, label: preset.label, unit: preset.unit, totalQty: 0 };
        }
        totals[key].totalQty += Number(line.qty ?? line.receivedQty) || 0;
      }
    } else if (grn.amount) {
      const key = "other";
      if (!totals[key]) {
        totals[key] = { materialKey: key, label: "Other (amount-only GRN)", unit: "unit", totalQty: 0 };
      }
      totals[key].totalQty += Number(grn.amount) || 0;
    }
  }
  return Object.values(totals);
}

export function materialVariance(logTotals, grnTotals) {
  const keys = new Set([
    ...logTotals.map((t) => t.materialKey),
    ...grnTotals.map((t) => t.materialKey),
  ]);
  const rows = [];
  for (const key of keys) {
    const logged = logTotals.find((t) => t.materialKey === key);
    const received = grnTotals.find((t) => t.materialKey === key);
    const loggedQty = logged?.totalQty || 0;
    const receivedQty = received?.totalQty || 0;
    rows.push({
      materialKey: key,
      label: logged?.label || received?.label || presetByKey(key).label,
      unit: logged?.unit || received?.unit || presetByKey(key).unit,
      logged: loggedQty,
      received: receivedQty,
      variance: loggedQty - receivedQty,
    });
  }
  return rows.sort((a, b) => a.label.localeCompare(b.label));
}

/** @param {object[]} payrollEntries */
export function aggregatePayrollForMonth(entries, { projectId, siteInChargeId, monthKey } = {}) {
  let list = entries || [];
  if (projectId) list = list.filter((e) => e.projectId === projectId);
  if (siteInChargeId) list = list.filter((e) => e.siteInChargeId === siteInChargeId);
  if (monthKey) {
    list = list.filter((e) => {
      const mk = e.settlementMonth || (e.date || "").slice(0, 7);
      return mk === monthKey;
    });
  }
  const laborTotal = list.reduce((s, e) => s + (Number(e.amount) || 0), 0);
  return { count: list.length, laborTotal, entries: list };
}

export function computeNetPayable({ monthlyRate = 0, laborTotal = 0, advancePaid = 0, deductions = 0 }) {
  return Math.max(0, Number(monthlyRate) + Number(laborTotal) - Number(advancePaid) - Number(deductions));
}

export function activeAssignmentsForInCharge(assignments, siteInChargeId) {
  return (assignments || []).filter(
    (a) => a.siteInChargeId === siteInChargeId && a.status === "active"
  );
}

export function assignmentForProject(assignments, projectId) {
  return (assignments || []).find((a) => a.projectId === projectId && a.status === "active") || null;
}

export function hasDuplicateMaterialLog(logs, { siteInChargeId, logDate, excludeId }) {
  return (logs || []).some(
    (l) =>
      l.siteInChargeId === siteInChargeId &&
      l.logDate === logDate &&
      l.id !== excludeId
  );
}

export function findLastMaterialLog(logs, siteInChargeId) {
  return [...(logs || [])]
    .filter((l) => l.siteInChargeId === siteInChargeId)
    .sort((a, b) => (b.logDate || "").localeCompare(a.logDate || ""))[0];
}

/** @param {object[]} materialLogs @param {object[]} payrollEntries */
export function buildActivityFeed(materialLogs, payrollEntries, { siteInChargeId, projectId, limit = 5 }) {
  const items = [];
  for (const log of materialLogs || []) {
    if (siteInChargeId && log.siteInChargeId !== siteInChargeId) continue;
    items.push({
      type: "material",
      date: log.logDate,
      label: `Material log (${(log.items || []).length} items)`,
      status: log.status,
      id: log.id,
    });
  }
  for (const e of payrollEntries || []) {
    if (siteInChargeId && e.siteInChargeId !== siteInChargeId) continue;
    if (projectId && e.projectId !== projectId) continue;
    items.push({
      type: "payroll",
      date: e.date,
      label: `Payroll: ${e.workerName} (${e.type})`,
      status: e.status,
      amount: e.amount,
      id: e.id,
    });
  }
  return items
    .sort((a, b) => (b.date || "").localeCompare(a.date || ""))
    .slice(0, limit);
}

export function countLogsInPeriod(logs, { siteInChargeId, startDate, endDate }) {
  return (logs || []).filter((l) => {
    if (siteInChargeId && l.siteInChargeId !== siteInChargeId) return false;
    const d = l.logDate || "";
    if (startDate && d < startDate) return false;
    if (endDate && d > endDate) return false;
    return true;
  }).length;
}
