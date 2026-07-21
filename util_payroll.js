import { readRef } from "./svc_data.js";
import { valToList } from "./svc_clientCache.js";
import { getCurrentRole } from "./svc_governance.js";
import { normalizeRole } from "./util_roles.js";
import { attendanceDayWeight } from "./util_workers.js";

export const PAY_CYCLES = [
  { id: "weekly", label: "Weekly" },
  { id: "monthly", label: "Monthly" },
];

export const PAYMENT_MODES = [
  { id: "cash", label: "Cash" },
  { id: "bkash", label: "bKash" },
  { id: "bank", label: "Bank transfer" },
];

export const WORKER_TRADES = [
  { id: "mistri", label: "Mistri" },
  { id: "helper", label: "Helper" },
  { id: "electrician", label: "Electrician" },
  { id: "rod_binder", label: "Rod-binder" },
  { id: "mason", label: "Mason" },
  { id: "carpenter", label: "Carpenter" },
  { id: "plumber", label: "Plumber" },
];

const OT_RATE_MULTIPLIER = 1.5;

export function paymentModeLabel(id) {
  return PAYMENT_MODES.find((m) => m.id === id)?.label || id || "—";
}

export function payCycleLabel(id) {
  return PAY_CYCLES.find((c) => c.id === id)?.label || id || "—";
}

/** @param {"weekly"|"monthly"} cycle @param {string} refDate ISO date */
export function computePeriodBounds(cycle, refDate = new Date().toISOString().slice(0, 10)) {
  const d = new Date(refDate + "T12:00:00");
  if (cycle === "weekly") {
    const day = d.getDay();
    const diffToMon = day === 0 ? -6 : 1 - day;
    const start = new Date(d);
    start.setDate(d.getDate() + diffToMon);
    const end = new Date(start);
    end.setDate(start.getDate() + 6);
    return {
      periodStart: start.toISOString().slice(0, 10),
      periodEnd: end.toISOString().slice(0, 10),
      monthKey: refDate.slice(0, 7),
    };
  }
  const y = d.getFullYear();
  const m = d.getMonth();
  const last = new Date(y, m + 1, 0).getDate();
  const mk = `${y}-${String(m + 1).padStart(2, "0")}`;
  return {
    periodStart: `${mk}-01`,
    periodEnd: `${mk}-${String(last).padStart(2, "0")}`,
    monthKey: mk,
  };
}

function inPeriod(dateStr, start, end) {
  return dateStr >= start && dateStr <= end;
}

export function computeWorkerPayroll({
  worker,
  attendance = [],
  advances = [],
  periodStart,
  periodEnd,
  payCycle = "monthly",
}) {
  const wageRate = Number(worker?.wageRate ?? worker?.dailyWage) || 0;
  const employmentType = worker?.employmentType || "daily";
  const projectId = worker?.assignedProjectId || "";

  let totalDays = 0;
  let overtimeHours = 0;
  for (const r of attendance) {
    if (r.workerId !== worker?.id) continue;
    if (projectId && r.projectId && r.projectId !== projectId) continue;
    if (!inPeriod(r.date, periodStart, periodEnd)) continue;
    totalDays += attendanceDayWeight(r.status);
    overtimeHours += Number(r.overtimeHours) || 0;
  }

  const advanceDeducted = (advances || [])
    .filter(
      (a) =>
        a.workerId === worker?.id &&
        inPeriod(a.date || "", periodStart, periodEnd) &&
        (!projectId || !a.projectId || a.projectId === projectId)
    )
    .reduce((s, a) => s + (Number(a.amount) || 0), 0);

  let grossAmount = 0;
  if (employmentType === "monthly") {
    grossAmount = wageRate;
  } else {
    grossAmount = totalDays * wageRate + overtimeHours * wageRate * OT_RATE_MULTIPLIER;
  }
  const netPayable = Math.max(0, grossAmount - advanceDeducted);

  return {
    totalDays,
    overtimeHours,
    grossAmount,
    advanceDeducted,
    netPayable,
    payCycle,
    periodStart,
    periodEnd,
  };
}

export function computeOutstandingAdvances(advances = [], payments = [], workers = []) {
  const workerMap = new Map((workers || []).map((w) => [w.id, w]));
  const paidByWorker = {};
  for (const p of payments || []) {
    paidByWorker[p.workerId] = (paidByWorker[p.workerId] || 0) + (Number(p.amount) || 0);
  }
  const advancedByWorker = {};
  for (const a of advances || []) {
    advancedByWorker[a.workerId] = (advancedByWorker[a.workerId] || 0) + (Number(a.amount) || 0);
  }
  const rows = [];
  for (const [workerId, advanced] of Object.entries(advancedByWorker)) {
    const settled = paidByWorker[workerId] || 0;
    const outstanding = advanced - settled;
    if (outstanding <= 0) continue;
    const w = workerMap.get(workerId);
    rows.push({
      workerId,
      workerName: w?.name || workerId,
      projectId: w?.assignedProjectId || "",
      totalAdvanced: advanced,
      totalSettled: settled,
      outstanding,
    });
  }
  return rows.sort((a, b) => b.outstanding - a.outstanding);
}

export function buildSitePayrollSummary(projects = [], payments = [], calculations = [], monthKey) {
  return (projects || []).map((p) => {
    const payTotal = (payments || [])
      .filter((pay) => {
        const mk = pay.monthKey || (pay.date || "").slice(0, 7);
        return pay.projectId === p.id && mk === monthKey;
      })
      .reduce((s, pay) => s + (Number(pay.amount) || 0), 0);
    const calcTotal = (calculations || [])
      .filter(
        (c) =>
          c.projectId === p.id &&
          (c.periodStart || "").slice(0, 7) === monthKey &&
          c.status !== "draft"
      )
      .reduce((s, c) => s + (Number(c.netPayable) || 0), 0);
    return {
      projectId: p.id ?? "",
      projectName: p.name ?? "",
      monthKey: monthKey ?? "",
      laborPaid: payTotal,
      laborCalculated: calcTotal,
      totalLaborCost: payTotal || calcTotal,
    };
  });
}

export function buildPaymentConfirmationLog(payments = [], workers = [], siteInCharges = []) {
  const workerMap = new Map((workers || []).map((w) => [w.id, w]));
  const sicMap = new Map((siteInCharges || []).map((s) => [s.id, s]));
  return [...(payments || [])]
    .sort((a, b) => (b.date || "").localeCompare(a.date || ""))
    .map((p) => {
      const w = workerMap.get(p.workerId);
      const sic = sicMap.get(p.siteInChargeId);
      return {
        paymentId: p.id ?? "",
        date: p.date ?? "",
        workerId: p.workerId ?? "",
        workerName: w?.name || p.workerId || "",
        amount: Number(p.amount) || 0,
        paymentMode: p.paymentMode || (String(p.note || "").includes("bkash") ? "bkash" : "cash"),
        paidBy: p.paidBy || p.createdBy || "",
        siteInChargeId: p.siteInChargeId || "",
        siteInChargeName: sic?.name || p.siteInChargeId || "—",
        projectId: p.projectId || w?.assignedProjectId || "",
      };
    });
}

export function buildCrossSiteAttendanceHistory(workerId, attendance = [], projects = []) {
  const projectMap = new Map((projects || []).map((p) => [p.id, p.name]));
  return (attendance || [])
    .filter((r) => r.workerId === workerId)
    .sort((a, b) => (b.date || "").localeCompare(a.date || ""))
    .map((r) => ({
      date: r.date,
      projectId: r.projectId,
      projectName: projectMap.get(r.projectId) || r.projectId || "—",
      status: r.status,
      overtimeHours: r.overtimeHours || 0,
      markedBy: r.markedBy || r.updatedBy || "",
    }));
}

export function resolveProjectSiteInChargeId(projectId) {
  const project = readRef(`projects/${projectId}`);
  return project?.siteInChargeId || "";
}

/**
 * Validates that actor may mark attendance / pay workers on this project.
 * Owner/accountant may read/reconcile but not mark field attendance unless skipFieldCheck.
 */
export function assertSiteInChargeAuthority(projectId, actorUserId, siteInChargeId = "", { fieldAction = true } = {}) {
  if (!projectId) throw new Error("Project is required");
  if (!actorUserId) throw new Error("User is required");

  const sicId = siteInChargeId || resolveProjectSiteInChargeId(projectId);
  if (!sicId) throw new Error("No site in-charge assigned to this project");

  const assignments = valToList(readRef("siteInChargeAssignments") || {});
  const active = assignments.find(
    (a) => a.projectId === projectId && a.status === "active" && a.siteInChargeId === sicId
  );
  if (!active) throw new Error("Site in-charge assignment is not active for this project");

  const sic = readRef(`siteInCharges/${sicId}`) || {};
  const project = readRef(`projects/${projectId}`) || {};
  if (project.siteInChargeId && project.siteInChargeId !== sicId) {
    throw new Error("Site in-charge does not match project assignment");
  }

  if (!fieldAction) return { siteInChargeId: sicId, siteInCharge: sic };

  const role = normalizeRole(getCurrentRole());
  if (role === "owner" || role === "accountant") {
    return { siteInChargeId: sicId, siteInCharge: sic };
  }

  if (sic.userId && sic.userId !== actorUserId) {
    throw new Error("Only the assigned site in-charge may perform this action");
  }

  return { siteInChargeId: sicId, siteInCharge: sic };
}

export function buildWorkerPayrollReports({
  projects = [],
  workers = [],
  attendance = [],
  advances = [],
  payments = [],
  calculations = [],
  siteInCharges = [],
  monthKey,
}) {
  return {
    siteSummary: buildSitePayrollSummary(projects, payments, calculations, monthKey),
    outstandingAdvances: computeOutstandingAdvances(advances, payments, workers),
    paymentLog: buildPaymentConfirmationLog(payments, workers, siteInCharges),
    updatedAt: Date.now(),
  };
}
