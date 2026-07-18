/** Site in-charge CRUD, assignments, material logs, roster, settlements */

import { create, updatePath, readRef, removePath } from "./svc_data.js";
import { getCurrentUserId } from "./svc_auth.js";
import { writeAuditLog } from "./svc_workflow.js";
import { todayISO } from "./util_format.js";
import { aggregateMaterialByMonth, aggregatePayrollForMonth, currentMonthKey } from "./util_siteIncharge.js";
import { rollupSiteLedger } from "./util_stockLedger.js";

function normalizeUsageItem(item) {
  const usedQty = Number(item.usedQty ?? item.qty) || 0;
  const wastedQty = Number(item.wastedQty) || 0;
  if (wastedQty > 0 && !String(item.wasteReason || "").trim()) {
    throw new Error(`Waste reason required for ${item.label || item.materialKey}`);
  }
  return { ...item, usedQty, wastedQty, qty: usedQty + wastedQty };
}

function validateUsageAgainstBalance(projectId, items, { excludeLogId } = {}) {
  const vouchers = Object.entries(readRef(`issueVouchers/${projectId}`) || {}).map(([id, row]) => ({
    id,
    ...row,
  }));
  const logs = Object.entries(readRef(`siteMaterialLogs/${projectId}`) || {})
    .map(([id, row]) => ({ id, ...row }))
    .filter((l) => l.id !== excludeLogId);
  const ledger = rollupSiteLedger(projectId, vouchers, logs);
  const pendingByMaterial = {};
  for (const item of items) {
    const mid = item.inventoryMaterialId || item.materialKey;
    if (!mid) continue;
    pendingByMaterial[mid] = (pendingByMaterial[mid] || 0) + item.usedQty + item.wastedQty;
  }
  for (const [mid, pending] of Object.entries(pendingByMaterial)) {
    const row = ledger.find((r) => r.materialId === mid);
    const available = row?.balance ?? 0;
    if (pending > available + 0.001) {
      throw new Error(`Usage exceeds site balance for ${row?.materialName || mid} (${available} remaining)`);
    }
  }
}

export async function createSiteInCharge(data) {
  const id = await create("siteInCharges", {
    name: data.name,
    phone: data.phone || "",
    address: data.address || "",
    nid: data.nid || "",
    status: data.status || "active",
    monthlyRate: Number(data.monthlyRate) || 0,
    notes: data.notes || "",
    defaultProjectId: data.defaultProjectId || "",
    createdBy: getCurrentUserId(),
  });
  await writeAuditLog({
    entityType: "siteInCharge",
    entityId: id,
    action: "create",
    diffSummary: `Created site in-charge ${data.name}`,
  });
  return id;
}

export async function updateSiteInCharge(id, data) {
  const cur = readRef(`siteInCharges/${id}`) || {};
  await updatePath(`siteInCharges/${id}`, { ...cur, ...data });
}

export async function endActiveAssignmentsForProject(projectId) {
  const all = readRef("siteInChargeAssignments");
  if (!all || typeof all !== "object") return;
  const now = Date.now();
  for (const [aid, row] of Object.entries(all)) {
    if (row.projectId !== projectId || row.status !== "active") continue;
    await updatePath(`siteInChargeAssignments/${aid}`, {
      ...row,
      status: "ended",
      endDate: todayISO(),
      updatedAt: now,
    });
  }
}

export async function assignSiteInChargeToProject({
  siteInChargeId,
  projectId,
  projectName,
  startDate,
}) {
  await endActiveAssignmentsForProject(projectId);
  const assignmentId = await create("siteInChargeAssignments", {
    siteInChargeId,
    projectId,
    projectName: projectName || "",
    role: "site_in_charge",
    startDate: startDate || todayISO(),
    endDate: "",
    status: "active",
    responsibilities: ["material", "labor", "site_ops"],
  });
  const proj = readRef(`projects/${projectId}`) || {};
  await updatePath(`projects/${projectId}`, {
    ...proj,
    siteInChargeId,
    updatedAt: Date.now(),
  });
  return assignmentId;
}

export async function createSiteInChargeWithProject(data, projectId, projectName) {
  const id = await createSiteInCharge(data);
  if (projectId) {
    await assignSiteInChargeToProject({
      siteInChargeId: id,
      projectId,
      projectName,
      startDate: data.startDate || todayISO(),
    });
  }
  return id;
}

export async function createMaterialLog(projectId, data) {
  const items = (data.items || []).map(normalizeUsageItem);
  validateUsageAgainstBalance(projectId, items);
  const id = await create(`siteMaterialLogs/${projectId}`, {
    siteInChargeId: data.siteInChargeId,
    logDate: data.logDate || todayISO(),
    items,
    remarks: data.remarks || "",
    status: data.status || "submitted",
    createdBy: getCurrentUserId(),
  });
  return id;
}

export async function addRosterEntry(projectId, data) {
  return create(`projectRoster/${projectId}`, {
    workerId: data.workerId || "",
    workerName: data.workerName,
    siteInChargeId: data.siteInChargeId,
    trade: data.trade || "",
    dailyWage: Number(data.dailyWage) || 0,
    joinedDate: data.joinedDate || todayISO(),
    status: "active",
  });
}

export async function updateRosterEntry(projectId, rosterId, data) {
  const cur = readRef(`projectRoster/${projectId}/${rosterId}`) || {};
  await updatePath(`projectRoster/${projectId}/${rosterId}`, { ...cur, ...data });
}

export async function upsertSettlement(projectId, data) {
  const month = data.month || currentMonthKey();
  const existing = Object.entries(readRef(`siteSettlements/${projectId}`) || {}).find(
    ([, row]) => row.month === month && row.siteInChargeId === data.siteInChargeId
  );
  const payload = {
    siteInChargeId: data.siteInChargeId,
    month,
    materialSummary: data.materialSummary || [],
    laborTotal: Number(data.laborTotal) || 0,
    advancePaid: Number(data.advancePaid) || 0,
    deductions: Number(data.deductions) || 0,
    netPayable: Number(data.netPayable) || 0,
    status: data.status || "draft",
    paidAt: data.paidAt || "",
    paymentRef: data.paymentRef || "",
    remarks: data.remarks || "",
    updatedAt: Date.now(),
  };
  if (existing) {
    const [id, row] = existing;
    await updatePath(`siteSettlements/${projectId}/${id}`, { ...row, ...payload });
    return id;
  }
  return create(`siteSettlements/${projectId}`, payload);
}

export function buildSettlementDraft({ siteInChargeId, projectId, materialLogs, payrollEntries, monthKey }) {
  const materialSummary = aggregateMaterialByMonth(materialLogs, monthKey);
  const { laborTotal } = aggregatePayrollForMonth(payrollEntries, {
    projectId,
    siteInChargeId,
    monthKey,
  });
  const netPayable = laborTotal;
  return {
    siteInChargeId,
    month: monthKey,
    materialSummary,
    laborTotal,
    advancePaid: 0,
    deductions: 0,
    netPayable,
    status: "draft",
  };
}

export async function updateMaterialLog(projectId, logId, patch) {
  const cur = readRef(`siteMaterialLogs/${projectId}/${logId}`) || {};
  const next = { ...cur, ...patch };
  if (next.items) {
    next.items = next.items.map(normalizeUsageItem);
    validateUsageAgainstBalance(projectId, next.items, { excludeLogId: logId });
  }
  await updatePath(`siteMaterialLogs/${projectId}/${logId}`, {
    ...next,
    updatedAt: Date.now(),
  });
}

export async function deleteMaterialLog(projectId, logId) {
  await removePath(`siteMaterialLogs/${projectId}/${logId}`);
}

export async function approveMaterialLog(projectId, logId) {
  const cur = readRef(`siteMaterialLogs/${projectId}/${logId}`) || {};
  await updatePath(`siteMaterialLogs/${projectId}/${logId}`, {
    ...cur,
    status: "approved",
    approvedAt: Date.now(),
    approvedBy: getCurrentUserId(),
    updatedAt: Date.now(),
  });
}

export async function endAssignment(assignmentId) {
  const row = readRef(`siteInChargeAssignments/${assignmentId}`);
  if (!row) return;
  const now = Date.now();
  await updatePath(`siteInChargeAssignments/${assignmentId}`, {
    ...row,
    status: "ended",
    endDate: todayISO(),
    updatedAt: now,
  });
  const proj = readRef(`projects/${row.projectId}`) || {};
  if (proj.siteInChargeId === row.siteInChargeId) {
    await updatePath(`projects/${row.projectId}`, {
      ...proj,
      siteInChargeId: "",
      updatedAt: now,
    });
  }
}

export async function postSettlementPayment(projectId, settlementId, { paymentRef, amount, siteInChargeName } = {}) {
  const cur = readRef(`siteSettlements/${projectId}/${settlementId}`) || {};
  const now = Date.now();
  const payAmount = Number(amount) || Number(cur.netPayable) || 0;
  await updatePath(`siteSettlements/${projectId}/${settlementId}`, {
    ...cur,
    status: "paid",
    paidAt: todayISO(),
    paymentRef: paymentRef || "",
    updatedAt: now,
  });
  if (payAmount > 0) {
    const { postProjectExpense } = await import("./svc_projectCost.js");
    await postProjectExpense({
      projectId,
      amount: payAmount,
      costCategory: "labor",
      narration: `Site settlement ${cur.month || ""} — ${siteInChargeName || ""}`.trim(),
      refType: "siteSettlement",
      refId: settlementId,
    });
  }
}
