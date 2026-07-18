import { create, updatePath, readRef } from "./svc_data.js";
import { getCurrentUserId } from "./svc_auth.js";
import { canPerformAction } from "./svc_governance.js";
import { writeAuditLog } from "./svc_workflow.js";
import { postProjectExpense } from "./svc_projectCost.js";
import { computeProjectBudgetSummary } from "./svc_projectCost.js";
import {
  computePeriodBounds,
  computeWorkerPayroll,
  assertSiteInChargeAuthority,
  buildWorkerPayrollReports,
} from "./util_payroll.js";
import {
  recordAttendance,
  recordAdvance,
  recordSalaryPayment,
  createPayrollEntry,
} from "./svc_workers.js";
import { valToList } from "./svc_clientCache.js";
import { todayISO } from "./util_workers.js";

export { createPayrollEntry };

function getWorker(workerId) {
  return readRef(`workers/${workerId}`);
}

export async function calculateSalary(workerId, projectId, { cycle = "monthly", periodStart, siteInChargeId = "" } = {}) {
  const worker = getWorker(workerId);
  if (!worker) throw new Error("Worker not found");
  const refDate = periodStart || todayISO();
  const bounds = computePeriodBounds(cycle, refDate);
  const attendance = valToList(readRef("workerAttendance") || {});
  const advances = valToList(readRef("workerAdvances") || {});

  const calc = computeWorkerPayroll({
    worker: { ...worker, assignedProjectId: projectId || worker.assignedProjectId },
    attendance,
    advances,
    periodStart: bounds.periodStart,
    periodEnd: bounds.periodEnd,
    payCycle: cycle,
  });

  const sicId = siteInChargeId || assertSiteInChargeAuthority(projectId || worker.assignedProjectId, getCurrentUserId(), siteInChargeId, { fieldAction: false }).siteInChargeId;

  const existing = valToList(readRef("workerSalaryCalculations") || {}).find(
    (c) =>
      c.workerId === workerId &&
      c.projectId === (projectId || worker.assignedProjectId) &&
      c.periodStart === bounds.periodStart &&
      c.periodEnd === bounds.periodEnd
  );

  const payload = {
    workerId,
    workerName: worker.name,
    projectId: projectId || worker.assignedProjectId || "",
    siteInChargeId: sicId,
    payCycle: cycle,
    periodStart: bounds.periodStart,
    periodEnd: bounds.periodEnd,
    monthKey: bounds.monthKey,
    totalDays: calc.totalDays,
    overtimeHours: calc.overtimeHours,
    grossAmount: calc.grossAmount,
    advanceDeducted: calc.advanceDeducted,
    netPayable: calc.netPayable,
    status: "confirmed",
    updatedAt: Date.now(),
    createdBy: getCurrentUserId(),
  };

  if (existing?.id) {
    await updatePath(`workerSalaryCalculations/${existing.id}`, { ...existing, ...payload });
    return existing.id;
  }

  return create("workerSalaryCalculations", {
    ...payload,
    status: "confirmed",
    createdAt: Date.now(),
  });
}

export async function confirmSalaryPayment({
  workerId,
  calcId,
  amount,
  paymentMode = "cash",
  projectId = "",
  siteInChargeId = "",
  postExpense = false,
}) {
  const worker = getWorker(workerId);
  if (!worker) throw new Error("Worker not found");
  const pid = projectId || worker.assignedProjectId || "";
  const sic = assertSiteInChargeAuthority(pid, getCurrentUserId(), siteInChargeId);
  const paidAmount = Number(amount) || 0;
  if (paidAmount <= 0) throw new Error("Invalid payment amount");

  let calc = calcId ? readRef(`workerSalaryCalculations/${calcId}`) : null;
  if (!calc && pid) {
    const bounds = computePeriodBounds("monthly", todayISO());
    calcId = await calculateSalary(workerId, pid, {
      cycle: "monthly",
      periodStart: bounds.periodStart,
      siteInChargeId: sic.siteInChargeId,
    });
    calc = readRef(`workerSalaryCalculations/${calcId}`);
  }

  const monthKey = calc?.monthKey || (calc?.periodStart || todayISO()).slice(0, 7);
  const paymentId = await recordSalaryPayment({
    workerId,
    amount: paidAmount,
    monthKey,
    date: todayISO(),
    note: `Salary payment (${paymentMode})`,
    projectId: pid,
    paymentMode,
    paidBy: getCurrentUserId(),
    siteInChargeId: sic.siteInChargeId,
    salaryCalcId: calcId || "",
  });

  if (calcId) {
    await updatePath(`workerSalaryCalculations/${calcId}`, {
      ...calc,
      status: "paid",
      paidAmount,
      paymentId,
      updatedAt: Date.now(),
    });
  }

  if (postExpense && pid) {
    await postProjectExpense({
      projectId: pid,
      amount: paidAmount,
      costCategory: "labor",
      narration: `Salary payment — ${worker.name}`,
      refType: "workerSalaryPayment",
      refId: paymentId,
      date: todayISO(),
    });
  }

  await writeAuditLog({
    entityType: "workerSalaryPayment",
    entityId: paymentId,
    action: "create",
    actionType: "create",
    projectId: pid,
    diffSummary: `Paid ${worker.name}: ${paidAmount} (${paymentMode})`,
  });

  return paymentId;
}

export async function recordAttendanceWithAuthority({
  workerId,
  projectId,
  date,
  status,
  overtimeHours = 0,
  siteInChargeId = "",
}) {
  assertSiteInChargeAuthority(projectId, getCurrentUserId(), siteInChargeId);
  return recordAttendance({
    workerId,
    projectId,
    date,
    status,
    overtimeHours,
    markedBy: getCurrentUserId(),
  });
}

export async function recordAdvanceWithAuthority({
  workerId,
  amount,
  date,
  reason = "",
  projectId = "",
  siteInChargeId = "",
}) {
  assertSiteInChargeAuthority(projectId, getCurrentUserId(), siteInChargeId);
  return recordAdvance({
    workerId,
    amount,
    date,
    note: reason,
    reason,
    projectId,
    givenBy: getCurrentUserId(),
  });
}

export async function reconcileSitePayroll(projectId, monthKey) {
  if (!canPerformAction("approve") && !canPerformAction("approve_expense")) {
    throw new Error("Only accountant or owner may reconcile payroll");
  }
  const projects = readRef("projects") || {};
  const project = projects[projectId] || readRef(`projects/${projectId}`);
  if (!project) throw new Error("Project not found");

  const payments = valToList(readRef("workerSalaryPayments") || {}).filter(
    (p) => p.projectId === projectId && (p.monthKey || (p.date || "").slice(0, 7)) === monthKey
  );
  const payrollTotal = payments.reduce((s, p) => s + (Number(p.amount) || 0), 0);
  const budget = computeProjectBudgetSummary(projectId);

  const markerId = await create("payrollEntries", {
    workerId: "",
    workerName: "—",
    projectId,
    siteInChargeId: project.siteInChargeId || "",
    type: "reconciliation",
    days: 0,
    amount: payrollTotal,
    date: todayISO(),
    settlementMonth: monthKey,
    status: "reconciled",
    reconciledAt: Date.now(),
    reconciledBy: getCurrentUserId(),
    budgetLaborActual: budget.actual,
    createdBy: getCurrentUserId(),
  });

  await writeAuditLog({
    entityType: "payrollReconciliation",
    entityId: markerId,
    action: "reconcile",
    actionType: "update",
    projectId,
    diffSummary: `Reconciled site payroll ${monthKey}: paid ${payrollTotal}, budget actual ${budget.actual}`,
  });

  return { markerId, payrollTotal, budgetActual: budget.actual, variance: budget.actual - payrollTotal };
}

export function computeWorkerPayrollReportsCache(data) {
  return buildWorkerPayrollReports(data);
}
