/** Supplier master, bills, payments, AP integration */

import { db, ref, set } from "./firebase.js";
import { create, updatePath, readRef, removePath } from "./svc_data.js";
import { getActiveTenantId } from "./svc_tenant.js";
import { getCurrentUserId, getCurrentUserName } from "./svc_auth.js";
import { writeAuditLog } from "./svc_workflow.js";
import { postSupplierBillClient, postSupplierPaymentClient } from "./svc_firebaseOps.js";
import {
  addDays,
  computeBillBalance,
  computeBillStatus,
  todayISO,
  vendorToSupplier,
  normalizeSupplier,
} from "./util_supplier.js";

function supplierDbRef(id) {
  return ref(db, `tenantData/${getActiveTenantId()}/suppliers/${id}`);
}

export async function upsertSupplier(id, data) {
  const now = Date.now();
  await set(supplierDbRef(id), {
    ...data,
    tenantId: getActiveTenantId(),
    source: data.source || "live",
    updatedAt: now,
    createdAt: data.createdAt ?? now,
  });
  return id;
}

export async function createSupplier(data) {
  const id = await create("suppliers", {
    ...data,
    status: data.status || "active",
    type: data.type || "material",
    paymentTermsDays: Number(data.paymentTermsDays ?? 30),
    createdBy: getCurrentUserId(),
  });
  await writeAuditLog({
    entityType: "supplier",
    entityId: id,
    action: "create",
    diffSummary: `Created supplier ${data.name}`,
  });
  return id;
}

export async function updateSupplier(id, data) {
  const cur = readRef(`suppliers/${id}`) || {};
  await updatePath(`suppliers/${id}`, { ...cur, ...data });
  await writeAuditLog({
    entityType: "supplier",
    entityId: id,
    action: "update",
    diffSummary: `Updated supplier ${data.name || cur.name}`,
  });
}

export async function migrateVendorsToSuppliers(vendors, suppliers) {
  const existingIds = new Set(suppliers.map((s) => s.id));
  for (const v of vendors) {
    if (existingIds.has(v.id)) continue;
    await upsertSupplier(v.id, {
      ...vendorToSupplier(v),
      createdBy: getCurrentUserId(),
    });
  }
}

export function mergeSupplierLists(vendors, suppliers) {
  const byId = new Map();
  for (const s of suppliers.map(normalizeSupplier)) byId.set(s.id, s);
  for (const v of vendors) {
    if (!byId.has(v.id)) {
      byId.set(v.id, { id: v.id, ...vendorToSupplier(v) });
    }
  }
  return [...byId.values()].sort((a, b) => (a.name || "").localeCompare(b.name || ""));
}

function nextBillNo(existingCount = 0) {
  return `BILL-${String(existingCount + 1).padStart(4, "0")}`;
}

export async function createSupplierBill(payload, { autoApprove = false, billCount = 0 } = {}) {
  if (!payload.supplierId) throw new Error("Supplier is required");
  const supplier = readRef(`suppliers/${payload.supplierId}`);
  if (!supplier?.name && !payload.supplierName) throw new Error("Supplier not found");

  const terms = Number(payload.paymentTermsDays ?? 30);
  const billDate = payload.billDate || todayISO();
  const amount = Number(payload.amount);
  if (!amount || amount <= 0) throw new Error("Bill amount must be positive");

  const billNo = payload.billNo || nextBillNo(billCount);
  if (payload.billNo) {
    const existing = readRef("supplierBills");
    const rows =
      existing && typeof existing === "object"
        ? Object.entries(existing).map(([id, row]) =>
            typeof row === "object" && row ? { id, ...row } : { id, billNo: row }
          )
        : [];
    const dup = rows.some(
      (b) => b.supplierId === payload.supplierId && b.billNo === billNo && b.status !== "cancelled"
    );
    if (dup) throw new Error(`Bill number ${billNo} already exists for this supplier`);
  }

  const billId = await create("supplierBills", {
    supplierId: payload.supplierId,
    supplierName: payload.supplierName || "",
    projectId: payload.projectId || "",
    billNo,
    billDate,
    dueDate: payload.dueDate || addDays(billDate, terms),
    amount,
    paidAmount: 0,
    balance: amount,
    status: "draft",
    sourceType: payload.sourceType || "manual",
    sourceRef: payload.sourceRef || null,
    costCategory: payload.costCategory || "material",
    narration: payload.narration || "",
    createdBy: getCurrentUserId(),
  });

  if (autoApprove) {
    await approveSupplierBill(billId);
  }
  return billId;
}

export async function approveSupplierBill(billId) {
  const bill = readRef(`supplierBills/${billId}`);
  if (!bill) throw new Error("Bill not found");
  if (bill.status !== "draft") throw new Error("Only draft bills can be approved");
  const amount = Number(bill.amount || 0);
  if (amount <= 0) throw new Error("Invalid bill amount");

  await postSupplierBillClient({
    projectId: bill.projectId,
    amount,
    costCategory: bill.costCategory || "material",
    narration: bill.narration || `Supplier bill ${bill.billNo || billId}`,
    supplierId: bill.supplierId,
    supplierName: bill.supplierName,
    billId,
    date: bill.billDate,
  });

  await updatePath(`supplierBills/${billId}`, {
    ...bill,
    status: "approved",
    balance: computeBillBalance({ ...bill, paidAmount: bill.paidAmount || 0 }),
    approvedBy: getCurrentUserId(),
    approvedAt: Date.now(),
  });

  await writeAuditLog({
    entityType: "supplierBill",
    entityId: billId,
    action: "approve",
    projectId: bill.projectId,
    diffSummary: `Approved bill ${bill.billNo || billId} — ${amount}`,
  });
}

export async function recordSupplierPayment({
  supplierId,
  supplierName,
  amount,
  method,
  paymentDate,
  reference,
  chequeNo,
  allocations,
  narration,
  paymentType = "allocated",
}) {
  const payAmount = Number(amount);
  if (!payAmount || payAmount <= 0) throw new Error("Payment amount must be positive");

  const allocs = allocations || [];
  const isAdvance = paymentType === "advance" || allocs.length === 0;
  if (!isAdvance && !allocs.length) {
    throw new Error("No open bills to allocate — use advance payment instead");
  }

  const paymentId = await create("supplierPayments", {
    supplierId,
    supplierName: supplierName || "",
    paymentDate: paymentDate || todayISO(),
    amount: payAmount,
    method: method || "bank",
    reference: reference || "",
    chequeNo: chequeNo || "",
    allocations: allocs,
    paymentType: isAdvance ? "advance" : "allocated",
    narration: narration || (isAdvance ? `Advance to ${supplierName}` : `Payment to ${supplierName}`),
    createdBy: getCurrentUserId(),
  });

  await postSupplierPaymentClient({
    amount: payAmount,
    method: method || "bank",
    narration: narration || (isAdvance ? `Advance to ${supplierName}` : `Payment to ${supplierName}`),
    supplierId,
    supplierName,
    paymentId,
    date: paymentDate || todayISO(),
  });

  for (const alloc of allocs) {
    const bill = readRef(`supplierBills/${alloc.billId}`);
    if (!bill) continue;
    const paid = Number(bill.paidAmount || 0) + Number(alloc.amount || 0);
    const balance = Math.max(0, Number(bill.amount || 0) - paid);
    const status = balance <= 0 ? "paid" : paid > 0 ? "partial" : bill.status;
    await updatePath(`supplierBills/${alloc.billId}`, {
      ...bill,
      paidAmount: paid,
      balance,
      status,
    });
  }

  await writeAuditLog({
    entityType: "supplierPayment",
    entityId: paymentId,
    action: "create",
    diffSummary: `${isAdvance ? "Advance" : "Payment"} ${payAmount} to ${supplierName}`,
  });
  return paymentId;
}

export function openBillsForSupplier(supplierId, bills) {
  const today = todayISO();
  return bills
    .filter((b) => b.supplierId === supplierId && computeBillBalance(b) > 0)
    .map((b) => ({ ...b, balance: computeBillBalance(b), displayStatus: computeBillStatus(b, today) }))
    .sort((a, b) => (a.dueDate || "").localeCompare(b.dueDate || ""));
}

export function computeProjectSupplierOutstanding(projectId, bills) {
  return bills
    .filter((b) => b.projectId === projectId)
    .reduce((sum, b) => sum + computeBillBalance(b), 0);
}

export function allocatePaymentFifo(amount, openBills) {
  let remaining = Number(amount);
  const allocations = [];
  for (const b of openBills) {
    if (remaining <= 0) break;
    const take = Math.min(remaining, b.balance);
    if (take > 0) {
      allocations.push({ billId: b.id, amount: take });
      remaining -= take;
    }
  }
  return { allocations, unallocated: remaining };
}

export async function createSupplierProduct(supplierId, data) {
  const id = await create(`supplierProducts/${supplierId}`, {
    ...data,
    status: data.status || "active",
    rate: Number(data.rate || 0),
    createdBy: getCurrentUserId(),
  });
  await writeAuditLog({
    entityType: "supplier",
    entityId: supplierId,
    action: "create",
    diffSummary: `Added product ${data.name}`,
  });
  return id;
}

export async function updateSupplierProduct(supplierId, productId, data) {
  const cur = readRef(`supplierProducts/${supplierId}/${productId}`) || {};
  await updatePath(`supplierProducts/${supplierId}/${productId}`, { ...cur, ...data });
  await writeAuditLog({
    entityType: "supplier",
    entityId: supplierId,
    action: "update",
    diffSummary: `Updated product ${data.name || cur.name}`,
  });
}

export async function deleteSupplierProduct(supplierId, productId) {
  const cur = readRef(`supplierProducts/${supplierId}/${productId}`) || {};
  await removePath(`supplierProducts/${supplierId}/${productId}`);
  await writeAuditLog({
    entityType: "supplier",
    entityId: supplierId,
    action: "delete",
    diffSummary: `Removed product ${cur.name || productId}`,
  });
}

export async function createSupplierDocument(supplierId, data) {
  const id = await create(`supplierDocuments/${supplierId}`, {
    ...data,
    status: data.status || "draft",
    createdBy: getCurrentUserId(),
  });
  await writeAuditLog({
    entityType: "supplier",
    entityId: supplierId,
    action: "create",
    diffSummary: `Added document ${data.title}`,
  });
  return id;
}

export async function createSupplierNote(supplierId, body) {
  const id = await create(`supplierNotes/${supplierId}`, {
    body: String(body || "").trim(),
    authorId: getCurrentUserId(),
    authorName: getCurrentUserName() || "User",
  });
  await writeAuditLog({
    entityType: "supplier",
    entityId: supplierId,
    action: "create",
    diffSummary: "Added note",
  });
  return id;
}
