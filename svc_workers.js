import { create, updatePath, removePath, getList } from "./svc_data.js";
import { getCurrentUserId, getCurrentUserName } from "./svc_auth.js";
import { postProjectExpense } from "./svc_projectCost.js";
import { db, ref, runTransaction, get } from "./firebase.js";
import { todayISO } from "./util_workers.js";

let workerCodeSeq = 0;

async function nextWorkerCode() {
  const counterRef = ref(db, "counters/workerCode");
  const result = await runTransaction(counterRef, (current) => {
    const n = (typeof current === "number" ? current : current?.value) ?? 0;
    return n + 1;
  });
  const n = result.snapshot.val() ?? 1;
  return `WRK-${String(n).padStart(3, "0")}`;
}

export async function createWorker(data) {
  const workerCode = data.workerCode || (await nextWorkerCode());
  return create("workers", {
    workerCode,
    name: data.name,
    photoUrl: data.photoUrl || "",
    phone: data.phone || "",
    nid: data.nid || "",
    address: data.address || "",
    designation: data.designation || "helper",
    employmentType: data.employmentType || "daily",
    wageRate: Number(data.wageRate) || Number(data.dailyWage) || 0,
    dailyWage: Number(data.wageRate) || Number(data.dailyWage) || 0,
    trade: data.trade || data.designation || "",
    assignedProjectId: data.assignedProjectId || "",
    joiningDate: data.joiningDate || todayISO(),
    status: data.status || "active",
    createdBy: getCurrentUserId(),
  });
}

export async function updateWorker(id, data) {
  const payload = { ...data, updatedBy: getCurrentUserId() };
  if (payload.wageRate != null) payload.dailyWage = Number(payload.wageRate);
  await updatePath(`workers/${id}`, payload);
}

export async function deleteWorker(id) {
  await updatePath(`workers/${id}`, { status: "inactive", updatedBy: getCurrentUserId() });
}

export async function recordSiteTransfer(workerId, { fromProjectId, toProjectId, date, note }) {
  await create(`workerTransfers/${workerId}`, {
    fromProjectId: fromProjectId || "",
    toProjectId: toProjectId || "",
    date: date || todayISO(),
    note: note || "",
    createdBy: getCurrentUserId(),
  });
  await updatePath(`workers/${workerId}`, { assignedProjectId: toProjectId, updatedBy: getCurrentUserId() });
}

export async function createWorkerDocument(workerId, data) {
  return create(`workerDocuments/${workerId}`, {
    title: data.title,
    url: data.url,
    docType: data.docType || "other",
    createdBy: getCurrentUserId(),
  });
}

export async function recordAttendance({ workerId, projectId, date, status, overtimeHours = 0, markedBy }) {
  const key = `${workerId}_${date}`;
  const actor = markedBy || getCurrentUserId();
  await updatePath(`workerAttendance/${key}`, {
    workerId,
    projectId: projectId || "",
    date,
    status,
    overtimeHours: Number(overtimeHours) || 0,
    markedBy: actor,
    updatedBy: actor,
  });
  return key;
}

export async function recordAdvance({ workerId, amount, date, note, reason, projectId, givenBy }) {
  const actor = givenBy || getCurrentUserId();
  return create("workerAdvances", {
    workerId,
    amount: Number(amount) || 0,
    date: date || todayISO(),
    note: note || reason || "",
    reason: reason || note || "",
    projectId: projectId || "",
    givenBy: actor,
    createdBy: actor,
  });
}

export async function recordSalaryPayment({
  workerId,
  amount,
  monthKey,
  date,
  note,
  projectId = "",
  paymentMode = "",
  paidBy = "",
  siteInChargeId = "",
  salaryCalcId = "",
}) {
  const actor = paidBy || getCurrentUserId();
  return create("workerSalaryPayments", {
    workerId,
    amount: Number(amount) || 0,
    monthKey,
    date: date || todayISO(),
    note: note || "",
    projectId: projectId || "",
    paymentMode: paymentMode || "cash",
    paidBy: actor,
    siteInChargeId: siteInChargeId || "",
    salaryCalcId: salaryCalcId || "",
    status: "paid",
    createdBy: actor,
  });
}

/** Ported from missing svc_payroll.js — keeps payrollEntries global for Site In-charge */
export async function createPayrollEntry({
  worker,
  projectId,
  siteInChargeId = "",
  type,
  days = 1,
  amount,
  date,
  postExpense = false,
}) {
  if (!worker?.id) throw new Error("Worker required");
  const wage = Number(worker.wageRate ?? worker.dailyWage) || 0;
  let computed = Number(amount);
  if (type === "attendance" || (type === "wage" && !amount)) computed = wage * (Number(days) || 1);
  if (type === "advance") computed = Number(amount) || 0;
  if (!Number.isFinite(computed)) computed = 0;

  const entryDate = date || todayISO();
  const id = await create("payrollEntries", {
    workerId: worker.id,
    workerName: worker.name,
    projectId: projectId || "",
    siteInChargeId: siteInChargeId || "",
    type,
    days: Number(days) || 1,
    amount: computed,
    date: entryDate,
    settlementMonth: entryDate.slice(0, 7),
    status: "approved",
    createdBy: getCurrentUserId(),
  });

  if (postExpense && computed > 0 && projectId) {
    await postProjectExpense({
      projectId,
      amount: computed,
      costCategory: "labor",
      narration: `Payroll ${type} — ${worker.name}`,
      refType: "payrollEntry",
      refId: id,
      date: entryDate,
    });
  }
  return id;
}

export async function listWorkerTransfers(workerId) {
  return getList(`workerTransfers/${workerId}`);
}

export async function listWorkerDocuments(workerId) {
  return getList(`workerDocuments/${workerId}`);
}
