import { create, readRef, updatePath } from "./svc_data.js";
import { getCurrentUserId } from "./svc_auth.js";
import { writeAuditLog } from "./svc_workflow.js";
import { postManualVoucherClient } from "./svc_firebaseOps.js";
import { getActiveTenantId } from "./svc_tenant.js";
import { boqLineAmount } from "./util_projectCost.js";
import { checklistForAgency } from "./util_govCompliance.js";
import { enrichProject, saveGovDetail } from "./svc_projectDetails.js";
import {
  DEFAULT_GOV_PHASES,
  MANDATORY_GOV_DOCS,
  GOV_PATHS,
} from "./util_govProject.js";

/**
 * Auto-setup default phases and mandatory documents for government civil projects.
 */
export async function setupGovProjectOnCreate(projectId) {
  const now = Date.now();
  for (const ph of DEFAULT_GOV_PHASES) {
    await create(`projectPhases/${projectId}`, {
      name: ph.name,
      sortOrder: ph.sortOrder,
      status: "pending",
      createdAt: now,
      updatedAt: now,
    });
  }
  for (const doc of MANDATORY_GOV_DOCS) {
    const docType = doc.docType === "drawing" ? "Drawing" : doc.docType === "contract" ? "Contract" : "Other";
    await create(`projectDocuments/${projectId}`, {
      title: doc.title,
      type: docType,
      docType: doc.docType,
      version: 0,
      revision: "Rev 0",
      fileUrl: "",
      expiryDate: "",
      revisionHistory: [],
      status: "draft",
      submittedBy: "",
      submittedAt: null,
      approvedBy: "",
      approvedAt: null,
      createdAt: now,
      updatedAt: now,
    });
  }
  const baseProject = readRef(`projects/${projectId}`) || {};
  const project = enrichProject({ id: projectId, ...baseProject });
  const agency = project.employerAgency || "LGED";
  for (const item of checklistForAgency(agency)) {
    await create(`${GOV_PATHS.govComplianceChecklist}/${projectId}`, {
      itemKey: item.itemKey,
      label: item.label,
      agency: item.agency,
      status: "pending",
      createdAt: now,
      updatedAt: now,
    });
  }
  await saveGovDetail(
    projectId,
    { complianceStatus: project.complianceStatus || "pending" },
    { audit: false }
  );
  await writeAuditLog({
    entityType: "project",
    entityId: projectId,
    action: "gov_setup",
    diffSummary: `Government defaults: ${DEFAULT_GOV_PHASES.length} phases, ${MANDATORY_GOV_DOCS.length} docs, compliance checklist`,
  });
}

export function cumulativeMeasuredByBoq(measurements) {
  const map = {};
  for (const entry of (measurements || []).filter((e) => e.status === "approved")) {
    if (!entry.boqId) continue;
    map[entry.boqId] = (map[entry.boqId] || 0) + Number(entry.qty || 0);
  }
  return map;
}

export function computeLiquidatedDamages(project, eotRequests = []) {
  const ldRate = Number(project?.ldRate || 0);
  if (!ldRate || !project?.completionDate) return { days: 0, amount: 0 };

  const approvedEot = (eotRequests || [])
    .filter((e) => e.status === "approved")
    .reduce((sum, e) => sum + Number(e.daysApproved || 0), 0);

  const contractEnd = new Date(project.completionDate);
  contractEnd.setDate(contractEnd.getDate() + approvedEot);
  const today = new Date();
  const delayMs = today - contractEnd;
  const delayDays = delayMs > 0 ? Math.ceil(delayMs / (1000 * 60 * 60 * 24)) : 0;
  return { days: delayDays, amount: delayDays * ldRate, approvedEotDays: approvedEot };
}

export function computeIpcDraft({
  project,
  boqItems,
  measurements,
  previousIpcs,
  ldDays = 0,
  taxPercent = 0,
  otherDeductions = 0,
}) {
  const retentionPct = Number(project?.retentionPercent ?? 10);
  const ldRate = Number(project?.ldRate || 0);
  const measured = cumulativeMeasuredByBoq(measurements);

  const approvedIpcs = (previousIpcs || []).filter(
    (b) => b.status === "approved" || b.status === "certified"
  );
  let prevCertified = 0;
  for (const b of approvedIpcs) {
    prevCertified = Math.max(prevCertified, Number(b.cumulativeCertified || 0));
  }

  const prevQtyByBoq = {};
  for (const ipc of approvedIpcs) {
    for (const line of ipc._lines || []) {
      prevQtyByBoq[line.boqId] = Math.max(
        prevQtyByBoq[line.boqId] || 0,
        Number(line.cumulativeQty || 0)
      );
    }
  }

  const lines = [];
  let thisBill = 0;
  let grossAmount = 0;

  for (const boq of boqItems || []) {
    const rate = Number(boq.rate || 0);
    const cumulativeQty = measured[boq.id] || 0;
    const prevQty = prevQtyByBoq[boq.id] || 0;
    const thisQty = Math.max(0, cumulativeQty - prevQty);
    const amount = thisQty * rate;
    if (thisQty <= 0 && prevQty <= 0) continue;
    grossAmount += cumulativeQty * rate;
    thisBill += amount;
    lines.push({
      boqId: boq.id,
      itemCode: boq.itemCode || "",
      description: boq.item,
      unit: boq.unit || "",
      rate,
      prevQty,
      thisQty,
      cumulativeQty,
      amount,
    });
  }

  const retentionAmount = (thisBill * retentionPct) / 100;
  const ldAmount = ldDays * ldRate;
  const taxAmount = (thisBill * taxPercent) / 100;
  const netPayable = Math.max(0, thisBill - retentionAmount - ldAmount - taxAmount - otherDeductions);
  const cumulativeCertified = prevCertified + thisBill;

  return {
    lines,
    prevCertified,
    thisBill,
    cumulativeCertified,
    grossAmount,
    retentionAmount,
    ldAmount,
    taxAmount,
    otherDeductions,
    netPayable,
    retentionPct,
  };
}

export function computeRetentionBalance(ledgerEntries) {
  let held = 0;
  let released = 0;
  for (const e of ledgerEntries || []) {
    if (e.entryType === "hold") held += Number(e.amount || 0);
    if (e.entryType === "release") released += Number(e.amount || 0);
  }
  return { held, released, balance: held - released };
}

export function computeProjectKpis({
  project,
  boqItems,
  measurements,
  ipcBills,
  retentionLedger,
  eotRequests,
  milestones,
}) {
  const contractValue = Number(project?.contractValue || 0);
  const boqTotal = (boqItems || []).reduce((s, b) => s + boqLineAmount(b), 0);
  const budgetBase = contractValue > 0 ? contractValue : boqTotal;

  const measured = cumulativeMeasuredByBoq(measurements);
  let physicalQty = 0;
  let contractQty = 0;
  for (const b of boqItems || []) {
    const cq = Number(b.contractQty || b.qty || 0);
    contractQty += cq;
    physicalQty += Math.min(measured[b.id] || 0, cq);
  }
  const physicalPct = contractQty > 0 ? Math.round((physicalQty / contractQty) * 100) : 0;

  const certified = (ipcBills || [])
    .filter((b) => b.status === "approved" || b.status === "certified")
    .reduce((max, b) => Math.max(max, Number(b.cumulativeCertified || 0)), 0);
  const financialPct = budgetBase > 0 ? Math.round((certified / budgetBase) * 100) : 0;

  const { balance: retentionHeld } = computeRetentionBalance(retentionLedger);
  const openIpcs = (ipcBills || []).filter((b) => b.status === "draft" || b.status === "submitted").length;
  const ld = computeLiquidatedDamages(project, eotRequests);

  let scheduleSlip = 0;
  for (const m of milestones || []) {
    if (m.plannedDate && m.actualDate) {
      const slip = Math.ceil(
        (new Date(m.actualDate) - new Date(m.plannedDate)) / (1000 * 60 * 60 * 24)
      );
      if (slip > scheduleSlip) scheduleSlip = slip;
    }
  }

  return {
    contractValue: budgetBase,
    physicalPct,
    financialPct,
    certified,
    retentionHeld,
    openIpcs,
    ldDays: ld.days,
    ldAmount: ld.amount,
    scheduleSlip,
    boqLineCount: (boqItems || []).length,
    pendingEot: (eotRequests || []).filter((e) => e.status === "submitted").length,
  };
}

export async function postIpcPaymentVoucher({ projectId, ipcBill, projectName }) {
  const amount = Number(ipcBill.netPayable || 0);
  if (amount <= 0) return null;
  const json = await postManualVoucherClient({
    amount,
    debit: "acc_cash",
    credit: "acc_project_income",
    date: ipcBill.billDate || new Date().toISOString().slice(0, 10),
    narration: `IPC ${ipcBill.billNo || ipcBill.id} payment — ${projectName || projectId}`,
  });
  return json.voucherNo || json;
}

export function parseBoqCsv(text) {
  const lines = text.trim().split(/\r?\n/).filter(Boolean);
  if (!lines.length) return [];
  const header = lines[0].split(",").map((h) => h.trim().toLowerCase());
  const idx = (name) => header.indexOf(name);
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(",").map((c) => c.trim());
    if (!cols.some(Boolean)) continue;
    rows.push({
      itemCode: cols[idx("item_code")] ?? cols[0] ?? "",
      item: cols[idx("description")] ?? cols[idx("item")] ?? cols[1] ?? "",
      unit: cols[idx("unit")] ?? cols[2] ?? "",
      qty: Number(cols[idx("qty")] ?? cols[idx("contract_qty")] ?? cols[3] ?? 0),
      rate: Number(cols[idx("rate")] ?? cols[4] ?? 0),
      phaseId: cols[idx("phase_id")] ?? cols[idx("phase")] ?? "",
      revision: cols[idx("revision")] ?? "R0",
    });
  }
  return rows;
}

export function agencyReportRows({ project, kpis, ipcBills, boqItems, measurements }) {
  const measured = cumulativeMeasuredByBoq(measurements);
  const boqRows = (boqItems || []).map((b) => ({
    code: b.itemCode || "—",
    description: b.item,
    unit: b.unit || "—",
    contractQty: b.contractQty || b.qty || 0,
    measuredQty: measured[b.id] || 0,
    rate: b.rate || 0,
    amount: boqLineAmount(b),
  }));
  const ipcRows = (ipcBills || []).map((b) => ({
    billNo: b.billNo || b.id,
    date: b.billDate || "—",
    thisBill: b.thisBill || 0,
    netPayable: b.netPayable || 0,
    status: b.status,
  }));
  return {
    projectName: project?.name || "—",
    agency: project?.employerAgency || "—",
    workOrder: project?.workOrderNo || "—",
    kpis,
    boqRows,
    ipcRows,
  };
}
