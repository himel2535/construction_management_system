/** Release 2 — budget and cost aggregation helpers */

import { mapExpenseCategoryToCostCategory } from "./util_projectExpense.js";

export const COST_CATEGORIES = ["material", "labor", "subcontract", "equipment", "overhead"];

/**
 * @param {Array<{ qty?: number, rate?: number, amount?: number }>} boqLines
 */
export function boqLineAmount(line) {
  if (line.amount != null && line.amount > 0) return line.amount;
  return (Number(line.qty) || 0) * (Number(line.rate) || 0);
}

/**
 * @param {object[]} boqLines
 */
export function sumBoqBudget(boqLines) {
  const byCategory = {};
  let total = 0;
  for (const line of boqLines) {
    const amt = boqLineAmount(line);
    const cat = line.costCategory || "material";
    byCategory[cat] = (byCategory[cat] || 0) + amt;
    total += amt;
  }
  return { total, byCategory };
}

/**
 * Sum actual/committed costs from transaction lists.
 * @param {object} opts
 */
export function aggregateProjectCosts(opts) {
  const {
    purchaseOrders = [],
    goodsReceipts = [],
    payrollEntries = [],
    subcontracts = [],
    equipmentLogs = [],
    legacyPurchases = [],
    projectExpenses = [],
    workerSalaryPayments = [],
  } = opts;

  let committed = 0;
  let actual = 0;
  const byCategory = {};

  const add = (cat, amt, type) => {
    if (!amt) return;
    byCategory[cat] = (byCategory[cat] || 0) + amt;
    if (type === "committed") committed += amt;
    else actual += amt;
  };

  for (const po of purchaseOrders) {
    if (po.status === "approved" || po.status === "issued") {
      add(po.costCategory || "material", po.amount, "committed");
    }
  }
  for (const grn of goodsReceipts) {
    if (grn.status === "received") add(grn.costCategory || "material", grn.amount, "actual");
  }
  for (const pe of payrollEntries) {
    if (pe.status === "approved" || !pe.status) add(pe.costCategory || "labor", pe.amount, "actual");
  }
  for (const sc of subcontracts) {
    if (sc.status === "approved") add("subcontract", sc.billedAmount || sc.amount || 0, "actual");
  }
  for (const el of equipmentLogs) {
    add("equipment", el.cost || 0, "actual");
  }
  for (const p of legacyPurchases) {
    if (p.status === "completed" || p.status === "approved") {
      add(p.costCategory || "material", p.amount, "actual");
    }
  }
  for (const ex of projectExpenses) {
    const cat = ex.costCategory || mapExpenseCategoryToCostCategory(ex.category);
    const amt = Number(ex.amount) || 0;
    if (ex.status === "approved") add(cat, amt, "actual");
    else if (ex.status === "submitted") add(cat, amt, "committed");
  }
  for (const sp of workerSalaryPayments) {
    if (sp.status === "cancelled") continue;
    add("labor", Number(sp.amount) || 0, "actual");
  }

  return { committed, actual, byCategory };
}

/**
 * Per-phase budget vs actual from BOQ lines and approved expenses.
 * @param {object[]} phases
 * @param {object[]} boqItems
 * @param {object[]} expenses approved/submitted project expenses
 */
export function computePhaseBudgetSummary(phases, boqItems, expenses = []) {
  const rows = (phases || []).map((ph) => {
    const budget = (boqItems || [])
      .filter((l) => l.phaseId === ph.id)
      .reduce((sum, l) => sum + boqLineAmount(l), 0);
    let actual = 0;
    let committed = 0;
    for (const ex of expenses || []) {
      if (ex.phaseId !== ph.id) continue;
      const amt = Number(ex.amount) || 0;
      if (ex.status === "approved") actual += amt;
      else if (ex.status === "submitted") committed += amt;
    }
    return {
      phaseId: ph.id,
      name: ph.name,
      budget,
      actual,
      committed,
      remaining: budget - actual - committed,
    };
  });
  return rows.filter((r) => r.budget > 0 || r.actual > 0 || r.committed > 0);
}

/**
 * @param {number} budget
 * @param {number} committed
 * @param {number} actual
 */
export function budgetVariance(budget, committed, actual) {
  const remaining = budget - committed - actual;
  const utilization = budget > 0 ? Math.round(((committed + actual) / budget) * 100) : 0;
  return { remaining, utilization, overBudget: remaining < 0 };
}
