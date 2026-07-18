/** Private / local project constants and helpers (§2.3) */

import { resolveBudgetTotal } from "./util_projectCore.js";

export const PRIVATE_PATHS = {
  paymentMilestones: "paymentMilestones",
};

export const PAYMENT_MILESTONE_STATUSES = {
  pending: { key: "pending", label: "Pending" },
  invoiced: { key: "invoiced", label: "Invoiced" },
  paid: { key: "paid", label: "Paid" },
};

export const DEFAULT_PAYMENT_MILESTONES = [
  { description: "Mobilization advance", percent: 20, dueDateOffsetDays: 0 },
  { description: "Structure complete", percent: 50, dueDateOffsetDays: 90 },
  { description: "Handover & final", percent: 30, dueDateOffsetDays: 180 },
];

/**
 * @param {number} contractValue
 * @param {number} percent
 * @returns {number}
 */
export function computeMilestoneAmount(contractValue, percent) {
  const base = Number(contractValue) || 0;
  const pct = Number(percent) || 0;
  return Math.round((base * pct) / 100);
}

/**
 * @param {object} project
 * @param {object[]} [approvedChangeOrders]
 * @returns {{ base: number, variations: number, revised: number }}
 */
export function computeRevisedContractValue(project, approvedChangeOrders = []) {
  const base = resolveBudgetTotal(project);
  const approved = (approvedChangeOrders || []).filter((co) => co.status === "approved");
  const variations = approved.reduce((sum, co) => sum + Number(co.financialImpact || 0), 0);
  return {
    base,
    variations,
    revised: base + variations,
  };
}

/**
 * @param {object} project
 * @param {{ paymentMilestones?: object[], clientInvoices?: object[], changeOrders?: object[] }} ctx
 */
export function computePrivateKpis(project, ctx = {}) {
  const { paymentMilestones = [], clientInvoices = [], changeOrders = [] } = ctx;
  const pid = project?.id;
  const invoices = (clientInvoices || []).filter((inv) => !pid || inv.projectId === pid);
  const milestones = paymentMilestones || [];
  const { revised } = computeRevisedContractValue(project, changeOrders);

  const billed = invoices
    .filter((inv) => ["submitted", "approved", "paid", "partial"].includes(inv.status))
    .reduce((sum, inv) => sum + Number(inv.amount || 0), 0);

  const collected = invoices.reduce((sum, inv) => sum + Number(inv.paidAmount || 0), 0);

  const outstanding = Math.max(0, revised - collected);

  const today = new Date().toISOString().slice(0, 10);
  const nextDue = milestones
    .filter((m) => m.status === "pending" && m.dueDate)
    .sort((a, b) => String(a.dueDate).localeCompare(String(b.dueDate)))[0];

  const overdueCount = milestones.filter(
    (m) => m.status === "pending" && m.dueDate && m.dueDate < today
  ).length;

  return {
    contractValue: revised,
    baseContract: resolveBudgetTotal(project),
    billed,
    collected,
    outstanding,
    nextDueMilestone: nextDue || null,
    overdueMilestoneCount: overdueCount,
    uninvoicedMilestones: milestones.filter((m) => m.status === "pending").length,
  };
}

export function paymentMilestoneStatusLabel(status) {
  return PAYMENT_MILESTONE_STATUSES[status]?.label || status || "Pending";
}

export function addDaysISO(baseDate, days) {
  const d = baseDate ? new Date(baseDate) : new Date();
  d.setDate(d.getDate() + Number(days || 0));
  return d.toISOString().slice(0, 10);
}
