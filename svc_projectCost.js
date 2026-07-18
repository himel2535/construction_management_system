import { getList, valToList } from "./svc_data.js";
import { getRef } from "./svc_clientCache.js";
import { resolveRead, getActiveTenantId } from "./svc_tenant.js";
import { postExpenseClient } from "./svc_firebaseOps.js";
import {
  aggregateProjectCosts,
  boqLineAmount,
  budgetVariance,
  sumBoqBudget,
  computePhaseBudgetSummary,
} from "./util_projectCost.js";

/** Release 2 collection paths (nested under projectId) */
export const R2_PATHS = {
  boqItems: "boqItems",
  materialRequests: "materialRequests",
  purchaseOrders: "purchaseOrders",
  goodsReceipts: "goodsReceipts",
  projectProgress: "projectProgress",
  subcontracts: "subcontracts",
  equipmentLogs: "equipmentLogs",
  projectExpenses: "projectExpenses",
};

/**
 * Post project expense voucher (debit expense, credit cash).
 */
export async function postProjectExpense({
  projectId,
  amount,
  costCategory = "material",
  narration,
  refType,
  refId,
  date,
}) {
  if (amount <= 0) throw new Error("Amount must be positive");
  return postExpenseClient({
    projectId,
    amount,
    costCategory,
    narration,
    refType,
    refId,
    date,
  });
}

export function listProjectSub(projectId, subPath) {
  if (!projectId) return [];
  return valToList(resolveRead(`${subPath}/${projectId}`) || {});
}

export function computeProjectBudgetSummary(projectId) {
  const boqLines = listProjectSub(projectId, R2_PATHS.boqItems);
  const { total: budgetTotal, byCategory: budgetByCat } = sumBoqBudget(boqLines);

  const allPayroll = valToList(resolveRead("payrollEntries") || getRef("payrollEntries") || {}).filter(
    (e) => e.projectId === projectId
  );
  const allPurchases = valToList(resolveRead("purchases") || {}).filter((p) => p.projectId === projectId);
  const allSalary = valToList(resolveRead("workerSalaryPayments") || {}).filter(
    (s) => s.projectId === projectId && s.status !== "cancelled"
  );
  const projectExpenses = listProjectSub(projectId, R2_PATHS.projectExpenses);

  const costs = aggregateProjectCosts({
    purchaseOrders: listProjectSub(projectId, R2_PATHS.purchaseOrders),
    goodsReceipts: listProjectSub(projectId, R2_PATHS.goodsReceipts),
    payrollEntries: allPayroll,
    subcontracts: listProjectSub(projectId, R2_PATHS.subcontracts),
    equipmentLogs: listProjectSub(projectId, R2_PATHS.equipmentLogs),
    legacyPurchases: allPurchases,
    projectExpenses,
    workerSalaryPayments: allSalary,
  });

  const approvedExpenseTotal = projectExpenses
    .filter((e) => e.status === "approved")
    .reduce((a, e) => a + (Number(e.amount) || 0), 0);

  const variance = budgetVariance(budgetTotal, costs.committed, costs.actual);
  return {
    projectId,
    budgetTotal,
    budgetByCat,
    ...costs,
    ...variance,
    boqCount: boqLines.length,
    approvedExpenseTotal,
    projectExpenses,
  };
}

/**
 * @param {string} projectId
 * @param {object[]} phases
 */
export function computeProjectPhaseBudgetSummary(projectId, phases) {
  const boqItems = listProjectSub(projectId, R2_PATHS.boqItems);
  const expenses = listProjectSub(projectId, R2_PATHS.projectExpenses);
  return computePhaseBudgetSummary(phases, boqItems, expenses);
}

/**
 * Build budget summary from pre-loaded source arrays (Firebase cache refresh).
 */
export function computeBudgetSummaryFromSources(projectId, sources) {
  const boqLines = sources.boqItems || [];
  const { total: budgetTotal, byCategory: budgetByCat } = sumBoqBudget(boqLines);
  const costs = aggregateProjectCosts(sources);
  const variance = budgetVariance(budgetTotal, costs.committed, costs.actual);
  return {
    projectId,
    budgetTotal,
    budgetByCat,
    ...costs,
    ...variance,
    boqCount: boqLines.length,
  };
}

export function checkBudgetForApproval(projectId, additionalAmount) {
  const summary = computeProjectBudgetSummary(projectId);
  if (summary.budgetTotal <= 0) return { ok: true, summary };
  const projected = summary.committed + summary.actual + additionalAmount;
  if (projected > summary.budgetTotal * 1.1) {
    return {
      ok: false,
      summary,
      message: `Exceeds budget (${formatAmt(summary.budgetTotal)}). Projected: ${formatAmt(projected)}`,
    };
  }
  return { ok: true, summary };
}

function formatAmt(n) {
  return new Intl.NumberFormat("en-BD", { maximumFractionDigits: 0 }).format(n);
}

export { boqLineAmount };
