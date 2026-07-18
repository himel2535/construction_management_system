/** Supplier / payables helpers */

export const SUPPLIER_TYPES = [
  { id: "material", label: "Material" },
  { id: "subcontract", label: "Subcontract" },
  { id: "equipment", label: "Equipment" },
  { id: "service", label: "Service" },
];

export const SUPPLIER_STATUSES = ["active", "inactive"];

export const PAYMENT_METHODS = [
  { id: "cash", label: "Cash" },
  { id: "bank", label: "Bank transfer" },
  { id: "cheque", label: "Cheque" },
  { id: "mobile", label: "Mobile banking" },
];

export function supplierTypeLabel(type) {
  return SUPPLIER_TYPES.find((t) => t.id === type)?.label || type || "Material";
}

export function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

export function addDays(dateStr, days) {
  const d = new Date(dateStr || todayISO());
  d.setDate(d.getDate() + Number(days || 0));
  return d.toISOString().slice(0, 10);
}

export function computeBillBalance(bill) {
  const amount = Number(bill.amount || 0);
  const paid = Number(bill.paidAmount || 0);
  return Math.max(0, amount - paid);
}

export function computeBillStatus(bill, today = todayISO()) {
  const balance = computeBillBalance(bill);
  if (balance <= 0) return "paid";
  const paid = Number(bill.paidAmount || 0);
  if (paid > 0) {
    if (bill.dueDate && bill.dueDate < today) return "overdue";
    return "partial";
  }
  if (bill.status === "draft") return "draft";
  if (bill.dueDate && bill.dueDate < today) return "overdue";
  return "approved";
}

export function aggregateSupplierStats(supplierId, bills) {
  const mine = bills.filter((b) => b.supplierId === supplierId);
  let totalBilled = 0;
  let totalPaid = 0;
  let outstanding = 0;
  let overdue = 0;
  let lastTxn = 0;
  const today = todayISO();
  for (const b of mine) {
    const amt = Number(b.amount || 0);
    const paid = Number(b.paidAmount || 0);
    const bal = computeBillBalance(b);
    totalBilled += amt;
    totalPaid += paid;
    outstanding += bal;
    if (computeBillStatus(b, today) === "overdue") overdue += bal;
    lastTxn = Math.max(lastTxn, b.updatedAt || 0);
  }
  return { totalBilled, totalPaid, outstanding, overdue, billCount: mine.length, lastTxn };
}

export function supplierInitials(name) {
  const parts = String(name || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (!parts.length) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function countSuppliersByType(suppliers) {
  const counts = { all: suppliers.length };
  for (const t of SUPPLIER_TYPES) counts[t.id] = 0;
  for (const s of suppliers) {
    const type = s.type || "material";
    if (counts[type] !== undefined) counts[type] += 1;
  }
  return counts;
}

export function aggregatePageKpis(suppliers, bills, payments) {
  const today = todayISO();
  const ym = today.slice(0, 7);
  const monthStart = `${ym}-01`;
  const prevMonth = new Date(today);
  prevMonth.setMonth(prevMonth.getMonth() - 1);
  const prevYm = prevMonth.toISOString().slice(0, 7);
  const lastMonthStart = `${prevYm}-01`;
  const lastMonthEnd = `${ym}-01`;

  let totalOutstanding = 0;
  let overdueAmount = 0;
  let overdueBillCount = 0;
  let paidThisMonth = 0;
  let paidLastMonth = 0;
  const outstandingSupplierIds = new Set();
  const overdueSupplierIds = new Set();

  for (const b of bills) {
    const bal = computeBillBalance(b);
    if (bal <= 0) continue;
    totalOutstanding += bal;
    if (b.supplierId) outstandingSupplierIds.add(b.supplierId);
    if (computeBillStatus(b, today) === "overdue") {
      overdueAmount += bal;
      overdueBillCount += 1;
      if (b.supplierId) overdueSupplierIds.add(b.supplierId);
    }
  }
  for (const p of payments) {
    const d = p.paymentDate || "";
    const amt = Number(p.amount || 0);
    if (d >= monthStart) paidThisMonth += amt;
    else if (d >= lastMonthStart && d < lastMonthEnd) paidLastMonth += amt;
  }
  const activeSuppliers = suppliers.filter((s) => (s.status || "active") === "active").length;
  let paidMonthDeltaPct = 0;
  if (paidLastMonth > 0) {
    paidMonthDeltaPct = Math.round(((paidThisMonth - paidLastMonth) / paidLastMonth) * 100);
  } else if (paidThisMonth > 0) paidMonthDeltaPct = 100;

  return {
    supplierCount: suppliers.length,
    activeSuppliers,
    totalOutstanding,
    overdueAmount,
    overdueCount: overdueBillCount,
    overdueSupplierCount: overdueSupplierIds.size,
    outstandingSupplierCount: outstandingSupplierIds.size,
    paidThisMonth,
    paidLastMonth,
    paidMonthDeltaPct,
    paidMonthSubtext: formatKpiPaidSubtext(paidThisMonth, paidLastMonth, paidMonthDeltaPct),
  };
}

export function formatKpiPaidSubtext(paidThisMonth, paidLastMonth, deltaPct) {
  if (paidThisMonth <= 0 && paidLastMonth <= 0) return "No payments yet";
  const sign = deltaPct >= 0 ? "+" : "";
  return `${sign}${deltaPct}% from last month`;
}

/** Unallocated payment amounts (advance / on-account) for a supplier */
export function computeAdvanceBalance(supplierId, payments) {
  let advance = 0;
  for (const p of payments.filter((x) => x.supplierId === supplierId)) {
    const amt = Number(p.amount || 0);
    if (p.paymentType === "advance" || !(p.allocations || []).length) {
      const allocated = (p.allocations || []).reduce((s, a) => s + Number(a.amount || 0), 0);
      advance += Math.max(0, amt - allocated);
    }
  }
  return advance;
}

/** Ledger rows for statement CSV: date, type, ref, project, debit, credit, balance */
export function buildStatementRows(supplierId, bills, payments, projects) {
  const projectName = (pid) => projects.find((p) => p.id === pid)?.name || "—";
  const entries = [];
  for (const b of bills.filter((x) => x.supplierId === supplierId)) {
    entries.push({
      sortKey: b.billDate || "",
      date: b.billDate || "",
      type: "Bill",
      ref: b.billNo || b.id,
      project: projectName(b.projectId),
      debit: Number(b.amount || 0),
      credit: 0,
    });
    const paid = Number(b.paidAmount || 0);
    if (paid > 0) {
      entries.push({
        sortKey: b.billDate || "",
        date: b.billDate || "",
        type: "Payment on bill",
        ref: b.billNo || b.id,
        project: projectName(b.projectId),
        debit: 0,
        credit: paid,
      });
    }
  }
  for (const p of payments.filter((x) => x.supplierId === supplierId)) {
    const allocated = (p.allocations || []).reduce((s, a) => s + Number(a.amount || 0), 0);
    const amt = Number(p.amount || 0);
    if (amt > allocated || p.paymentType === "advance") {
      entries.push({
        sortKey: p.paymentDate || "",
        date: p.paymentDate || "",
        type: p.paymentType === "advance" ? "Advance" : "Payment",
        ref: p.reference || p.id?.slice(0, 8) || "",
        project: "—",
        debit: 0,
        credit: amt,
      });
    }
  }
  entries.sort((a, b) => (a.sortKey || "").localeCompare(b.sortKey || ""));
  let balance = 0;
  return entries.map((e) => {
    balance += e.debit - e.credit;
    return { ...e, balance };
  });
}

export const ACTIVITY_ACTION_LABELS = {
  create: "Created",
  update: "Updated",
  delete: "Deleted",
  approve: "Approved",
  pay: "Payment recorded",
};

export function lastPaymentForSupplier(supplierId, payments) {
  const mine = payments
    .filter((p) => p.supplierId === supplierId)
    .sort((a, b) => (b.paymentDate || "").localeCompare(a.paymentDate || ""));
  return mine[0] || null;
}

export function buildRecentTransactions(supplierId, bills, payments, projects, limit = 8) {
  const projectName = (pid) => projects.find((p) => p.id === pid)?.name || "—";
  const today = todayISO();
  const rows = [];

  for (const b of bills.filter((x) => x.supplierId === supplierId)) {
    const st = computeBillStatus(b, today);
    const bal = computeBillBalance(b);
    rows.push({
      sortKey: b.billDate || "",
      date: b.billDate || "—",
      type: "Bill",
      ref: b.billNo || b.id,
      refId: b.id,
      projectName: projectName(b.projectId),
      amount: Number(b.amount || 0),
      status: bal <= 0 ? "paid" : st,
      entityType: "bill",
    });
  }
  for (const p of payments.filter((x) => x.supplierId === supplierId)) {
    rows.push({
      sortKey: p.paymentDate || "",
      date: p.paymentDate || "—",
      type: "Payment",
      ref: p.reference || p.chequeNo || p.id?.slice(0, 8) || "—",
      refId: p.id,
      projectName: "—",
      amount: Number(p.amount || 0),
      status: "paid",
      entityType: "payment",
    });
  }
  return rows
    .sort((a, b) => (b.sortKey || "").localeCompare(a.sortKey || ""))
    .slice(0, limit);
}

export function paginateSlice(list, page, pageSize) {
  const total = list.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(Math.max(1, page), totalPages);
  const start = (safePage - 1) * pageSize;
  return {
    items: list.slice(start, start + pageSize),
    page: safePage,
    pageSize,
    total,
    totalPages,
    rangeStart: total ? start + 1 : 0,
    rangeEnd: Math.min(start + pageSize, total),
  };
}

export function formatSinceDate(ts) {
  if (!ts) return "—";
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-GB", { month: "short", year: "numeric" });
}

export function aggregateByProject(bills, projects) {
  const byProject = new Map();
  for (const b of bills) {
    const pid = b.projectId || "";
    if (!pid) continue;
    const cur = byProject.get(pid) || { projectId: pid, billed: 0, paid: 0, outstanding: 0 };
    cur.billed += Number(b.amount || 0);
    cur.paid += Number(b.paidAmount || 0);
    cur.outstanding += computeBillBalance(b);
    byProject.set(pid, cur);
  }
  return [...byProject.values()]
    .map((row) => ({
      ...row,
      projectName: projects.find((p) => p.id === row.projectId)?.name || row.projectId,
    }))
    .sort((a, b) => b.outstanding - a.outstanding);
}

export function agingBuckets(bills, today = todayISO()) {
  const buckets = {
    current: { label: "0–30 days", amount: 0, count: 0 },
    d31_60: { label: "31–60 days", amount: 0, count: 0 },
    d61_90: { label: "61–90 days", amount: 0, count: 0 },
    d90plus: { label: "90+ days", amount: 0, count: 0 },
  };
  for (const b of bills) {
    const bal = computeBillBalance(b);
    if (bal <= 0) continue;
    const due = b.dueDate || b.billDate || today;
    const days = Math.floor((new Date(today) - new Date(due)) / 86400000);
    let key = "current";
    if (days > 90) key = "d90plus";
    else if (days > 60) key = "d61_90";
    else if (days > 30) key = "d31_60";
    buckets[key].amount += bal;
    buckets[key].count += 1;
  }
  return buckets;
}

export function vendorToSupplier(vendor) {
  return {
    name: vendor.name || "Unnamed vendor",
    code: "",
    type: "material",
    status: "active",
    phone: vendor.phone || "",
    email: "",
    contactPerson: "",
    address: vendor.address || "",
    city: "",
    tin: "",
    binVat: "",
    bankName: "",
    accountNo: "",
    branch: "",
    paymentMethod: "bank",
    paymentTermsDays: 30,
    creditLimit: 0,
    defaultCostCategory: "material",
    remarks: "",
    migratedFromVendor: true,
    createdAt: vendor.createdAt || Date.now(),
    updatedAt: Date.now(),
  };
}

export function normalizeSupplier(row) {
  return {
    ...row,
    type: row.type || "material",
    status: row.status || "active",
    paymentTermsDays: Number(row.paymentTermsDays ?? 30),
    creditLimit: Number(row.creditLimit || 0),
  };
}
